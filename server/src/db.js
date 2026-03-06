import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "../sql/schema.sql");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL 환경 변수가 필요합니다.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDatabase() {
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schema);
}

export async function insertAsset(asset) {
  const query = `
    INSERT INTO assets (
      id, token, serial, owner, mode, media_type, sha256, phash,
      tee_key_id, tee_signature, tee_payload_json, tee_provider, tee_verified,
      captured_timestamp_ms, onchain_timestamp_ms, gps_lat, gps_lng, minute_bucket, batch_id,
      ai_risk_score, metadata_json, chain_tx_signature, chain_verified, duplicate_score
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
    )
    RETURNING *;
  `;
  const values = [
    asset.id,
    asset.token,
    asset.serial ?? null,
    asset.owner,
    asset.mode,
    asset.mediaType,
    asset.sha256 ?? null,
    asset.phash ?? null,
    asset.teeProof?.keyId ?? null,
    asset.teeProof?.signature ?? null,
    asset.teeProof?.payload ?? null,
    asset.teeProof?.provider ?? null,
    asset.teeProof?.verified ?? false,
    asset.capturedTimestampMs,
    asset.onchainTimestampMs ?? null,
    asset.gpsLat ?? null,
    asset.gpsLng ?? null,
    asset.minuteBucket,
    asset.batchId ?? null,
    asset.aiRiskScore ?? null,
    asset.metadata ?? null,
    asset.chainTxSignature ?? null,
    asset.chainVerified ?? false,
    asset.duplicateScore ?? null,
  ];
  const { rows } = await pool.query(query, values);
  return rows[0];
}

export async function listAssetsByOwner(owner) {
  const { rows } = await pool.query(
    "SELECT * FROM assets WHERE owner = $1 ORDER BY created_at DESC",
    [owner]
  );
  return rows;
}

export async function getAssetByToken(token) {
  const { rows } = await pool.query("SELECT * FROM assets WHERE token = $1", [
    token,
  ]);
  return rows[0] ?? null;
}

export async function countSha256ByOwner(owner) {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM assets WHERE owner = $1 AND mode = 'sha256'",
    [owner]
  );
  return rows[0]?.count ?? 0;
}

export async function listPhashCandidates(phash, selfId = null) {
  const params = [phash];
  let sql =
    "SELECT id, phash FROM assets WHERE mode = 'phash' AND phash IS NOT NULL AND phash <> $1";
  if (selfId) {
    params.push(selfId);
    sql += " AND id <> $2";
  }
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function updateAssetVerification(token, patch) {
  const { chainVerified, duplicateScore } = patch;
  const { rows } = await pool.query(
    `
    UPDATE assets
    SET chain_verified = COALESCE($2, chain_verified),
        duplicate_score = COALESCE($3, duplicate_score),
        updated_at = NOW()
    WHERE token = $1
    RETURNING *;
    `,
    [token, chainVerified, duplicateScore]
  );
  return rows[0] ?? null;
}

export async function getOrCreateMinuteBatch(minuteBucket, batchId) {
  const { rows } = await pool.query(
    `
      INSERT INTO onchain_minute_batches (id, minute_bucket)
      VALUES ($2::uuid, $1::timestamptz)
      ON CONFLICT (minute_bucket)
      DO UPDATE SET minute_bucket = EXCLUDED.minute_bucket
      RETURNING *;
    `,
    [minuteBucket, batchId]
  );
  return rows[0];
}

export async function attachAssetToBatch(assetId, batchId) {
  await pool.query("UPDATE assets SET batch_id = $2 WHERE id = $1", [assetId, batchId]);
  await pool.query(
    "UPDATE onchain_minute_batches SET item_count = item_count + 1 WHERE id = $1",
    [batchId]
  );
}

export async function listDuePendingBatches() {
  const { rows } = await pool.query(
    `
      SELECT *
      FROM onchain_minute_batches
      WHERE status = 'pending'
        AND minute_bucket < date_trunc('minute', now())
      ORDER BY minute_bucket ASC
      LIMIT 50
    `
  );
  return rows;
}

export async function getBatchAssets(batchId) {
  const { rows } = await pool.query(
    `
      SELECT *
      FROM assets
      WHERE batch_id = $1
      ORDER BY captured_timestamp_ms ASC
    `,
    [batchId]
  );
  return rows;
}

export async function markBatchSent(batchId, patch) {
  const { txHash, merkleRoot, onchainTimestampMs } = patch;
  const { rows } = await pool.query(
    `
      UPDATE onchain_minute_batches
      SET status = 'sent',
          tx_hash = $2,
          merkle_root = $3,
          onchain_timestamp_ms = $4,
          sent_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [batchId, txHash ?? null, merkleRoot ?? null, onchainTimestampMs ?? null]
  );
  return rows[0] ?? null;
}

export async function markBatchFailed(batchId) {
  await pool.query(
    "UPDATE onchain_minute_batches SET status = 'failed' WHERE id = $1",
    [batchId]
  );
}

export async function setAssetsOnchainTimestamp(batchId, onchainTimestampMs) {
  await pool.query(
    "UPDATE assets SET onchain_timestamp_ms = $2, chain_verified = TRUE WHERE batch_id = $1",
    [batchId, onchainTimestampMs]
  );
}
