import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import {
  attachAssetToBatch,
  countSha256ByOwner,
  getAssetByToken,
  getBatchById,
  getBatchAssets,
  pool,
  getBatchSlotForMinuteBucket,
  ensureFollowingBatchPrepared,
  listBatchesReadyForMerkleFlush,
  listAssetsByOwner,
  listRecentAssets,
  listRecentBatches,
  listPhashCandidates,
  markBatchFailed,
  updateAssetVerification,
  insertAsset,
  BATCH_MERKLE_IMMEDIATE_AT_COUNT,
} from "./db.js";
import { getBestDuplicateScore } from "./phash.js";
import {
  buildMerkleTree,
  createAssetLeafHash,
  verifyMerkleProof,
} from "./merkle.js";
import { shouldRunBatchScheduler, touchBatchActivity } from "./batchActivity.js";

const verifyBaseUrl = process.env.VERIFY_BASE_URL || "https://verify.verity.app/v";
const corsOrigin = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((v) => v.trim());

/**
 * pending 배치 행을 잠근 뒤 머클을 만들고 sent 처리합니다.
 * FOR UPDATE 로 동시 finalize·인제스트(같은 batch 행 UPDATE)를 직렬화합니다.
 */
async function finalizePendingBatchMerkle(batchId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lockRes = await client.query(
      `SELECT * FROM onchain_minute_batches WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [batchId]
    );
    const batch = lockRes.rows[0];
    if (!batch || Number(batch.item_count) === 0) {
      await client.query("COMMIT");
      return;
    }

    const assetsRes = await client.query(
      `SELECT * FROM assets WHERE batch_id = $1 ORDER BY captured_timestamp_ms ASC`,
      [batchId]
    );
    const batchAssets = assetsRes.rows;
    if (batchAssets.length === 0) {
      await client.query("ROLLBACK");
      await markBatchFailed(batchId);
      return;
    }

    const leafHashes = batchAssets.map((row) => createAssetLeafHash(row));
    const merkle = buildMerkleTree(leafHashes);
    const bnRes = await client.query(
      `SELECT COALESCE(MAX(block_number), 0) + 1 AS n FROM onchain_minute_batches`
    );
    const blockNumber = Number(bnRes.rows[0]?.n ?? 1);
    const mockTxHash = `vrt_batch_${Date.now()}_${String(batchId).slice(0, 8)}`;
    const onchainTimestampMs = Date.now();

    const upd = await client.query(
      `
        UPDATE onchain_minute_batches
        SET status = 'sent',
            tx_hash = $2,
            block_number = $3,
            merkle_root = $4,
            onchain_timestamp_ms = $5,
            sent_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING id
      `,
      [batchId, mockTxHash, blockNumber, merkle.root, onchainTimestampMs]
    );

    if (upd.rowCount === 0) {
      await client.query("ROLLBACK");
      return;
    }

    await client.query(
      `UPDATE assets SET onchain_timestamp_ms = $2, chain_verified = FALSE WHERE batch_id = $1`,
      [batchId, onchainTimestampMs]
    );

    for (let index = 0; index < batchAssets.length; index++) {
      const row = batchAssets[index];
      await client.query(
        `
          UPDATE assets
          SET indexed_block_number = $2,
              merkle_leaf_hash = $3,
              merkle_proof_json = $4::jsonb,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          row.id,
          blockNumber,
          leafHashes[index],
          JSON.stringify(merkle.proofs[index] ?? []),
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    client.release();
  }
}

// [각주1] Express 앱은 실행 환경(로컬 서버/서버리스)과 분리해 재사용합니다.
export function createApp() {
  const app = express();
  const adminToken = asString(process.env.ADMIN_TOKEN);
  const onePerSecondAssetGuard = createRequestIntervalGuard({
    intervalMs: 1000,
    keyResolver: (req) => {
      const owner = asString(req.body?.owner);
      const ip = getClientIp(req);
      return `assets:${owner || "unknown-owner"}:${ip}`;
    },
    message: "사진 등록 요청은 1초에 1회만 가능합니다.",
  });
  const onePerSecondAntiSpoofGuard = createRequestIntervalGuard({
    intervalMs: 1000,
    keyResolver: (req) => `anti-spoof:${getClientIp(req)}`,
    message: "사진 검증 요청은 1초에 1회만 가능합니다.",
  });
  const onePerSecondSha256IngestGuard = createRequestIntervalGuard({
    intervalMs: 1000,
    keyResolver: (req) => {
      const owner = asString(req.body?.owner);
      const ip = getClientIp(req);
      return `ingest-sha256:${owner || "unknown-owner"}:${ip}`;
    },
    message: "SHA-256 제출은 1초에 1회만 가능합니다.",
  });

  const uploadPerMinuteByIp = createSlidingWindowRateLimit({
    windowMs: Number(process.env.UPLOAD_RATE_WINDOW_MS || 60_000),
    max: Math.max(1, Number(process.env.UPLOAD_RATE_LIMIT_PER_MINUTE || 3)),
    keyResolver: (req) => `upload-ip:${getClientIp(req)}`,
  });

  app.use(cors({ origin: corsOrigin.includes("*") ? true : corsOrigin }));
  app.use(express.json({ limit: "10mb" }));
  app.use((req, res, next) => {
    if (
      req.method === "POST" &&
      (req.path === "/v1/assets" || req.path === "/v1/ingest/sha256")
    ) {
      touchBatchActivity();
    }
    next();
  });
  app.use(["/admin", "/v1/admin"], createAdminAuthMiddleware(adminToken));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "verity-server" });
  });

  app.get("/v1/admin/health", (_req, res) => {
    res.json({ ok: true, service: "verity-server-admin" });
  });

  // [각주2] Silent-Face-Anti-Spoofing 추론 서버를 호출해 스푸핑 점수를 반환합니다.
  app.post("/v1/anti-spoof/check", onePerSecondAntiSpoofGuard, async (req, res) => {
    try {
      const imageBase64 = asString(req.body?.imageBase64);
      if (!imageBase64) {
        return res.status(400).json({ message: "imageBase64가 필요합니다." });
      }

      const endpoint = asString(process.env.SILENT_FACE_API_URL);
      if (!endpoint) {
        return res.status(503).json({
          message: "SILENT_FACE_API_URL이 설정되지 않아 anti-spoof 모델을 사용할 수 없습니다.",
        });
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      if (!response.ok) {
        return res.status(502).json({ message: "anti-spoof 모델 서버 호출 실패" });
      }

      const data = await response.json();
      const spoofProbability = normalizeProbability(
        data?.spoofProbability ?? data?.spoof_prob ?? data?.score
      );
      if (spoofProbability === null) {
        return res.status(502).json({ message: "anti-spoof 응답 형식이 올바르지 않습니다." });
      }

      return res.json({
        spoofProbability,
        model: asString(data?.model) || "Silent-Face-Anti-Spoofing",
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "anti-spoof 검사 실패" });
    }
  });

  app.post(
    "/v1/assets",
    uploadPerMinuteByIp,
    onePerSecondAssetGuard,
    async (req, res) => {
    try {
      const body = req.body || {};
      const owner = asString(body.owner);
      const mode = asString(body.mode);
      const mediaType = asString(body.mediaType || "photo");

      if (!owner) return res.status(400).json({ message: "owner가 필요합니다." });
      if (!["sha256", "phash"].includes(mode)) {
        return res.status(400).json({ message: "mode는 sha256 또는 phash 이어야 합니다." });
      }
      if (!["photo", "video"].includes(mediaType)) {
        return res.status(400).json({ message: "mediaType은 photo 또는 video 이어야 합니다." });
      }

      if (mode === "sha256") {
        const used = await countSha256ByOwner(owner);
        if (used >= 1) {
          return res.status(403).json({
            message: "SHA-256 무료 온체인 등록은 사용자당 1회만 허용됩니다.",
          });
        }
      }

      const id = uuidv4();
      const token = createToken();
      const sha256 = asString(body.sha256) || null;
      const phash = asString(body.phash) || null;
      const serial = asString(body.serial) || createSerial(mode);
      const aiRiskScore = toIntOrNull(body.aiRiskScore);
      const chainTxSignature = asString(body.chainTxSignature) || null;
      const metadata = parseMaybeJson(body.metadata);
      const teeProof = parseMaybeJson(body.teeProof);
      const capturedTimestampMs = extractCapturedTimestamp(metadata, teeProof);
      const minuteBucket = minuteBucketIso(capturedTimestampMs);
      const gps = extractGps(metadata);
      const batch = await getBatchSlotForMinuteBucket(minuteBucket);

      let duplicateScore = null;
      if (mode === "phash" && phash) {
        const candidates = await listPhashCandidates(phash);
        duplicateScore = getBestDuplicateScore(phash, candidates);
      }

      const row = await insertAsset({
        id,
        token,
        serial,
        owner,
        mode,
        mediaType,
        sha256,
        phash,
        capturedTimestampMs,
        minuteBucket,
        gpsLat: gps?.lat ?? null,
        gpsLng: gps?.lng ?? null,
        batchId: batch.id,
        aiRiskScore,
        metadata,
        chainTxSignature,
        teeProof,
        chainVerified: mode === "sha256" ? !!chainTxSignature : false,
        duplicateScore,
      });
      const attached = await attachAssetToBatch(row.id, batch.id);
      await ensureFollowingBatchPrepared(attached);
      if (
        attached &&
        Number(attached.item_count) >= BATCH_MERKLE_IMMEDIATE_AT_COUNT
      ) {
        void finalizePendingBatchMerkle(attached.id).catch((err) =>
          console.error("Immediate batch finalize failed:", err)
        );
      }

      res.status(201).json(toClientRecord(row, verifyBaseUrl));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "자산 등록 실패" });
    }
  });

  // [각주3] 기기에서 계산한 SHA-256(+선택 pHash)를 받아, 서버 수신 시각 기준 1분 버킷으로 묶어 배치합니다.
  // 사진: 흑백 근사 pHash / 동영상: 구간 샘플+장면전환 키프레임은 metadata.videoPhashKeyframes 로 저장.
  // (온체인 머클 처리는 processMinuteBatches와 동일 파이프라인)
  app.post(
    "/v1/ingest/sha256",
    uploadPerMinuteByIp,
    onePerSecondSha256IngestGuard,
    async (req, res) => {
    try {
      const body = req.body || {};
      const owner = asString(body.owner);
      const sha256Raw = asString(body.sha256);
      const sha256 = sha256Raw.toLowerCase();
      const mediaType = asString(body.mediaType || "photo");
      const phashRaw = asString(body.phash);
      const phash = phashRaw ? phashRaw.toLowerCase() : null;

      if (!owner) {
        return res.status(400).json({ message: "owner가 필요합니다." });
      }
      if (!isValidSha256Hex(sha256)) {
        return res.status(400).json({ message: "sha256은 64자리 16진 문자열이어야 합니다." });
      }
      if (!["photo", "video"].includes(mediaType)) {
        return res.status(400).json({ message: "mediaType은 photo 또는 video 이어야 합니다." });
      }
      if (phash && !isValidPhashHex(phash)) {
        return res.status(400).json({ message: "phash는 16자리 16진 문자열(64비트)이어야 합니다." });
      }

      const receivedMs = Date.now();
      const minuteBucket = minuteBucketIso(receivedMs);
      const capturedTimestampMs =
        toIntOrNull(body.capturedTimestampMs) ?? receivedMs;
      const metadata = parseMaybeJson(body.metadata);
      const aiRiskScore = toIntOrNull(body.aiRiskScore);
      const ingestChannel =
        mediaType === "video"
          ? phash
            ? "sha256_phash_video"
            : "sha256_video"
          : phash
            ? "sha256_phash"
            : "sha256_only";
      const mergedMetadata =
        metadata && typeof metadata === "object"
          ? {
              ...metadata,
              ingestChannel,
              serverReceivedAtMs: receivedMs,
              batchMinuteBucket: minuteBucket,
            }
          : {
              ingestChannel,
              serverReceivedAtMs: receivedMs,
              batchMinuteBucket: minuteBucket,
            };

      const gps = extractGps(mergedMetadata);
      const batch = await getBatchSlotForMinuteBucket(minuteBucket);
      const id = uuidv4();
      const token = createToken();
      const serial = asString(body.serial) || createSerial("sha256");

      let duplicateScore = null;
      if (phash) {
        const candidates = await listPhashCandidates(phash);
        duplicateScore = getBestDuplicateScore(phash, candidates);
      }

      const row = await insertAsset({
        id,
        token,
        serial,
        owner,
        mode: "sha256",
        mediaType,
        sha256,
        phash,
        capturedTimestampMs,
        minuteBucket,
        gpsLat: gps?.lat ?? null,
        gpsLng: gps?.lng ?? null,
        batchId: batch.id,
        aiRiskScore,
        metadata: mergedMetadata,
        chainTxSignature: null,
        teeProof: null,
        chainVerified: false,
        duplicateScore,
      });
      const attached = await attachAssetToBatch(row.id, batch.id);
      await ensureFollowingBatchPrepared(attached);
      if (
        attached &&
        Number(attached.item_count) >= BATCH_MERKLE_IMMEDIATE_AT_COUNT
      ) {
        void finalizePendingBatchMerkle(attached.id).catch((err) =>
          console.error("Immediate batch finalize failed:", err)
        );
      }

      res.status(201).json(toClientRecord(row, verifyBaseUrl));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "SHA-256 수집 실패" });
    }
  });

  app.get("/v1/assets", async (req, res) => {
    try {
      const owner = asString(req.query.owner);
      if (!owner) return res.status(400).json({ message: "owner query가 필요합니다." });
      const rows = await listAssetsByOwner(owner);
      res.json(rows.map((r) => toClientRecord(r, verifyBaseUrl)));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "자산 목록 조회 실패" });
    }
  });

  app.get("/v1/admin/assets", async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
      const rows = await listRecentAssets(limit);
      res.json(rows.map((r) => toClientRecord(r, verifyBaseUrl)));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "관리자 자산 목록 조회 실패" });
    }
  });

  app.get("/v1/admin/batches", async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 30));
      const rows = await listRecentBatches(limit);
      res.json(
        rows.map((row) => ({
          id: row.id,
          minuteBucket: row.minute_bucket,
          segment: row.segment ?? 0,
          status: row.status,
          itemCount: row.item_count,
          txHash: row.tx_hash,
          blockNumber: row.block_number,
          merkleRoot: row.merkle_root,
          onchainTimestampMs: row.onchain_timestamp_ms,
          createdAt: row.created_at,
          sentAt: row.sent_at,
        }))
      );
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "관리자 배치 목록 조회 실패" });
    }
  });

  app.get("/v1/verify/:token", async (req, res) => {
    try {
      const token = asString(req.params.token);
      const row = await getAssetByToken(token);
      if (!row) return res.status(404).json({ message: "검증 토큰을 찾을 수 없습니다." });
      const merkleCheck = await verifyAssetAgainstIndexedBlock(row);
      res.json(toVerificationView(row, merkleCheck));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "검증 정보 조회 실패" });
    }
  });

  app.post("/v1/verify/:token/recheck", async (req, res) => {
    try {
      const token = asString(req.params.token);
      const row = await getAssetByToken(token);
      if (!row) return res.status(404).json({ message: "검증 토큰을 찾을 수 없습니다." });

      let duplicateScore = row.duplicate_score;
      let chainVerified = row.chain_verified;

      if (row.mode === "phash" && row.phash) {
        const candidates = await listPhashCandidates(row.phash, row.id);
        duplicateScore = getBestDuplicateScore(row.phash, candidates);
      }

      const merkleCheck = await verifyAssetAgainstIndexedBlock(row);
      chainVerified = merkleCheck.verified;

      const updated = await updateAssetVerification(token, {
        duplicateScore,
        chainVerified,
      });
      if (!updated) return res.status(404).json({ message: "검증 토큰을 찾을 수 없습니다." });
      res.json(toVerificationView(updated, merkleCheck));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "재검증 실패" });
    }
  });

  return app;
}

export async function processMinuteBatches() {
  if (!shouldRunBatchScheduler()) return;
  const due = await listBatchesReadyForMerkleFlush();
  for (const batch of due) {
    try {
      await finalizePendingBatchMerkle(batch.id);
    } catch (error) {
      console.error("Batch processing failed:", error);
      await markBatchFailed(batch.id);
    }
  }
}

function toClientRecord(row, verifyBase) {
  const verificationUrl = `${verifyBase.replace(/\/$/, "")}/${row.token}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
    verificationUrl
  )}`;
  return {
    id: row.id,
    serial: row.serial,
    owner: row.owner,
    mode: row.mode,
    mediaType: row.media_type,
    sourceUri: null,
    sha256: row.sha256,
    phash: row.phash,
    capturedTimestampMs: row.captured_timestamp_ms,
    onchainTimestampMs: row.onchain_timestamp_ms,
    indexedBlockNumber: row.indexed_block_number,
    merkleLeafHash: row.merkle_leaf_hash,
    gps: {
      lat: row.gps_lat,
      lng: row.gps_lng,
    },
    aiRiskScore: row.ai_risk_score,
    metadata: row.metadata_json,
    chainTxSignature: row.chain_tx_signature,
    teeProof: {
      keyId: row.tee_key_id,
      signature: row.tee_signature,
      payload: row.tee_payload_json,
      provider: row.tee_provider,
      verified: !!row.tee_verified,
    },
    verificationUrl,
    qrCodeUrl,
    createdAt: new Date(row.created_at).getTime(),
    duplicateScore: row.duplicate_score,
  };
}

function toVerificationView(row, merkleCheck = null) {
  return {
    token: row.token,
    serial: row.serial,
    owner: row.owner,
    mode: row.mode,
    mediaType: row.media_type,
    assetUrl: null,
    sha256: row.sha256,
    phash: row.phash,
    capturedTimestampMs: row.captured_timestamp_ms,
    onchainTimestampMs: row.onchain_timestamp_ms,
    indexedBlockNumber:
      merkleCheck?.blockNumber ?? row.indexed_block_number ?? null,
    merkleLeafHash: row.merkle_leaf_hash ?? null,
    merkleProof: row.merkle_proof_json ?? null,
    merkleRoot: merkleCheck?.storedRoot ?? null,
    computedMerkleRoot: merkleCheck?.computedRoot ?? null,
    gps: {
      lat: row.gps_lat,
      lng: row.gps_lng,
    },
    aiRiskScore: row.ai_risk_score,
    metadata: row.metadata_json,
    chainTxSignature: row.chain_tx_signature,
    teeProof: {
      keyId: row.tee_key_id,
      signature: row.tee_signature,
      payload: row.tee_payload_json,
      provider: row.tee_provider,
      verified: !!row.tee_verified,
    },
    chainVerified: merkleCheck?.verified ?? row.chain_verified,
    duplicateScore: row.duplicate_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asString(value) {
  if (typeof value === "string") return value.trim();
  return "";
}

function toIntOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.round(n);
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function createToken() {
  return uuidv4().replace(/-/g, "");
}

function createSerial(mode) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const suffix = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `VRT-${mode.toUpperCase()}-${yyyy}${mm}${dd}-${suffix}`;
}

function extractCapturedTimestamp(metadata, teeProof) {
  const m = metadata && typeof metadata === "object" ? metadata : {};
  const fromMeta = Number(m.captureTimestamp || m.capturedTimestampMs);
  if (!Number.isNaN(fromMeta) && fromMeta > 0) return Math.round(fromMeta);

  const payloadTs = Number(teeProof?.payload?.timestamp);
  if (!Number.isNaN(payloadTs) && payloadTs > 0) return Math.round(payloadTs);

  return Date.now();
}

function extractGps(metadata) {
  const m = metadata && typeof metadata === "object" ? metadata : {};
  const lat = Number(m.gpsLat ?? m.gps?.lat);
  const lng = Number(m.gpsLng ?? m.gps?.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

function minuteBucketIso(tsMs) {
  const d = new Date(tsMs);
  d.setSeconds(0, 0);
  return d.toISOString();
}

function isValidSha256Hex(value) {
  return /^[0-9a-f]{64}$/.test(asString(value).toLowerCase());
}

/** 앱 pHash: 64비트 → 16 hex nibbles */
function isValidPhashHex(value) {
  return /^[0-9a-f]{16}$/.test(asString(value).toLowerCase());
}

function normalizeProbability(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function createAdminAuthMiddleware(expectedToken) {
  return function adminAuthMiddleware(req, res, next) {
    if (!expectedToken) {
      return res.status(503).json({
        message: "ADMIN_TOKEN이 설정되지 않아 admin 경로를 사용할 수 없습니다.",
      });
    }

    const headerToken = getHeaderString(req.headers["x-admin-token"]);
    const bearerToken = extractBearerToken(req.headers.authorization);
    const providedToken = headerToken || bearerToken;

    if (providedToken !== expectedToken) {
      return res.status(401).json({ message: "관리자 인증이 필요합니다." });
    }

    return next();
  };
}

function extractBearerToken(authorizationHeader) {
  const value = getHeaderString(authorizationHeader);
  if (!value) return "";
  const [scheme, token] = value.split(/\s+/, 2);
  if (!scheme || !token) return "";
  if (scheme.toLowerCase() !== "bearer") return "";
  return token.trim();
}

function getHeaderString(headerValue) {
  if (Array.isArray(headerValue)) {
    return asString(headerValue[0]);
  }
  return asString(headerValue);
}

function createRequestIntervalGuard({ intervalMs, keyResolver, message }) {
  const lastRequestAt = new Map();

  return function requestIntervalGuard(req, res, next) {
    const key = asString(keyResolver(req)) || "global";
    const now = Date.now();
    const last = lastRequestAt.get(key) || 0;
    const diff = now - last;

    if (diff < intervalMs) {
      const retryAfterMs = intervalMs - diff;
      return res.status(429).json({
        message,
        retryAfterMs,
      });
    }

    lastRequestAt.set(key, now);
    return next();
  };
}

/** 슬라이딩 윈도우: windowMs 안에 최대 max회 (IP당 업로드 등) */
function createSlidingWindowRateLimit({ windowMs, max, keyResolver, message }) {
  const hits = new Map();
  const defaultMessage = `같은 IP에서 업로드(등록)는 ${max}회/${Math.round(windowMs / 1000)}초 내로만 가능합니다.`;

  return function slidingWindowRateLimit(req, res, next) {
    const key = asString(keyResolver(req)) || "global";
    const now = Date.now();
    let list = hits.get(key);
    if (!list) {
      list = [];
      hits.set(key, list);
    }
    const cutoff = now - windowMs;
    while (list.length > 0 && list[0] < cutoff) {
      list.shift();
    }
    if (list.length >= max) {
      const oldest = list[0];
      const retryAfterMs = Math.max(0, Math.ceil(windowMs - (now - oldest)));
      return res.status(429).json({
        message: message || defaultMessage,
        retryAfterMs,
        limitPerWindow: max,
        windowMs,
      });
    }
    list.push(now);
    return next();
  };
}

function getClientIp(req) {
  const forwarded = getHeaderString(req.headers["x-forwarded-for"]);
  if (forwarded) {
    const [first] = forwarded.split(",");
    const ip = asString(first);
    if (ip) return ip;
  }
  return asString(req.ip) || "unknown-ip";
}

async function verifyAssetAgainstIndexedBlock(row) {
  if (!row?.batch_id) {
    return {
      verified: false,
      blockNumber: row?.indexed_block_number ?? null,
      storedRoot: null,
      computedRoot: null,
      reason: "batch_missing",
    };
  }

  const batch = await getBatchById(row.batch_id);
  if (!batch?.block_number || !batch?.merkle_root) {
    return {
      verified: false,
      blockNumber: row?.indexed_block_number ?? null,
      storedRoot: batch?.merkle_root ?? null,
      computedRoot: null,
      reason: "batch_not_finalized",
    };
  }

  const batchAssets = await getBatchAssets(row.batch_id);
  if (batchAssets.length === 0) {
    return {
      verified: false,
      blockNumber: batch.block_number,
      storedRoot: batch.merkle_root,
      computedRoot: null,
      reason: "batch_empty",
    };
  }

  const leafHashes = batchAssets.map((asset) => createAssetLeafHash(asset));
  const merkle = buildMerkleTree(leafHashes);
  const targetIndex = batchAssets.findIndex((asset) => asset.id === row.id);
  if (targetIndex < 0) {
    return {
      verified: false,
      blockNumber: batch.block_number,
      storedRoot: batch.merkle_root,
      computedRoot: merkle.root,
      reason: "asset_not_found",
    };
  }

  const targetLeaf = leafHashes[targetIndex];
  const proof = Array.isArray(row.merkle_proof_json)
    ? row.merkle_proof_json
    : merkle.proofs[targetIndex];
  const proofVerified = verifyMerkleProof(targetLeaf, proof, batch.merkle_root);
  const rootVerified = merkle.root === batch.merkle_root;
  const leafVerified = !row.merkle_leaf_hash || row.merkle_leaf_hash === targetLeaf;
  const blockVerified =
    !row.indexed_block_number || Number(row.indexed_block_number) === Number(batch.block_number);

  return {
    verified: proofVerified && rootVerified && leafVerified && blockVerified,
    blockNumber: batch.block_number,
    storedRoot: batch.merkle_root,
    computedRoot: merkle.root,
    reason:
      proofVerified && rootVerified && leafVerified && blockVerified ? "ok" : "merkle_mismatch",
  };
}

