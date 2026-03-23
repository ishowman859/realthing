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

/** 한 배치(세그먼트)당 최대 자산 수 */
export const BATCH_ITEM_CAP = 60_000;
/** 이 개수 이상이면 같은 분의 다음 세그먼트 행을 미리 만들어 둠 */
export const BATCH_PREPARE_THRESHOLD = 50_000;
/** 머클 봉인: 이 개수 이상이면 즉시 올림(스케줄 5초와 무관) */
export const BATCH_MERKLE_IMMEDIATE_AT_COUNT = Number(
  process.env.BATCH_MERKLE_IMMEDIATE_AT_COUNT || 50_000
);
/** 머클 봉인: 첫 자산 시각(first_item_at) 기준 이 초가 지나면 봉인 */
export const BATCH_MERKLE_FLUSH_INTERVAL_SEC = Number(
  process.env.BATCH_MERKLE_FLUSH_INTERVAL_SEC || 10
);

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
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
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

export async function listRecentAssets(limit = 50) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const { rows } = await pool.query(
    "SELECT * FROM assets ORDER BY created_at DESC LIMIT $1",
    [safeLimit]
  );
  return rows;
}

export async function getAssetByToken(token) {
  const { rows } = await pool.query("SELECT * FROM assets WHERE token = $1", [
    token,
  ]);
  return rows[0] ?? null;
}

/** 동일 바이트 SHA-256으로 등록된 자산 중 가장 최근 행 (검증 웹 해시 조회용) */
export async function getLatestAssetBySha256(sha256Hex) {
  const h = String(sha256Hex || "").trim().toLowerCase();
  if (!h) return null;
  const { rows } = await pool.query(
    `SELECT * FROM assets
     WHERE sha256 IS NOT NULL AND LOWER(sha256) = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [h]
  );
  return rows[0] ?? null;
}

export async function getLatestAssetByPhash(phashHex) {
  const h = String(phashHex || "").trim().toLowerCase();
  if (!h) return null;
  const { rows } = await pool.query(
    `SELECT * FROM assets
     WHERE phash IS NOT NULL AND LOWER(phash) = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [h]
  );
  return rows[0] ?? null;
}

export async function listAssetsWithPhash(limit = 500) {
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 500));
  const { rows } = await pool.query(
    `SELECT * FROM assets
     WHERE phash IS NOT NULL
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return rows;
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
    "SELECT id, phash FROM assets WHERE phash IS NOT NULL AND phash <> $1";
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

/**
 * 같은 minute_bucket 안에서 item_count < BATCH_ITEM_CAP 인 pending 배치를 고르고,
 * 없으면 새 segment 행을 만듭니다. 동시성은 해당 분 행들에 대한 FOR UPDATE 로 직렬화합니다.
 */
export async function getBatchSlotForMinuteBucket(minuteBucket) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // 같은 minute_bucket 동시 최초 INSERT(세그먼트 0) 경쟁 방지
    await client.query(
      "SELECT pg_advisory_xact_lock(884001, hashtext($1::text))",
      [minuteBucket]
    );
    const { rows: locked } = await client.query(
      `
        SELECT *
        FROM onchain_minute_batches
        WHERE minute_bucket = $1::timestamptz
          AND status = 'pending'
        ORDER BY segment ASC
        FOR UPDATE
      `,
      [minuteBucket]
    );

    let target = locked.find((b) => Number(b.item_count) < BATCH_ITEM_CAP);
    if (!target) {
      const nextSeg =
        locked.length > 0
          ? Math.max(...locked.map((b) => Number(b.segment))) + 1
          : 0;
      const ins = await client.query(
        `
          INSERT INTO onchain_minute_batches (id, minute_bucket, segment, status)
          VALUES (gen_random_uuid(), $1::timestamptz, $2, 'pending')
          RETURNING *
        `,
        [minuteBucket, nextSeg]
      );
      target = ins.rows[0];
    }
    await client.query("COMMIT");
    return target;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function attachAssetToBatch(assetId, batchId) {
  await pool.query("UPDATE assets SET batch_id = $2 WHERE id = $1", [assetId, batchId]);
  const { rows } = await pool.query(
    `
      UPDATE onchain_minute_batches
      SET item_count = item_count + 1,
          first_item_at = COALESCE(first_item_at, NOW())
      WHERE id = $1
      RETURNING id, minute_bucket, segment, item_count, status, first_item_at
    `,
    [batchId]
  );
  return rows[0] ?? null;
}

/**
 * 현재 세그먼트가 5만 건 이상이면 (같은 분) segment+1 pending 행을 미리 INSERT (이미 있으면 생략).
 */
export async function ensureFollowingBatchPrepared(updatedBatchRow) {
  if (!updatedBatchRow) return;
  if (updatedBatchRow.status !== "pending") return;
  const n = Number(updatedBatchRow.item_count);
  if (n < BATCH_PREPARE_THRESHOLD) return;

  const minuteBucket = updatedBatchRow.minute_bucket;
  const seg = Number(updatedBatchRow.segment);
  await pool.query(
    `
      INSERT INTO onchain_minute_batches (id, minute_bucket, segment, status)
      VALUES (gen_random_uuid(), $1::timestamptz, $2, 'pending')
      ON CONFLICT (minute_bucket, segment) DO NOTHING
    `,
    [minuteBucket, seg + 1]
  );
}

/**
 * 머클 봉인 대상: (1) item_count >= 즉시 임계값 또는
 * (2) 첫 자산 시각부터 플러시 간격(초) 경과. 분 경계와 무관.
 */
export async function listBatchesReadyForMerkleFlush() {
  const imm = BATCH_MERKLE_IMMEDIATE_AT_COUNT;
  const sec = BATCH_MERKLE_FLUSH_INTERVAL_SEC;
  const { rows } = await pool.query(
    `
      SELECT *
      FROM onchain_minute_batches
      WHERE status = 'pending'
        AND item_count > 0
        AND (
          item_count >= $1::int
          OR (
            first_item_at IS NOT NULL
            AND first_item_at <= NOW() - ($2::int * interval '1 second')
          )
        )
      ORDER BY minute_bucket ASC, segment ASC
      LIMIT 50
    `,
    [imm, sec]
  );
  return rows;
}

export async function listRecentBatches(limit = 30) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 30));
  const { rows } = await pool.query(
    `
      SELECT *
      FROM onchain_minute_batches
      ORDER BY minute_bucket DESC, segment DESC
      LIMIT $1
    `,
    [safeLimit]
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

export async function getBatchById(batchId) {
  const { rows } = await pool.query(
    `
      SELECT *
      FROM onchain_minute_batches
      WHERE id = $1
      LIMIT 1
    `,
    [batchId]
  );
  return rows[0] ?? null;
}

export async function getNextBlockNumber() {
  const { rows } = await pool.query(
    "SELECT COALESCE(MAX(block_number), 0) + 1 AS next_block FROM onchain_minute_batches"
  );
  return Number(rows[0]?.next_block ?? 1);
}

export async function markBatchSent(batchId, patch) {
  const { txHash, blockNumber, merkleRoot, onchainTimestampMs } = patch;
  const { rows } = await pool.query(
    `
      UPDATE onchain_minute_batches
      SET status = 'sent',
          tx_hash = $2,
          block_number = $3,
          merkle_root = $4,
          onchain_timestamp_ms = $5,
          sent_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      batchId,
      txHash ?? null,
      blockNumber ?? null,
      merkleRoot ?? null,
      onchainTimestampMs ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function markBatchFailed(batchId) {
  await pool.query(
    "UPDATE onchain_minute_batches SET status = 'failed' WHERE id = $1",
    [batchId]
  );
}

/** 미리 만들어 둔 빈 pending 배치(자산 0건)는 분 마감 시 삭제 */
export async function deleteEmptyPendingBatch(batchId) {
  await pool.query(
    `
      DELETE FROM onchain_minute_batches
      WHERE id = $1 AND item_count = 0 AND status = 'pending'
    `,
    [batchId]
  );
}

export async function setAssetsOnchainTimestamp(batchId, onchainTimestampMs) {
  await pool.query(
    "UPDATE assets SET onchain_timestamp_ms = $2, chain_verified = FALSE WHERE batch_id = $1",
    [batchId, onchainTimestampMs]
  );
}

export async function setAssetsMerkleIndex(batchId, patchRows) {
  for (const row of patchRows) {
    await pool.query(
      `
        UPDATE assets
        SET indexed_block_number = $2,
            merkle_leaf_hash = $3,
            merkle_proof_json = $4::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        row.assetId,
        row.indexedBlockNumber ?? null,
        row.merkleLeafHash ?? null,
        JSON.stringify(row.merkleProof ?? []),
      ]
    );
  }
}
