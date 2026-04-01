import express from "express";
import cors from "cors";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import {
  attachAssetToBatch,
  countSha256ByOwner,
  getAssetByToken,
  getLatestAssetByPhash,
  getLatestAssetBySha256,
  getBatchById,
  getBatchAssets,
  pool,
  getBatchSlotForMinuteBucket,
  ensureFollowingBatchPrepared,
  listBatchesReadyForMerkleFlush,
  listAssetsByOwner,
  listAssetsWithPhash,
  listRecentAssets,
  listRecentBatches,
  listPhashCandidates,
  markBatchFailed,
  updateAssetVerification,
  insertAsset,
  BATCH_MERKLE_IMMEDIATE_AT_COUNT,
} from "./db.js";
import {
  getBestDuplicateScore,
  hammingDistanceFromPhash,
  similarityFromPhash,
} from "./phash.js";
import {
  buildMerkleTree,
  createAssetLeafHash,
  verifyMerkleProof,
} from "./merkle.js";
import { shouldRunBatchScheduler, touchBatchActivity } from "./batchActivity.js";
import {
  averageHash16FromImageBuffer,
  isProbablyImageMime,
  isProbablyVideoMime,
  sha256Buffer,
} from "./mediaHash.js";
import { enrichMetadataWithOpenCellid } from "./cellGpsAnalysis.js";
import { countOpenCellidRows } from "./opencellid.js";
import {
  getSolanaMerkleAnchorOptions,
  getSolanaAdminStatus,
  solanaExplorerTxUrl,
  parseSolanaKeypair,
  submitMerkleRootMemo,
} from "./solanaMerkleAnchor.js";
import { saveRuntimeSolanaConfig } from "./runtimeConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 검증 웹 정적 파일 (저장소 루트의 index.html 등). `VERIFY_STATIC_DIR`로 재정의 가능. */
const VERIFY_STATIC_ROOT = path.resolve(
  process.env.VERIFY_STATIC_DIR || path.join(__dirname, "..", "..")
);

const VERIFY_STATIC_FILES = new Set([
  "index.html",
  "style.css",
  "script.js",
  "404.html",
  "admin.html",
  "admin.css",
  "admin.js",
  "logo-mark.svg",
  "logo.png",
  "logo.webp",
  ".nojekyll",
]);

const verifyBaseUrl = process.env.VERIFY_BASE_URL || "https://verify.verity.app/v";
const corsOrigin = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((v) => v.trim());
const PELIAS_API_BASE_URL = String(process.env.PELIAS_API_BASE_URL || "").trim().replace(/\/+$/, "");
const PELIAS_REVERSE_PATH = String(process.env.PELIAS_REVERSE_PATH || "/v1/reverse").trim();
const PELIAS_ACCEPT_LANGUAGE = String(process.env.PELIAS_ACCEPT_LANGUAGE || "en").trim();

const uploadMaxBytes = Number(process.env.UPLOAD_MAX_BYTES || 80 * 1024 * 1024);
const verifyWebUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploadMaxBytes },
});

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

    const sha256Assets = batchAssets.filter((row) => !!asString(row.sha256));
    const phashAssets = batchAssets.filter((row) => !!asString(row.phash));
    const sha256LeafHashes = sha256Assets.map((row) =>
      createAssetLeafHash(row, "sha256")
    );
    const phashLeafHashes = phashAssets.map((row) =>
      createAssetLeafHash(row, "phash")
    );
    const sha256Merkle = buildMerkleTree(sha256LeafHashes);
    const phashMerkle = buildMerkleTree(phashLeafHashes);

    const anchorOpts = getSolanaMerkleAnchorOptions();
    let txHash;
    let anchorPayload = null;
    if (anchorOpts) {
      try {
        const { signature, payload } = await submitMerkleRootMemo({
          batchId: String(batchId),
          sha256Root: sha256Merkle.root,
          phashRoot: phashMerkle.root,
          rpcUrl: anchorOpts.rpcUrl,
          keypair: anchorOpts.keypair,
          commitment: anchorOpts.commitment,
        });
        txHash = signature;
        anchorPayload = payload;
        console.log(
          `[verity-solana] 배치 머클 앵커 OK (${anchorOpts.cluster}): ${signature.slice(0, 16)}…`
        );
      } catch (err) {
        console.error(
          "[verity-solana] Solana 전송 실패 — 배치는 pending으로 두고 다음 주기에 재시도:",
          err?.message || err
        );
        await client.query("ROLLBACK");
        return;
      }
    } else {
      txHash = `vrt_batch_${Date.now()}_${String(batchId).slice(0, 8)}`;
      anchorPayload = JSON.stringify({
        version: "verity:merkle:v2",
        batchId: String(batchId),
        sha256Root: sha256Merkle.root,
        phashRoot: phashMerkle.root,
      });
    }

    const bnRes = await client.query(
      `SELECT COALESCE(MAX(block_number), 0) + 1 AS n FROM onchain_minute_batches`
    );
    const blockNumber = Number(bnRes.rows[0]?.n ?? 1);
    const onchainTimestampMs = Date.now();

    const upd = await client.query(
      `
        UPDATE onchain_minute_batches
        SET status = 'sent',
            tx_hash = $2,
            block_number = $3,
            merkle_root = $4,
            sha256_merkle_root = $5,
            phash_merkle_root = $6,
            merkle_anchor_payload_json = $7::jsonb,
            onchain_timestamp_ms = $8,
            sent_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING id
      `,
      [
        batchId,
        txHash,
        blockNumber,
        pickPrimaryMerkleRoot(sha256Merkle.root, phashMerkle.root),
        sha256Merkle.root,
        phashMerkle.root,
        safeJsonStringify(
          parseMaybeJson(anchorPayload) || {
            version: "verity:merkle:v2",
            batchId: String(batchId),
            sha256Root: sha256Merkle.root,
            phashRoot: phashMerkle.root,
            txSignature: txHash,
          }
        ),
        onchainTimestampMs,
      ]
    );

    if (upd.rowCount === 0) {
      await client.query("ROLLBACK");
      return;
    }

    await client.query(
      `UPDATE assets SET onchain_timestamp_ms = $2, chain_verified = FALSE, chain_tx_signature = $3 WHERE batch_id = $1`,
      [batchId, onchainTimestampMs, txHash]
    );

    const sha256ProofMap = new Map();
    for (let index = 0; index < sha256Assets.length; index += 1) {
      sha256ProofMap.set(sha256Assets[index].id, {
        leafHash: sha256LeafHashes[index],
        proof: sha256Merkle.proofs[index] ?? [],
      });
    }
    const phashProofMap = new Map();
    for (let index = 0; index < phashAssets.length; index += 1) {
      phashProofMap.set(phashAssets[index].id, {
        leafHash: phashLeafHashes[index],
        proof: phashMerkle.proofs[index] ?? [],
      });
    }

    for (const row of batchAssets) {
      const sha256Node = sha256ProofMap.get(row.id) || null;
      const phashNode = phashProofMap.get(row.id) || null;
      const preferredNode =
        String(row.mode || "").toLowerCase() === "phash"
          ? phashNode || sha256Node
          : sha256Node || phashNode;
      await client.query(
        `
          UPDATE assets
          SET indexed_block_number = $2,
              merkle_leaf_hash = $3,
              merkle_proof_json = $4::jsonb,
              sha256_merkle_leaf_hash = $5,
              sha256_merkle_proof_json = $6::jsonb,
              phash_merkle_leaf_hash = $7,
              phash_merkle_proof_json = $8::jsonb,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          row.id,
          blockNumber,
          preferredNode?.leafHash ?? null,
          safeJsonStringify(preferredNode?.proof ?? []),
          sha256Node?.leafHash ?? null,
          safeJsonStringify(sha256Node?.proof ?? []),
          phashNode?.leafHash ?? null,
          safeJsonStringify(phashNode?.proof ?? []),
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
  const onePerSecondVerifyUploadGuard = createRequestIntervalGuard({
    intervalMs: 1000,
    keyResolver: (req) => `verify-upload:${getClientIp(req)}`,
    message: "파일 업로드는 1초에 1회만 가능합니다.",
  });
  const onePerSecondVerifyLookupGuard = createRequestIntervalGuard({
    intervalMs: 1000,
    keyResolver: (req) => `verify-lookup:${getClientIp(req)}`,
    message: "해시 검증 조회는 1초에 1회만 가능합니다.",
  });

  const uploadPerMinuteByIp = createSlidingWindowRateLimit({
    windowMs: Number(process.env.UPLOAD_RATE_WINDOW_MS || 60_000),
    max: Math.max(1, Number(process.env.UPLOAD_RATE_LIMIT_PER_MINUTE || 15)),
    keyResolver: (req) => `upload-ip:${getClientIp(req)}`,
  });

  app.use(cors({ origin: corsOrigin.includes("*") ? true : corsOrigin }));
  app.use(express.json({ limit: "10mb" }));
  app.use((req, res, next) => {
    if (
      req.method === "POST" &&
      (req.path === "/v1/assets" ||
        req.path === "/v1/ingest/sha256" ||
        req.path === "/v1/verify/upload")
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

  app.get("/v1/admin/solana", (_req, res) => {
    res.json(getSolanaAdminStatus());
  });

  app.post("/v1/admin/solana", (req, res) => {
    try {
      const rpcUrl = asString(req.body?.rpcUrl);
      const cluster = asString(req.body?.cluster);
      const commitment = asString(req.body?.commitment);
      const keypair = asString(req.body?.keypair);
      const anchorDisabled = req.body?.anchorDisabled === true;

      if (!rpcUrl) {
        return res.status(400).json({ message: "rpcUrl이 필요합니다." });
      }
      if (!keypair) {
        return res.status(400).json({ message: "keypair가 필요합니다." });
      }
      const parsed = parseSolanaKeypair(keypair);
      if (!parsed) {
        return res.status(400).json({
          message: "Solana 개인키 형식이 올바르지 않습니다. base58 또는 [1,2,3] 배열을 사용하세요.",
        });
      }

      const saved = saveRuntimeSolanaConfig({
        rpcUrl,
        cluster,
        commitment,
        keypair,
        anchorDisabled,
        updatedAt: new Date().toISOString(),
      });
      res.json({
        ok: true,
        saved: {
          rpcUrl: saved.rpcUrl,
          cluster: saved.cluster,
          commitment: saved.commitment || "confirmed",
          anchorDisabled: saved.anchorDisabled,
          publicKey: parsed.publicKey.toBase58(),
          updatedAt: saved.updatedAt,
        },
        status: getSolanaAdminStatus(),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Solana 관리자 설정 저장 실패" });
    }
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
      let metadata = parseMaybeJson(body.metadata);
      const teeProof = parseMaybeJson(body.teeProof);
      const capturedTimestampMs = extractCapturedTimestamp(metadata, teeProof);
      const minuteBucket = batchWindowBucketIso(capturedTimestampMs);
      const gps = extractGps(metadata);
      metadata = await enrichMetadataWithOpenCellid(metadata, gps);
      const batch = await getBatchSlotForMinuteBucket(minuteBucket);

      let duplicateScore = null;
      if (mode === "phash" && phash) {
        const candidates = await listPhashCandidates(phash);
        duplicateScore = getBestDuplicateScore(phash, candidates);
      }
      const combinedHashes = buildCombinedHashesForInsert({
        id,
        serial,
        sha256,
        phash,
      });

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
        ...combinedHashes,
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

      res.status(201).json(await toClientRecord(row, verifyBaseUrl));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "자산 등록 실패" });
    }
  });

  // [각주3] 기기에서 계산한 SHA-256(+선택 pHash)를 받아, 서버 수신 시각 기준 10초 버킷으로 묶어 배치합니다.
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
      const minuteBucket = batchWindowBucketIso(receivedMs);
      const metadata = parseMaybeJson(body.metadata);
      const teeProof = parseMaybeJson(body.teeProof);
      const capturedTimestampMs =
        toIntOrNull(body.capturedTimestampMs) ??
        extractCapturedTimestamp(metadata, teeProof) ??
        receivedMs;
      const aiRiskScore = toIntOrNull(body.aiRiskScore);
      const ingestChannel =
        mediaType === "video"
          ? phash
            ? "sha256_phash_video"
            : "sha256_video"
          : phash
            ? "sha256_phash"
            : "sha256_only";
      let mergedMetadata =
        metadata && typeof metadata === "object"
          ? {
              ...metadata,
              ingestChannel,
              serverReceivedAtMs: receivedMs,
              batchWindowBucket: minuteBucket,
            }
          : {
              ingestChannel,
              serverReceivedAtMs: receivedMs,
              batchWindowBucket: minuteBucket,
            };

      const gps = extractGps(mergedMetadata);
      mergedMetadata = await enrichMetadataWithOpenCellid(mergedMetadata, gps);
      const batch = await getBatchSlotForMinuteBucket(minuteBucket);
      const id = uuidv4();
      const token = createToken();
      const serial = asString(body.serial) || createSerial("sha256");

      let duplicateScore = null;
      if (phash) {
        const candidates = await listPhashCandidates(phash);
        duplicateScore = getBestDuplicateScore(phash, candidates);
      }
      const combinedHashes = buildCombinedHashesForInsert({
        id,
        serial,
        sha256,
        phash,
      });

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
        teeProof,
        chainVerified: false,
        duplicateScore,
        ...combinedHashes,
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

      res.status(201).json(await toClientRecord(row, verifyBaseUrl));
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
      res.json(await Promise.all(rows.map((r) => toClientRecord(r, verifyBaseUrl))));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "자산 목록 조회 실패" });
    }
  });

  app.get("/v1/admin/assets", async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
      const rows = await listRecentAssets(limit);
      res.json(await Promise.all(rows.map((r) => toClientRecord(r, verifyBaseUrl))));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "관리자 자산 목록 조회 실패" });
    }
  });

  app.get("/v1/admin/opencellid/status", async (_req, res) => {
    try {
      const rowCount = await countOpenCellidRows();
      res.json({
        rowCount,
        hasData: rowCount > 0,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "OpenCellID 테이블 상태 조회 실패" });
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
          sha256MerkleRoot: row.sha256_merkle_root,
          phashMerkleRoot: row.phash_merkle_root,
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

  /** 검증 웹 등: 파일 업로드 → SHA-256·(이미지면) aHash 기반으로 자산 등록 후 검증 뷰 반환 */
  app.post(
    "/v1/verify/upload",
    uploadPerMinuteByIp,
    onePerSecondVerifyUploadGuard,
    (req, res, next) => {
      verifyWebUpload.single("file")(req, res, (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ message: "파일 크기 제한을 초과했습니다." });
          }
          return res.status(400).json({ message: err.message || "업로드 처리 실패" });
        }
        next();
      });
    },
    async (req, res) => {
      try {
        const file = req.file;
        if (!file?.buffer) {
          return res.status(400).json({ message: "file 필드로 이미지 또는 동영상을 보내주세요." });
        }
        const mime = asString(file.mimetype);
        if (!isProbablyImageMime(mime) && !isProbablyVideoMime(mime)) {
          return res.status(400).json({ message: "이미지 또는 동영상만 업로드할 수 있습니다." });
        }

        let owner = asString(req.body?.owner);
        if (!owner) owner = `web-guest-${getClientIp(req).replace(/[^a-zA-Z0-9._-]/g, "_")}`;

        const mediaType = isProbablyVideoMime(mime) ? "video" : "photo";
        const sha256 = sha256Buffer(file.buffer);
        let phash = null;
        if (mediaType === "photo") {
          phash = await averageHash16FromImageBuffer(file.buffer);
        }

        let duplicateScore = null;
        if (phash) {
          const candidates = await listPhashCandidates(phash);
          duplicateScore = getBestDuplicateScore(phash, candidates);
        }

        const id = uuidv4();
        const token = createToken();
        const serial = createSerial("phash");
        const capturedTimestampMs = Date.now();
        const minuteBucket = batchWindowBucketIso(capturedTimestampMs);
        const batch = await getBatchSlotForMinuteBucket(minuteBucket);
        const metadata = {
          source: "verify-web-upload",
          originalName: asString(file.originalname) || null,
          mimeType: mime,
          size: file.size,
        };
        const combinedHashes = buildCombinedHashesForInsert({
          id,
          serial,
          sha256,
          phash,
        });

        const row = await insertAsset({
          id,
          token,
          serial,
          owner,
          mode: "phash",
          mediaType,
          sha256,
          phash,
          capturedTimestampMs,
          minuteBucket,
          gpsLat: null,
          gpsLng: null,
          batchId: batch.id,
          aiRiskScore: null,
          metadata,
          chainTxSignature: null,
          teeProof: null,
          chainVerified: false,
          duplicateScore,
          ...combinedHashes,
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

        const merkleCheck = await verifyAssetAgainstIndexedBlock(row);
        res.status(201).json({
          asset: { ...(await toClientRecord(row, verifyBaseUrl)), token: row.token },
          verification: await toVerificationView(row, merkleCheck),
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "업로드 등록 실패" });
      }
    }
  );

  /** 브라우저가 계산한 파일 SHA-256으로 등록 기록 조회 (토큰 없이 검증) */
  app.get("/v1/verify/lookup", onePerSecondVerifyLookupGuard, async (req, res) => {
    try {
      const sha256Raw = asString(req.query.sha256);
      const sha256 = sha256Raw.toLowerCase();
      if (!sha256Raw || !isValidSha256Hex(sha256)) {
        return res
          .status(400)
          .json({ message: "쿼리 sha256(64자리 16진 소문자)이 필요합니다." });
      }
      const row = await getLatestAssetBySha256(sha256);
      if (!row) {
        return res
          .status(404)
          .json({ message: "동일한 SHA-256으로 등록된 기록이 없습니다." });
      }
      const merkleCheck = await verifyAssetAgainstIndexedBlock(row);
      res.json(await toVerificationView(row, merkleCheck));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "검증 정보 조회 실패" });
    }
  });

  app.post(
    "/v1/verify/search-hashes",
    uploadPerMinuteByIp,
    onePerSecondVerifyUploadGuard,
    async (req, res) => {
      try {
        const sha256 = asString(req.body?.sha256).toLowerCase();
        const phash = asString(req.body?.phash).toLowerCase();
        const mediaType = asString(req.body?.mediaType || "photo");
        const fileName = asString(req.body?.fileName);
        const mimeType = asString(req.body?.mimeType);

        if (!sha256 && !phash) {
          return res.status(400).json({ message: "sha256 또는 phash가 필요합니다." });
        }
        if (sha256 && !/^[0-9a-f]{64}$/i.test(sha256)) {
          return res.status(400).json({ message: "sha256 형식이 올바르지 않습니다." });
        }
        if (phash && !/^[0-9a-f]{16}$/i.test(phash)) {
          return res.status(400).json({ message: "phash 형식이 올바르지 않습니다." });
        }

        const match = await searchVerificationCandidates({
          sha256,
          phash,
          mediaType,
        });

        res.json({
          query: {
            sha256: sha256 || null,
            phash: phash || null,
            mediaType: mediaType || null,
            originalName: fileName || null,
            mimeType: mimeType || null,
            source: "client-hash",
          },
          ...match,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "해시 기반 검증 조회 실패" });
      }
    }
  );

  app.post(
    "/v1/verify/search-upload",
    uploadPerMinuteByIp,
    onePerSecondVerifyUploadGuard,
    (req, res, next) => {
      verifyWebUpload.single("file")(req, res, (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ message: "파일 크기 제한을 초과했습니다." });
          }
          return res.status(400).json({ message: err.message || "업로드 처리 실패" });
        }
        next();
      });
    },
    async (req, res) => {
      try {
        const file = req.file;
        if (!file?.buffer) {
          return res.status(400).json({ message: "file 필드로 이미지 파일을 보내주세요." });
        }
        const mime = asString(file.mimetype);
        if (!isProbablyImageMime(mime)) {
          return res.status(400).json({ message: "이미지 파일만 검색할 수 있습니다." });
        }

        const sha256 = sha256Buffer(file.buffer);
        const phash = await averageHash16FromImageBuffer(file.buffer);
        const match = await searchVerificationCandidates({
          sha256,
          phash,
          mediaType: "photo",
        });

        res.json({
          query: {
            sha256,
            phash,
            mimeType: mime,
            originalName: asString(file.originalname) || null,
            size: file.size,
          },
          ...match,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "이미지 해시 검색 실패" });
      }
    }
  );

  app.get("/v1/verify/:token", async (req, res) => {
    try {
      const token = asString(req.params.token);
      const row = await getAssetByToken(token);
      if (!row) return res.status(404).json({ message: "검증 토큰을 찾을 수 없습니다." });
      const merkleCheck = await verifyAssetAgainstIndexedBlock(row);
      res.json(await toVerificationView(row, merkleCheck));
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
      res.json(await toVerificationView(updated, merkleCheck));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "재검증 실패" });
    }
  });

  mountVerifyWebUi(app);

  return app;
}

/**
 * 앱/QR이 여는 `GET /v/:token` 에 검증 SPA(index.html)를 내려줍니다.
 * 정적 자산은 `/verity-static/*` (저장소 루트 파일만 화이트리스트).
 */
function mountVerifyWebUi(app) {
  const indexPath = path.join(VERIFY_STATIC_ROOT, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.warn(
      `[verity] 검증 UI 없음: ${indexPath} 없음. VERIFY_STATIC_DIR 또는 모노레포 루트 배포를 확인하세요.`
    );
    return;
  }

  app.get("/verity-static/:asset", (req, res, next) => {
    const raw = asString(req.params.asset);
    const name = path.basename(raw.split("?")[0] || "");
    if (!name || !VERIFY_STATIC_FILES.has(name)) {
      return res.status(404).json({ message: "not found" });
    }
    const filePath = path.join(VERIFY_STATIC_ROOT, name);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(VERIFY_STATIC_ROOT))) {
      return res.status(403).end();
    }
    res.sendFile(resolved, (err) => {
      if (err) next(err);
    });
  });

  const sendVerifyIndex = (_req, res, next) => {
    try {
      let html = fs.readFileSync(indexPath, "utf8");
      if (!html.includes('name="verity-verify-base"')) {
        html = html.replace(
          "<head>",
          `<head>\n    <base href="/verity-static/" />\n    <meta name="verity-verify-base" content="1" />`
        );
      }
      res.type("html").send(html);
    } catch (err) {
      next(err);
    }
  };

  app.get("/v", sendVerifyIndex);
  app.get("/verify", sendVerifyIndex);
  app.get("/v/:token", sendVerifyIndex);
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

function safeJsonStringify(value) {
  return JSON.stringify(value ?? null);
}

function pickPrimaryMerkleRoot(sha256Root, phashRoot) {
  return sha256Root || phashRoot || null;
}

function pickPreferredTreeType(row) {
  if (String(row?.mode || "").toLowerCase() === "phash" && row?.phash_merkle_leaf_hash) {
    return "phash";
  }
  if (row?.sha256_merkle_leaf_hash) return "sha256";
  if (row?.phash_merkle_leaf_hash) return "phash";
  if (String(row?.mode || "").toLowerCase() === "phash") return "phash";
  return "sha256";
}

const reverseGeocodeCache = new Map();

async function resolveLocationSummaryWithPelias(gps) {
  if (!PELIAS_API_BASE_URL) return null;
  const lat = Number(gps?.lat);
  const lng = Number(gps?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const response = await fetch(
    `${PELIAS_API_BASE_URL}${PELIAS_REVERSE_PATH}` +
      `?point.lat=${encodeURIComponent(lat)}` +
      `&point.lon=${encodeURIComponent(lng)}` +
      `&size=1&lang=${encodeURIComponent(PELIAS_ACCEPT_LANGUAGE)}`,
    {
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(2500)
          : undefined,
      headers: {
        "User-Agent": "verity-server/1.0 (pelias-reverse-geocoding)",
        Accept: "application/json",
        "Accept-Language": PELIAS_ACCEPT_LANGUAGE,
      },
    }
  );
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const feature = Array.isArray(data?.features) ? data.features[0] : null;
  const props =
    feature?.properties && typeof feature.properties === "object"
      ? feature.properties
      : {};
  const country = asString(props.country);
  const region =
    asString(props.region) ||
    asString(props.macroregion) ||
    asString(props.county) ||
    asString(props.localadmin);
  const locality =
    asString(props.locality) ||
    asString(props.localadmin) ||
    asString(props.county);
  return [country, region, locality].filter(Boolean).join(" · ") || asString(props.label) || null;
}

async function resolveLocationSummaryWithNominatim(gps) {
  const lat = Number(gps?.lat);
  const lng = Number(gps?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=3&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}&accept-language=ko,en`,
    {
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(2500)
          : undefined,
      headers: {
        "User-Agent": "verity-server/1.0 (reverse-location-summary)",
      },
    }
  );
  if (!response.ok) return null;
  const data = await response.json();
  const address = data?.address && typeof data.address === "object" ? data.address : {};
  const country = asString(address.country);
  const region =
    asString(address.state) ||
    asString(address.region) ||
    asString(address.province) ||
    asString(address.state_district);
  return [country, region].filter(Boolean).join(" · ") || asString(data?.display_name) || null;
}

async function resolveLocationSummary(gps) {
  const lat = Number(gps?.lat);
  const lng = Number(gps?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (reverseGeocodeCache.has(key)) return reverseGeocodeCache.get(key);

  try {
    const summary =
      (await resolveLocationSummaryWithPelias(gps)) ||
      (await resolveLocationSummaryWithNominatim(gps));
    reverseGeocodeCache.set(key, summary || null);
    return summary || null;
  } catch {
    reverseGeocodeCache.set(key, null);
    return null;
  }
}

async function toClientRecord(row, verifyBase, options = {}) {
  const verificationUrl = `${verifyBase.replace(/\/$/, "")}/${row.token}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
    verificationUrl
  )}`;
  const gps = {
    lat: row.gps_lat,
    lng: row.gps_lng,
  };
  const locationSummary = options.includeLocationSummary
    ? await resolveLocationSummary(gps)
    : null;
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
    gps,
    locationSummary,
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
    combinedHashes: getCombinedHashesForRow(row),
  };
}

async function toVerificationView(row, merkleCheck = null) {
  const merkleTrees = merkleCheck?.trees || buildEmptyMerkleTrees();
  const preferredTreeType = merkleCheck?.preferredTreeType || pickPreferredTreeType(row);
  const preferredTree = merkleTrees[preferredTreeType] || merkleTrees.sha256;
  const batch = merkleCheck?.batch || null;
  const anchorPayload = batch?.merkle_anchor_payload_json || null;
  const solanaOptions = getSolanaMerkleAnchorOptions();
  const explorerUrl =
    batch?.tx_hash && solanaOptions
      ? solanaExplorerTxUrl(solanaOptions.cluster, batch.tx_hash)
      : null;
  const gps = {
    lat: row.gps_lat,
    lng: row.gps_lng,
  };
  const locationSummary = await resolveLocationSummary(gps);
  const gpsSource = extractGpsSource(row.metadata_json);
  const cellDerivedGps = extractCellDerivedGps(row.metadata_json);
  const radioEvidenceSummary = summarizeRadioEvidence(row.metadata_json);
  return {
    token: row.token,
    /** 머클 리프 직렬화(createAssetLeafHash)에 필요 — 브라우저가 서버 없이 리프 재계산 시 사용 */
    assetId: row.id,
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
    merkleTreeType: preferredTreeType,
    merkleLeafHash: preferredTree?.leafHash ?? row.merkle_leaf_hash ?? null,
    merkleProof: preferredTree?.proof ?? row.merkle_proof_json ?? null,
    merkleRoot: preferredTree?.storedRoot ?? merkleCheck?.storedRoot ?? null,
    computedMerkleRoot:
      preferredTree?.computedRoot ?? merkleCheck?.computedRoot ?? null,
    merkleTrees,
    batchMerkleRoots: batch
      ? {
          primary: batch.merkle_root ?? null,
          sha256: batch.sha256_merkle_root ?? null,
          phash: batch.phash_merkle_root ?? null,
        }
      : null,
    batchAnchor: batch
      ? {
          txHash: batch.tx_hash ?? null,
          blockNumber: batch.block_number ?? null,
          payload: anchorPayload,
          explorerUrl,
          source:
            String(batch.tx_hash || "").startsWith("vrt_batch_") || !batch.tx_hash
              ? "db"
              : "solana",
        }
      : null,
    gps,
    gpsSource,
    cellDerivedGps,
    radioEvidenceSummary,
    locationSummary,
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
    combinedHashes: getCombinedHashesForRow(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getStoredCombinedHash(row, type) {
  if (String(type || "") === "phash") {
    return asString(row?.phash_combined_hash) || null;
  }
  return asString(row?.sha256_combined_hash) || null;
}

function getCombinedHashForRow(row, type) {
  const normalizedType = String(type || "").toLowerCase() === "phash" ? "phash" : "sha256";
  const stored = getStoredCombinedHash(row, normalizedType);
  if (stored) return stored;
  const hashValue =
    normalizedType === "phash" ? asString(row?.phash) : asString(row?.sha256);
  if (!hashValue) return null;
  return createAssetLeafHash(row, normalizedType);
}

function getCombinedHashesForRow(row) {
  const sha256 = getCombinedHashForRow(row, "sha256");
  const phash = getCombinedHashForRow(row, "phash");
  const preferredType = pickPreferredTreeType(row);
  return {
    sha256,
    phash,
    preferredType,
    preferred: preferredType === "phash" ? phash : sha256,
  };
}

function buildSearchCandidate(row, options = {}) {
  const matchType = options.matchType || "similar_phash";
  const combinedHashType =
    matchType === "exact_sha256" && asString(row?.sha256) ? "sha256" : "phash";
  const combinedHash = getCombinedHashForRow(row, combinedHashType);
  const batchStatus = asString(options.batchStatus || row?.batch_status) || null;
  return {
    token: row.token,
    assetId: row.id,
    serial: row.serial,
    owner: row.owner,
    mode: row.mode,
    mediaType: row.media_type,
    createdAt: row.created_at,
    score:
      typeof options.score === "number" ? Number(options.score.toFixed(2)) : null,
    hammingDistance:
      typeof options.hammingDistance === "number" ? options.hammingDistance : null,
    matchType,
    combinedHashType,
    combinedHash,
    batchId: row.batch_id ?? null,
    indexedBlockNumber: row.indexed_block_number ?? null,
    proofReady: !!(row.batch_id && (row.indexed_block_number != null || batchStatus === "sent")),
  };
}

function buildEmptyMerkleTrees() {
  return {
    sha256: emptyMerkleTreeView("sha256"),
    phash: emptyMerkleTreeView("phash"),
  };
}

function emptyMerkleTreeView(type) {
  return {
    type,
    leafHash: null,
    proof: null,
    storedRoot: null,
    computedRoot: null,
    verified: false,
    reason: "missing",
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

function buildCombinedHashesForInsert(asset) {
  return {
    sha256CombinedHash: asString(asset?.sha256)
      ? createAssetLeafHash(asset, "sha256")
      : null,
    phashCombinedHash: asString(asset?.phash)
      ? createAssetLeafHash(asset, "phash")
      : null,
  };
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
  if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };

  const fused = m.androidRadioRawSnapshot?.gnss?.fusedLocation;
  if (
    fused &&
    typeof fused.latitude === "number" &&
    typeof fused.longitude === "number"
  ) {
    return { lat: fused.latitude, lng: fused.longitude };
  }

  const derived = m.gnssDerivedLocation;
  if (
    derived &&
    typeof derived.latitude === "number" &&
    typeof derived.longitude === "number"
  ) {
    return { lat: derived.latitude, lng: derived.longitude };
  }

  return null;
}

function extractGpsSource(metadata) {
  const m = metadata && typeof metadata === "object" ? metadata : {};
  const declared = asString(m.gpsSource);
  if (declared) return declared;
  const lat = Number(m.gpsLat ?? m.gps?.lat);
  const lng = Number(m.gpsLng ?? m.gps?.lng);
  if (!Number.isNaN(lat) && !Number.isNaN(lng)) return "Stored GPS";
  const fused = m.androidRadioRawSnapshot?.gnss?.fusedLocation;
  if (
    fused &&
    typeof fused.latitude === "number" &&
    typeof fused.longitude === "number"
  ) {
    return "Android fused location";
  }
  return null;
}

function extractCellDerivedGps(metadata) {
  const m = metadata && typeof metadata === "object" ? metadata : {};
  const centroid = m.serverOpencellidAnalysis?.centroid;
  if (
    centroid &&
    typeof centroid.lat === "number" &&
    typeof centroid.lng === "number"
  ) {
    return { lat: centroid.lat, lng: centroid.lng };
  }
  return null;
}

function summarizeRadioEvidence(metadata) {
  const m = metadata && typeof metadata === "object" ? metadata : {};
  const explicit = asString(m.radioEvidenceSummary);
  if (explicit) return explicit;
  const snap = m.androidRadioRawSnapshot;
  if (!snap || typeof snap !== "object") return null;
  const wifiCount = Array.isArray(snap.wifiScan) ? snap.wifiScan.length : 0;
  const cellCount = Array.isArray(snap.cellScan) ? snap.cellScan.length : 0;
  const bleCount = Array.isArray(snap.bleBeacons) ? snap.bleBeacons.length : 0;
  const parts = [];
  if (wifiCount > 0) parts.push(`Wi-Fi ${wifiCount}`);
  if (cellCount > 0) parts.push(`Cells ${cellCount}`);
  if (bleCount > 0) parts.push(`BLE ${bleCount}`);
  return parts.length ? parts.join(" · ") : null;
}

function batchWindowBucketIso(tsMs) {
  const bucketMs = Number(process.env.BATCH_WINDOW_MS || 10_000);
  const normalizedBucketMs =
    Number.isFinite(bucketMs) && bucketMs >= 1_000 ? Math.floor(bucketMs) : 10_000;
  const bucketStartMs = Math.floor(tsMs / normalizedBucketMs) * normalizedBucketMs;
  return new Date(bucketStartMs).toISOString();
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
  const trees = buildEmptyMerkleTrees();
  const preferredTreeType = pickPreferredTreeType(row);
  if (!row?.batch_id) {
    return {
      verified: false,
      blockNumber: row?.indexed_block_number ?? null,
      storedRoot: null,
      computedRoot: null,
      batch: null,
      trees,
      preferredTreeType,
      reason: "batch_missing",
    };
  }

  const batch = await getBatchById(row.batch_id);
  if (
    !batch?.block_number ||
    (!batch?.sha256_merkle_root && !batch?.phash_merkle_root && !batch?.merkle_root)
  ) {
    return {
      verified: false,
      blockNumber: row?.indexed_block_number ?? null,
      storedRoot: batch?.merkle_root ?? null,
      computedRoot: null,
      batch,
      trees,
      preferredTreeType,
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
      batch,
      trees,
      preferredTreeType,
      reason: "batch_empty",
    };
  }

  trees.sha256 = verifyMerkleTreeForAsset({
    type: "sha256",
    row,
    batch,
    batchAssets: batchAssets.filter((asset) => !!asString(asset.sha256)),
    batchRoot: batch.sha256_merkle_root || batch.merkle_root,
    storedLeafHash: row.sha256_merkle_leaf_hash,
    storedProof: row.sha256_merkle_proof_json,
  });
  trees.phash = verifyMerkleTreeForAsset({
    type: "phash",
    row,
    batch,
    batchAssets: batchAssets.filter((asset) => !!asString(asset.phash)),
    batchRoot: batch.phash_merkle_root,
    storedLeafHash: row.phash_merkle_leaf_hash,
    storedProof: row.phash_merkle_proof_json,
  });

  const preferredTree = trees[preferredTreeType] || trees.sha256;
  const blockVerified =
    !row.indexed_block_number ||
    Number(row.indexed_block_number) === Number(batch.block_number);

  return {
    verified: !!preferredTree.verified && blockVerified,
    blockNumber: batch.block_number,
    storedRoot: preferredTree.storedRoot,
    computedRoot: preferredTree.computedRoot,
    batch,
    trees,
    preferredTreeType,
    reason:
      preferredTree.verified && blockVerified ? "ok" : preferredTree.reason || "merkle_mismatch",
  };
}

function verifyMerkleTreeForAsset({
  type,
  row,
  batch,
  batchAssets,
  batchRoot,
  storedLeafHash,
  storedProof,
}) {
  if (!batchRoot || !Array.isArray(batchAssets) || batchAssets.length === 0) {
    return {
      type,
      leafHash: storedLeafHash || null,
      proof: Array.isArray(storedProof) ? storedProof : null,
      storedRoot: batchRoot || null,
      computedRoot: null,
      verified: false,
      reason: "tree_missing",
    };
  }

  const targetIndex = batchAssets.findIndex((asset) => asset.id === row.id);
  const leafHashes = batchAssets.map((asset) => createAssetLeafHash(asset, type));
  const merkle = buildMerkleTree(leafHashes);
  if (targetIndex < 0) {
    return {
      type,
      leafHash: storedLeafHash || null,
      proof: Array.isArray(storedProof) ? storedProof : null,
      storedRoot: batchRoot,
      computedRoot: merkle.root,
      verified: false,
      reason: "asset_not_in_tree",
    };
  }

  const targetLeaf = leafHashes[targetIndex];
  const proof = Array.isArray(storedProof) ? storedProof : merkle.proofs[targetIndex];
  const proofVerified = verifyMerkleProof(targetLeaf, proof, batchRoot);
  const rootVerified = merkle.root === batchRoot;
  const leafVerified = !storedLeafHash || storedLeafHash === targetLeaf;

  return {
    type,
    leafHash: targetLeaf,
    proof,
    storedRoot: batchRoot,
    computedRoot: merkle.root,
    verified: proofVerified && rootVerified && leafVerified,
    reason:
      proofVerified && rootVerified && leafVerified ? "ok" : "merkle_mismatch",
  };
}

async function searchVerificationCandidates({ sha256, phash, mediaType }) {
  const exactSha256Row = sha256 ? await getLatestAssetBySha256(sha256) : null;
  const exactPhashRow =
    !exactSha256Row && phash ? await getLatestAssetByPhash(phash, mediaType || null) : null;

  const candidates = [];
  const seen = new Set();
  let bestPhashScore = null;

  if (exactSha256Row) {
    candidates.push(
      buildSearchCandidate(exactSha256Row, {
        matchType: "exact_sha256",
        score: 100,
        hammingDistance: phash && exactSha256Row.phash
          ? hammingDistanceFromPhash(phash, exactSha256Row.phash)
          : 0,
      })
    );
    seen.add(exactSha256Row.token);
  }

  if (exactPhashRow && !seen.has(exactPhashRow.token)) {
    candidates.push(
      buildSearchCandidate(exactPhashRow, {
        matchType: "exact_phash",
        score: 100,
        hammingDistance: 0,
      })
    );
    seen.add(exactPhashRow.token);
  }

  if (phash) {
    const rows = await listAssetsWithPhash(2000, mediaType || null);
    const scored = rows
      .map((candidate) => ({
        row: candidate,
        score: similarityFromPhash(phash, candidate.phash),
        hammingDistance: hammingDistanceFromPhash(phash, candidate.phash),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.hammingDistance - b.hammingDistance;
      })
      .slice(0, 8);

    bestPhashScore = scored.length > 0 ? scored[0].score : null;
    for (const entry of scored) {
      if (seen.has(entry.row.token)) continue;
      candidates.push(
        buildSearchCandidate(entry.row, {
          matchType: entry.score === 100 ? "exact_phash" : "similar_phash",
          score: entry.score,
          hammingDistance: entry.hammingDistance,
        })
      );
      seen.add(entry.row.token);
    }
  }

  return {
    exactMatchType: exactSha256Row ? "sha256" : null,
    bestPhashScore,
    exactPhashMatch: exactPhashRow
      ? buildSearchCandidate(exactPhashRow, {
          matchType: "exact_phash",
          score: 100,
          hammingDistance: 0,
        })
      : null,
    candidates,
    similarMatches: candidates.filter((item) => item.matchType !== "exact_sha256"),
  };
}

