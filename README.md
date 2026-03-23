# Verity

촬영·등록된 미디어의 **출처·무결성**을 다루는 모노레포입니다. 모바일에서 등록하고, **Express + PostgreSQL** 백엔드에 해시·메타데이터를 쌓으며, **웹 검증 페이지**에서 QR/공유 URL로 결과를 확인합니다. 배치 단위 **머클 봉인**과, 브라우저에서 **경로만으로 루트를 재검증**하는 흐름을 지원합니다.

---

## 목차

- [구성 요약](#구성-요약)
- [데이터 흐름](#데이터-흐름)
- [디렉터리 구조](#디렉터리-구조)
- [빠른 시작](#빠른-시작)
- [검증 웹 · API 연결](#검증-웹--api-연결)
- [배포](#배포)
- [온체인 · 기타](#온체인--기타)
- [문서](#문서)
- [라이선스](#라이선스)

---

## 구성 요약

| 경로 | 설명 |
|------|------|
| **`app/`** | React Native (Expo) — 촬영·업로드, (설정 시) 지갑/하드웨어 서명 |
| **`server/`** | Express API, PostgreSQL, 업로드·검증, 배치/머클, (선택) S3·AI 연동 |
| **루트 정적 파일** | `index.html` · `style.css` · `script.js` — 공개 검증 UI; `admin.*` — 관리자 UI |
| **`programs/`** | Solana / Anchor 프로그램 (선택) |
| **`chain/`** | 로컬 체인·Docker 등 인프라 스크립트 (선택) |

앱과 검증 웹은 동일한 **`server`** API를 바라보면 됩니다.

---

## 데이터 흐름

1. 앱에서 미디어를 촬영·선택하고 해시 등을 계산한 뒤 **`server`에 등록**합니다.  
2. 서버는 DB에 기록하고, 검증용 **토큰·링크**를 발급합니다.  
3. **검증 페이지**에서 토큰으로 `GET /v1/verify/:token` 등을 호출해 상태·해시·(봉인 후) **머클 경로**를 표시합니다.  
4. 사용자는 **Web Crypto**로 서버가 준 **이웃 해시(머클 경로)**만으로 공개 **머클 루트**까지 직접 이어 붙여 검증할 수 있습니다 (트리 전체 불필요).

온체인 연동은 환경·설정에 따라 켜거나 끕니다.

---

## 디렉터리 구조

```
realthing/
├── index.html, style.css, script.js   # 검증 페이지 (다국어, 머클 경로 UI)
├── admin.html, admin.css, admin.js    # 관리자
├── logo-mark.svg, logo.png            # 브랜드 마크
├── CNAME                              # GitHub Pages 커스텀 도메인(사용 시)
├── .nojekyll, vercel.json
├── .github/workflows/deploy-pages.yml # Pages 정적 배포
├── app/                               # Expo 앱
├── server/                            # API · sql/schema 등
├── programs/                          # Anchor
├── chain/                             # 체인 스크립트
├── tests/                             # Anchor 테스트
├── Anchor.toml, Cargo.toml
└── WEB.md                             # 정적 웹·호스팅 상세
```

---

## 빠른 시작

### 요구 사항

- **앱 + API만**: Node.js 18+  
- **온체인까지**: Rust, Solana CLI, Anchor CLI, (선택) Docker

### API 서버

```bash
cd server
npm install
cp .env.example .env   # DATABASE_URL, CORS_ORIGIN, VERIFY_BASE_URL 등
npm run dev
```

기본 포트는 **`PORT`** 환경 변수(예: `4000`). 상세는 [`server/README.md`](server/README.md).

### 모바일 앱

```bash
cd app
npm install
npx expo start
```

### 검증 페이지만 로컬에서

```bash
# 저장소 루트
npx serve .
```

브라우저에서 `http://localhost:3000/?api=http://localhost:4000` 처럼 API 베이스를 넘깁니다.

---

## 검증 웹 · API 연결

정적 페이지는 API 주소를 스스로 모르므로, 다음 중 하나로 **베이스 URL**을 지정합니다.

1. **GitHub Actions 변수 `VERITY_PAGES_API`** — Pages 배포 시 `index.html` / `admin.html` 메타에 주입 ([`WEB.md`](WEB.md) 체크리스트). HTTPS URL만 사용.  
2. URL 쿼리: **`?api=https://api.example.com`** (변수 없이 배포했을 때·임시 테스트용)  
3. **`window.__VERITY_API_BASE__`** (임베드 시)  
4. 로컬 호스트에서는 기본값으로 `http://localhost:4000`  
5. 같은 사이트 **`/api`** 프록시를 쓰는 호스팅(Vercel 등)은 상대 경로 `/api`

대표 엔드포인트:

- `GET /v1/verify/:token` — 검증 JSON (`merkleProof`, `merkleRoot`, `assetId` 등). **머클 경로 시각화**도 이 응답을 사용합니다.  
- `POST /v1/verify/:token/recheck`  

토큰 기반 URL: **`/v/{token}`** 또는 **`?id={token}`** (Pages에서는 `404.html`이 `index.html`과 동일 복사본으로 SPA식 동작).

**CORS**: `server`의 **`CORS_ORIGIN`**에 검증 페이지 도메인을 넣습니다 (운영에서는 `*` 대신 구체 도메인 권장).

자세한 호스팅·로고·캐시는 [**`WEB.md`**](WEB.md)를 참고하세요.

---

## 배포

| 대상 | 방법 |
|------|------|
| **정적 검증·관리 UI** | GitHub Actions → Pages (`deploy-pages.yml`). 저장소 **Settings → Pages → Source: GitHub Actions**. 커스텀 도메인은 `CNAME` + DNS |
| **동일 루트 Vercel** | 프로젝트 Root를 `.` 로 두고 배포 (`vercel.json` 라우팅) |
| **API** | `server/`를 Railway, Fly, **AWS EC2/ECS**, 등 임의 호스트에 올리고 HTTPS·DB·환경 변수 정리 |

프로덕션 체크리스트 예시:

- **`DATABASE_URL`** (예: RDS PostgreSQL)  
- **`VERIFY_BASE_URL`** — 사용자에게 나가는 검증 링크 접두어(실제 웹 도메인·경로와 일치)  
- **`CORS_ORIGIN`** — `https://검증-프론트-도메인`  
- (선택) **S3** 업로드: `AWS_*`, `S3_BUCKET` 등 — `server/.env.example` 참고  

---

## 온체인 · 기타

- Anchor 프로그램: `programs/`, `Anchor.toml`  
- 로컬 넷·Docker: [`chain/README.md`](chain/README.md)  
- 서버 측 AI 스텁 등: [`server/ai/README.md`](server/ai/README.md)

---

## 문서

| 파일 | 내용 |
|------|------|
| [**WEB.md**](WEB.md) | 정적 웹, `?api=`, Pages, Vercel, Admin |
| [**server/README.md**](server/README.md) | API, DB, 머클 배치, 환경 변수, 관리자 토큰 |

---

## 라이선스

MIT
