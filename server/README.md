# Verity Server

앱(`app`)과 웹 검증 페이지(`verify-web`)가 공유해서 사용하는 백엔드입니다.

## 기능

- `POST /v1/assets` 자산 등록 (sha256/phash)
- `GET /v1/assets?owner=...` 내 자산 목록 조회
- `GET /v1/verify/:token` 검증 페이지 조회 데이터
- `POST /v1/verify/:token/recheck` 재검증

## 실행

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

## 구조

- `src/app.js`: Express 앱(라우트/비즈니스 로직)
- `src/index.js`: 로컬 개발용 실행 엔트리(`listen`)
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
- `GET /v1/assets?owner=...`
- `GET /v1/verify/:token`
- `POST /v1/verify/:token/recheck`

## 환경 변수

- `DATABASE_URL` (필수)
- `VERIFY_BASE_URL` (기본: `https://verify.verity.app/v`)
- `AWS_*`, `S3_BUCKET` (선택: 업로드 파일 S3 저장)

## 비고

- 현재 `sha256` 체인 검증은 `chain_tx_signature` 존재 여부 기반의 MVP 체크입니다.
- 실제 운영에서는 Polygon RPC에서 tx/event를 조회해 해시 일치 검증으로 교체해야 합니다.
- `phash` 유사도는 DB 후보군에 대해 해밍거리로 계산하는 MVP 방식이며,
  트래픽 증가 시 Milvus/Pinecone 등 벡터DB로 이전하면 됩니다.
