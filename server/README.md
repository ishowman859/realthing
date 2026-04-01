# Verity Server

앱(`app`)과 웹 검증 페이지(저장소 루트 `index.html` 등)가 공유해서 사용하는 백엔드입니다.

## 기능

- `POST /v1/assets` 자산 등록 (sha256/phash, 촬영 시각 기준 분 버킷)
- `POST /v1/ingest/sha256` 기기 SHA-256 수집 (**서버 수신 시각** 기준 1분 버킷). 선택: `phash`(16hex), `mediaType`(photo|video), 동영상 키프레임은 `metadata.videoPhashKeyframes`
- `GET /v1/assets?owner=...` 내 자산 목록 조회
- `GET /v1/verify/lookup?sha256=...` **파일 SHA-256(hex)** 으로 등록 기록 조회 (검증 웹에서 브라우저가 해시 계산 후 호출). `mode=sha256` 이고 동일 해시가 없으면 404
- `GET /v1/verify/:token` 검증 페이지 조회 데이터
- `POST /v1/verify/:token/recheck` 재검증
- `POST /v1/verify/upload` **multipart** `file` 필드 — 사진/동영상 바이트로 SHA-256·(이미지면 8×8 평균 해시) 계산 후 `phash` 모드로 등록, `{ asset, verification }` JSON 반환 (검증 웹 업로드용)
- `GET /v1/admin/health` 관리자 보호 라우트 상태 확인
- `GET /v1/admin/assets` 최근 등록 자산 조회 (관리자)
- `GET /v1/admin/batches` 최근 분단위 배치 조회 (관리자)

해시 등록 시 서버는 자산을 **분(minute_bucket) + 세그먼트(segment)** 배치로 묶어 블록 번호를 인덱싱하고,
조회/재검증 시 해당 블록 배치의 머클트리에서 리프 포함 여부를 다시 검증합니다.  
`GET /v1/verify/:token` 응답에는 브라우저가 리프를 재계산할 수 있도록 **`assetId`**(내부 UUID)와 **`merkleProof`**(이웃 해시 경로), **`merkleRoot`** 가 포함됩니다. 정적 검증 페이지에서 Web Crypto로 경로를 직접 이어 붙여 루트를 맞출 수 있습니다.

### Solana 머클 앵커 (mainnet / devnet)

`SOLANA_RPC_URL` 과 `SOLANA_MERKLE_KEYPAIR`(또는 `SOLANA_MERKLE_KEYPAIR_PATH`)가 모두 설정되면, 배치가 봉인될 때 **메모 프로그램**(`MemoSq4…`)으로 트랜잭션을 보내 문자열  
`verity:merkle:v1|{batchId}|{merkleRootHex}`  
를 온체인에 남깁니다. 서명은 **수수료만 지불**(일반적으로 매우 소액의 SOL)합니다.

- **미설정**: 기존과 같이 `vrt_batch_…` 형태의 **모의** `tx_hash`만 DB에 저장합니다.
- **전송 실패**: 해당 배치는 `pending`으로 남고, 다음 스케줄 주기에 다시 시도합니다.
- **`SOLANA_ANCHOR_DISABLED=1`**: 키가 있어도 온체인 전송을 하지 않습니다.

메인넷 사용 시 RPC(예: Helius, QuickNode)와 **별도 faucet이 없는** 실제 SOL 잔액이 필요합니다.

- 세그먼트당 최대 **6만 건** (`BATCH_ITEM_CAP`).
- 한 세그먼트의 `item_count`가 **5만 이상**이면 같은 분의 **다음 segment 행을 미리 INSERT** (빈 pending, 충돌 시 무시).
- **머클 봉인(올리기)** 조건 — 둘 중 먼저 만족 시 해당 세그먼트를 `sent` 처리:
  1. `item_count >= 5만` → **즉시** 머클 생성 후 봉인 (`BATCH_MERKLE_IMMEDIATE_AT_COUNT`).
  2. 첫 자산 시각 `first_item_at` 기준 **5초** 경과 → 주기 봉인 (`BATCH_MERKLE_FLUSH_INTERVAL_SEC`, 로컬은 `index.js`에서 5초마다 `processMinuteBatches` 호출).
- **수집 요청이 없으면** `BATCH_SCHEDULER_IDLE_MS`(기본 30초) 동안 스케줄러는 머클 작업을 **건너뜀** (`batchActivity.js`). `POST /v1/assets`·`POST /v1/ingest/sha256` 호출 시 활동이 갱신됩니다.
- Vercel 등 서버리스는 `setInterval`이 없으므로, 동일 로직을 **외부 크론** 등으로 주기 호출해야 합니다.

## 실행

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

## 구조

- `src/app.js`: Express 앱(라우트/비즈니스 로직)
- `src/batchActivity.js`: 수집 API 활동 시각(유휴 시 머클 스케줄 스킵)
- `src/index.js`: 로컬 개발용 실행 엔트리(`listen`, 5초마다 `processMinuteBatches`)
- `api/index.js`: Vercel Serverless Function 엔트리

로컬에서는 `src/index.js`를 실행하고, Vercel에서는 `api/index.js`가 호출됩니다.

## Vercel 배포

1. Vercel에서 새 프로젝트 생성
2. Root Directory를 `server`로 선택
3. Environment Variables 설정
   - `DATABASE_URL` (필수)
   - `VERIFY_BASE_URL` (권장)
   - `CORS_ORIGIN` (권장: 프론트 도메인)
4. Deploy

배포 후 다음 API를 사용할 수 있습니다.

- `GET /health`
- `POST /v1/assets`
- `POST /v1/ingest/sha256`
- `GET /v1/assets?owner=...`
- `GET /v1/verify/:token`
- `POST /v1/verify/:token/recheck`
- `POST /v1/verify/upload` (multipart `file`, 선택 `owner`)
- `GET /v1/admin/health` (`ADMIN_TOKEN` 필요)
- `GET /v1/admin/assets?limit=50` (`ADMIN_TOKEN` 필요)
- `GET /v1/admin/batches?limit=30` (`ADMIN_TOKEN` 필요)

## 검증 웹 (`/v/:token`)

API 서버와 같은 프로세스에서 **저장소 루트의 `index.html`·`script.js`·`style.css`** 등을 내려줍니다. 모노레포에서 `server/` 상위가 웹 루트라고 가정합니다. 다른 경로면 `VERIFY_STATIC_DIR`에 절대 경로를 지정하세요.

- `GET /v/:token` → 검증 SPA (내부에서 `GET /verity-static/script.js` 등으로 자산 로드)
- 앱/QR의 검증 링크가 **API 호스트와 동일**이면 브라우저가 같은 origin으로 API를 호출합니다.

공개 URL이 `http://YOUR_IP:4000` 이라면 **`VERIFY_BASE_URL=http://YOUR_IP:4000/v`** 로 맞추면 API 응답의 `verificationUrl`·QR도 동일 호스트를 가리킵니다.

## 환경 변수

- `DATABASE_URL` (필수)
- `VERIFY_BASE_URL` (기본: `https://verify.verity.app/v` — 자가 호스팅 시 위처럼 본인 `/v` URL로 변경)
- `VERIFY_STATIC_DIR` (선택: 검증 UI 정적 파일이 있는 디렉터리, 기본은 저장소 루트)
- `ADMIN_TOKEN` (선택: `/admin`, `/v1/admin/*` 보호용)
- `AWS_*`, `S3_BUCKET` (선택: 업로드 파일 S3 저장)
- `SOLANA_RPC_URL`, `SOLANA_MERKLE_KEYPAIR` / `SOLANA_MERKLE_KEYPAIR_PATH` (선택: 머클 루트 Solana 메모 앵커)
- `SOLANA_CLUSTER` (선택: `mainnet-beta` / `devnet` / `testnet`, 미설정 시 RPC URL로 추정)
- `SOLANA_COMMITMENT` (선택: `confirmed` 기본)
- `SOLANA_ANCHOR_DISABLED=1` (선택: 앵커 끄기)

## 비고

- `POST /v1/assets`, `POST /v1/ingest/sha256`, `POST /v1/verify/upload`는 **IP당** 슬라이딩 윈도우로
  기본 **1분에 3회** 업로드(등록) 제한(`UPLOAD_RATE_LIMIT_PER_MINUTE`, `UPLOAD_RATE_WINDOW_MS`, 429 + `retryAfterMs`).
  세 경로 **합산**으로 카운트합니다.
- `POST /v1/assets`, `POST /v1/ingest/sha256`, `POST /v1/verify/upload`에는
  별도로 1초 1회 제한(키: IP/owner 등)이 걸려 있습니다.
- 검증 API의 `chainVerified`는 **DB 내 머클 일관성**(리프·경로·루트 재계산) 기준입니다. Solana 앵커가 성공하면 `chainTxSignature`에 **실제 서명(base58)** 이 들어가며, 익스플로러에서 메모 내용을 확인할 수 있습니다. (클라이언트가 RPC로 메모를 재검증하는 단계는 선택 구현입니다.)
- `phash` 유사도는 DB 후보군에 대해 해밍거리로 계산하는 MVP 방식이며,
  트래픽 증가 시 Milvus/Pinecone 등 벡터DB로 이전하면 됩니다.
