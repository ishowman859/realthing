# Verity Server

앱(`app`)과 웹 검증 페이지(저장소 루트 `index.html` 등)가 공유해서 사용하는 백엔드입니다.

## 기능

- `POST /v1/assets` 자산 등록 (sha256/phash, 촬영 시각 기준 분 버킷)
- `POST /v1/ingest/sha256` 기기 SHA-256 수집 (**서버 수신 시각** 기준 1분 버킷). 선택: `phash`(16hex), `mediaType`(photo|video), 동영상 키프레임은 `metadata.videoPhashKeyframes`
- `GET /v1/assets?owner=...` 내 자산 목록 조회
- `POST /v1/anti-spoof/check` Silent-Face-Anti-Spoofing 스푸핑 점수 조회
- `GET /v1/verify/:token` 검증 페이지 조회 데이터
- `POST /v1/verify/:token/recheck` 재검증
- `GET /v1/admin/health` 관리자 보호 라우트 상태 확인
- `GET /v1/admin/assets` 최근 등록 자산 조회 (관리자)
- `GET /v1/admin/batches` 최근 분단위 배치 조회 (관리자)

해시 등록 시 서버는 자산을 **분(minute_bucket) + 세그먼트(segment)** 배치로 묶어 블록 번호를 인덱싱하고,
조회/재검증 시 해당 블록 배치의 머클트리에서 리프 포함 여부를 다시 검증합니다.

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
- `ai/`: Silent-Face-Anti-Spoofing 추론 서버(ONNX)

로컬에서는 `src/index.js`를 실행하고, Vercel에서는 `api/index.js`가 호출됩니다.

## Vercel 배포

1. Vercel에서 새 프로젝트 생성
2. Root Directory를 `server`로 선택
3. Environment Variables 설정
   - `DATABASE_URL` (필수)
   - `VERIFY_BASE_URL` (권장)
   - `CORS_ORIGIN` (권장: 프론트 도메인)
   - `SILENT_FACE_API_URL` (선택: anti-spoof 추론 서버)
4. Deploy

배포 후 다음 API를 사용할 수 있습니다.

- `GET /health`
- `POST /v1/assets`
- `POST /v1/ingest/sha256`
- `GET /v1/assets?owner=...`
- `POST /v1/anti-spoof/check`
- `GET /v1/verify/:token`
- `POST /v1/verify/:token/recheck`
- `GET /v1/admin/health` (`ADMIN_TOKEN` 필요)
- `GET /v1/admin/assets?limit=50` (`ADMIN_TOKEN` 필요)
- `GET /v1/admin/batches?limit=30` (`ADMIN_TOKEN` 필요)

## 환경 변수

- `DATABASE_URL` (필수)
- `VERIFY_BASE_URL` (기본: `https://verify.verity.app/v`)
- `ADMIN_TOKEN` (선택: `/admin`, `/v1/admin/*` 보호용)
- `SILENT_FACE_API_URL` (선택: Silent-Face-Anti-Spoofing 추론 서버 URL)
- `AWS_*`, `S3_BUCKET` (선택: 업로드 파일 S3 저장)

예시:

```env
SILENT_FACE_API_URL=http://localhost:8001/predict
```

## 비고

- `POST /v1/assets`, `POST /v1/ingest/sha256`는 **IP당** 슬라이딩 윈도우로
  기본 **1분에 3회** 업로드(등록) 제한(`UPLOAD_RATE_LIMIT_PER_MINUTE`, `UPLOAD_RATE_WINDOW_MS`, 429 + `retryAfterMs`).
  두 경로 **합산**으로 카운트합니다.
- `POST /v1/assets`, `POST /v1/ingest/sha256`, `POST /v1/anti-spoof/check`에는
  별도로 1초 1회 제한(키: IP/owner 등)이 걸려 있습니다.
- 현재 `sha256` 체인 검증은 `chain_tx_signature` 존재 여부 기반의 MVP 체크입니다.
- 실제 운영에서는 Polygon RPC에서 tx/event를 조회해 해시 일치 검증으로 교체해야 합니다.
- `phash` 유사도는 DB 후보군에 대해 해밍거리로 계산하는 MVP 방식이며,
  트래픽 증가 시 Milvus/Pinecone 등 벡터DB로 이전하면 됩니다.
