# Verity

**촬영·등록된 미디어의 출처·무결성을 다루는 풀스택 프로젝트**입니다.  
모바일 앱에서 촬영·업로드하고, 백엔드에 메타데이터·해시를 저장하며, **QR/URL로 열리는 웹 페이지**에서 검증 결과를 보여 줍니다.

---

## 이 레포에서 하는 일

| 구성 | 역할 |
|------|------|
| **`app/`** | React Native(Expo) — 카메라, 업로드, 지갑/체인 연동(설정에 따라 사용) |
| **`server/`** | Express + PostgreSQL — 자산 등록, 검증 API, 배치/머클 등 백엔드 로직 |
| **루트 정적 웹** | `index.html` + `style.css` + `script.js` — 검증 UI; `admin.*` — 관리 화면 |
| **`programs/`** | Solana/Anchor 온체인 프로그램(선택 경로 — 로컬 체인·배포 스크립트와 연동) |
| **`chain/`** | 체인 인프라 스크립트·Docker 등(선택) |

앱과 검증 웹은 **같은 `server` API**를 바라보면 됩니다.

---

## 동작 흐름 (개념)

1. 사용자가 앱에서 **사진/영상을 촬영**하거나 선택합니다.  
2. 기기에서 **해시·(설정 시) pHash** 등을 계산하고, **`server`에 등록**합니다.  
3. 서버는 DB에 기록하고, 필요 시 **검증용 토큰·링크**를 발급합니다.  
4. **루트 웹 페이지**에서 링크/토큰으로 접속하면 API를 호출해 **검증 상태·메타데이터**를 보여 줍니다.

온체인 연동은 프로젝트 설정과 배포 환경에 따라 켜거나 끌 수 있습니다.

---

## 아키텍처 (개략)

```
┌─────────────┐     HTTPS      ┌──────────────────────┐
│  모바일 앱   │ ──────────────► │  server (Express)    │
│  (Expo)     │                 │  + PostgreSQL        │
└─────────────┘                 └──────────┬───────────┘
                                           │
┌─────────────┐     HTTPS (정적+API)      │
│ 루트 웹      │ ◄─────────────────────────┘
│ index.html… │   브라우저에서 ?api= 또는
│ (Pages 등)  │   동일 도메인 /api 프록시
└─────────────┘

선택: programs/ + chain/ ──► 로컬 또는 별도 SVM/Solana 네트워크
```

---

## 프로젝트 구조

```
realthing/
├── index.html, style.css, script.js   # 검증 페이지
├── admin.html, admin.css, admin.js    # 관리자 페이지
├── vercel.json, .nojekyll
├── app/                 # 모바일 앱 (Expo)
├── server/              # API, DB 스키마, (선택) AI 스텁 등
├── programs/            # Anchor 온체인 프로그램
├── chain/               # 체인 스크립트·docker-compose
├── tests/               # Anchor 테스트
├── Anchor.toml
└── Cargo.toml
```

### 검증 웹 (루트) — GitHub Pages

`main` 푸시 시 `.github/workflows/deploy-pages.yml`이 **위 정적 파일만** 모아 **GitHub Pages**에 올립니다 (모노레포 전체 X).

1. 저장소 **Settings → Pages → Source: GitHub Actions**
2. 배포 URL 예: `https://<계정>.github.io/<저장소>/`

자세한 내용은 [`WEB.md`](WEB.md) 를 참고하세요.

---

## 시작하기

### 필요한 것

- **앱 + 서버만**: Node.js 18+
- **온체인까지**: Rust, Solana CLI, Anchor CLI, (선택) Docker

### 백엔드

```bash
cd server
npm install
cp .env.example .env   # DATABASE_URL 등 설정
npm run dev
```

기본 포트는 프로젝트 설정을 따릅니다(예: `4000`).

### 모바일 앱

```bash
cd app
npm install
npx expo start
```

### 온체인(선택)

```bash
cd chain && chmod +x scripts/*.sh   # Unix 환경
./scripts/setup-keys.sh
./scripts/start-local-devnet.sh
anchor build
./chain/scripts/deploy-programs.sh
```

### 체인 Docker(선택)

```bash
cd chain
docker compose up -d
```

---

## 웹 검증 · API

- 검증 페이지 URL: `/v/{token}` 또는 `?id={token}` (호스팅에 따라 `404.html` 등으로 보완)
- 예시 API:
  - `GET /v1/verify/:token`
  - `POST /v1/verify/:token/recheck`

관리자 화면은 **`admin.html`** — `server`의 `README.md`와 환경 변수(`ADMIN_TOKEN` 등)를 참고하세요.

---

## 배포 노트

- **정적 프론트**: 저장소 루트 → GitHub Pages(워크플로) 또는 Vercel(Root `.`)
- **API**: `server`를 별도 호스(Railway, Fly, VPS 등)에 두고, CORS·`VERIFY_BASE_URL`·DB URL을 맞춥니다.
- 프론트가 다른 도메인이면 **`?api=https://api.example.com`** 또는 `window.__VERITY_API_BASE__` 로 API 주소를 넘깁니다.

---

## 라이선스

MIT
