import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import {
  attachAssetToBatch,
  countSha256ByOwner,
  getAssetByToken,
  getBatchAssets,
  getOrCreateMinuteBatch,
  listDuePendingBatches,
  listAssetsByOwner,
  listPhashCandidates,
  markBatchFailed,
  markBatchSent,
  setAssetsOnchainTimestamp,
  updateAssetVerification,
  insertAsset,
} from "./db.js";
import { getBestDuplicateScore } from "./phash.js";

const verifyBaseUrl = process.env.VERIFY_BASE_URL || "https://verify.verity.app/v";
const corsOrigin = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((v) => v.trim());

// [각주1] Express 앱은 실행 환경(로컬 서버/서버리스)과 분리해 재사용합니다.
export function createApp() {
  const app = express();

  app.use(cors({ origin: corsOrigin.includes("*") ? true : corsOrigin }));
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "verity-server" });
  });

  app.post("/v1/assets", async (req, res) => {
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
      const batch = await getOrCreateMinuteBatch(minuteBucket, uuidv4());

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
      await attachAssetToBatch(row.id, batch.id);

      res.status(201).json(toClientRecord(row, verifyBaseUrl));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "자산 등록 실패" });
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

  app.get("/v1/verify/:token", async (req, res) => {
    try {
      const token = asString(req.params.token);
      const row = await getAssetByToken(token);
      if (!row) return res.status(404).json({ message: "검증 토큰을 찾을 수 없습니다." });
      res.json(toVerificationView(row));
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

      if (row.mode === "sha256") {
        chainVerified = !!row.onchain_timestamp_ms;
      }

      const updated = await updateAssetVerification(token, {
        duplicateScore,
        chainVerified,
      });
      if (!updated) return res.status(404).json({ message: "검증 토큰을 찾을 수 없습니다." });
      res.json(toVerificationView(updated));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "재검증 실패" });
    }
  });

  return app;
}

export async function processMinuteBatches() {
  const due = await listDuePendingBatches();
  for (const batch of due) {
    try {
      const batchAssets = await getBatchAssets(batch.id);
      const mockTxHash = `vrt_batch_${Date.now()}_${batch.id.slice(0, 8)}`;
      const onchainTimestampMs = Date.now();
      const merkleRoot = createDigestFromBatch(batchAssets);

      await markBatchSent(batch.id, {
        txHash: mockTxHash,
        merkleRoot,
        onchainTimestampMs,
      });
      await setAssetsOnchainTimestamp(batch.id, onchainTimestampMs);
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

function toVerificationView(row) {
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
    chainVerified: row.chain_verified,
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

function createDigestFromBatch(batchAssets) {
  const seed = batchAssets
    .map((row) => row.sha256 || row.phash || row.serial || row.id)
    .join("|");
  return Buffer.from(seed).toString("base64").slice(0, 64);
}

