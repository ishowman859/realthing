CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  serial TEXT UNIQUE,
  owner TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('sha256', 'phash')),
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  sha256 TEXT,
  phash TEXT,
  tee_key_id TEXT,
  tee_signature TEXT,
  tee_payload_json JSONB,
  tee_provider TEXT,
  tee_verified BOOLEAN DEFAULT FALSE,
  captured_timestamp_ms BIGINT NOT NULL,
  onchain_timestamp_ms BIGINT,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  minute_bucket TIMESTAMPTZ NOT NULL,
  batch_id UUID,
  indexed_block_number BIGINT,
  merkle_leaf_hash TEXT,
  merkle_proof_json JSONB,
  sha256_merkle_leaf_hash TEXT,
  sha256_merkle_proof_json JSONB,
  phash_merkle_leaf_hash TEXT,
  phash_merkle_proof_json JSONB,
  ai_risk_score INTEGER,
  metadata_json JSONB,
  chain_tx_signature TEXT,
  chain_verified BOOLEAN DEFAULT FALSE,
  duplicate_score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_owner_created_at
  ON assets (owner, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assets_mode
  ON assets (mode);

CREATE INDEX IF NOT EXISTS idx_assets_sha256
  ON assets (sha256);

CREATE INDEX IF NOT EXISTS idx_assets_token
  ON assets (token);

CREATE INDEX IF NOT EXISTS idx_assets_minute_bucket
  ON assets (minute_bucket);

CREATE INDEX IF NOT EXISTS idx_assets_batch_id
  ON assets (batch_id);

CREATE INDEX IF NOT EXISTS idx_assets_indexed_block_number
  ON assets (indexed_block_number);

CREATE TABLE IF NOT EXISTS onchain_minute_batches (
  id UUID PRIMARY KEY,
  minute_bucket TIMESTAMPTZ NOT NULL,
  segment INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  item_count INTEGER NOT NULL DEFAULT 0,
  tx_hash TEXT,
  block_number BIGINT UNIQUE,
  merkle_root TEXT,
  sha256_merkle_root TEXT,
  phash_merkle_root TEXT,
  merkle_anchor_payload_json JSONB,
  onchain_timestamp_ms BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  first_item_at TIMESTAMPTZ
);

ALTER TABLE assets ADD COLUMN IF NOT EXISTS serial TEXT UNIQUE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS tee_key_id TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS tee_signature TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS tee_payload_json JSONB;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS tee_provider TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS tee_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS captured_timestamp_ms BIGINT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS onchain_timestamp_ms BIGINT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS gps_lat DOUBLE PRECISION;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS gps_lng DOUBLE PRECISION;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS minute_bucket TIMESTAMPTZ;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS indexed_block_number BIGINT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS merkle_leaf_hash TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS merkle_proof_json JSONB;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sha256_merkle_leaf_hash TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sha256_merkle_proof_json JSONB;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS phash_merkle_leaf_hash TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS phash_merkle_proof_json JSONB;
ALTER TABLE onchain_minute_batches ADD COLUMN IF NOT EXISTS block_number BIGINT;
ALTER TABLE onchain_minute_batches ADD COLUMN IF NOT EXISTS sha256_merkle_root TEXT;
ALTER TABLE onchain_minute_batches ADD COLUMN IF NOT EXISTS phash_merkle_root TEXT;
ALTER TABLE onchain_minute_batches ADD COLUMN IF NOT EXISTS merkle_anchor_payload_json JSONB;

-- 분당 여러 배치 세그먼트(segment): 세그먼트당 최대 6만 건, 5만 건 도달 시 다음 세그먼트 선생성(서버 로직)
ALTER TABLE onchain_minute_batches ADD COLUMN IF NOT EXISTS segment INTEGER NOT NULL DEFAULT 0;
ALTER TABLE onchain_minute_batches DROP CONSTRAINT IF EXISTS onchain_minute_batches_minute_bucket_key;
CREATE UNIQUE INDEX IF NOT EXISTS onchain_minute_batches_minute_bucket_segment_uidx
  ON onchain_minute_batches (minute_bucket, segment);

ALTER TABLE onchain_minute_batches ADD COLUMN IF NOT EXISTS first_item_at TIMESTAMPTZ;

UPDATE assets
SET captured_timestamp_ms = EXTRACT(EPOCH FROM created_at) * 1000
WHERE captured_timestamp_ms IS NULL;

UPDATE assets
SET minute_bucket = date_trunc('minute', to_timestamp(captured_timestamp_ms / 1000.0))
WHERE minute_bucket IS NULL;

ALTER TABLE assets
ALTER COLUMN captured_timestamp_ms SET NOT NULL;

ALTER TABLE assets
ALTER COLUMN minute_bucket SET NOT NULL;

-- OpenCellID(또는 동일 스키마) 셀 타워 덤프. import-opencellid 스크립트로 적재.
CREATE TABLE IF NOT EXISTS opencellid_cells (
  radio VARCHAR(8) NOT NULL,
  mcc INTEGER NOT NULL,
  mnc INTEGER NOT NULL,
  area INTEGER NOT NULL,
  cell_id TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  range_m INTEGER,
  samples INTEGER,
  PRIMARY KEY (radio, mcc, mnc, area, cell_id)
);

CREATE INDEX IF NOT EXISTS idx_opencellid_cells_mcc_mnc
  ON opencellid_cells (mcc, mnc, area);
