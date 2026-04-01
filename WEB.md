# Verity 정적 웹 (저장소 루트)

검증 UI는 **`index.html`**, **`style.css`**, **`script.js`** — 관리자는 **`admin.html`**, **`admin.css`**, **`admin.js`** 입니다. API는 별도 `server/`에서 제공합니다.

### 로고

기본 헤더 마크는 투명 배경 **`logo-mark.svg`** 입니다. 공식 실루엣 PNG만 있으면 디자인 툴로 누끼 딴 뒤 SVG/PNG로 바꿔 넣거나, `logo-mark.svg` 경로만 교체하면 됩니다.  
전체 **`logo.png`** 는 배포에 포함되며, **`?logo=https://...`** 로 다른 이미지를 쓸 수 있습니다 (흰 배경 PNG는 CSS에서 곱하기 블렌드로 배경을 줄입니다).

정적 **`index.html`** 은 **검증 전용**입니다. 기본 흐름은 **사진 파일 선택 → 브라우저에서 SHA-256 계산 → `GET /v1/verify/lookup?sha256=`** 로 등록 여부 조회입니다. **검증 토큰** 입력·`/v/{토큰}`·`?id=` 링크도 지원합니다. 미디어 해시 **등록**·머클 봉인은 **백엔드·앱 API**에서 처리합니다. GitHub Pages는 **`VERITY_PAGES_API`** 또는 **`?api=`** 로 API를 지정합니다.

**앱에서 연 검증 링크**가 `http://API호스트:4000/v/토큰` 형태일 때는, `server`가 같은 호스트에서 검증 UI를 제공하므로( `server/README.md` 참고) 별도 Pages 없이도 열립니다. 페이지 상단 머클 카드에 **봉인된 루트·재계산 루트·인덱스 블록·경로(이웃 해시)** 가 함께 표시됩니다.

## 로컬 실행

저장소 루트에서:

```bash
npx serve .
```

## API 연결

우선순위는 다음과 같습니다.

1. `window.__VERITY_API_BASE__` (스크립트보다 먼저 설정한 경우)
2. URL 쿼리: **`?api=https://백엔드주소`** (빌드에 박힌 값보다 우선)
3. `<meta name="verity-default-api" content="..." />` — 로컬/저장소 원본에는 개발용 URL이 들어갈 수 있음. **GitHub Actions 배포 시** `VERITY_PAGES_API`가 있으면 그 값으로 치환되고, **비어 있으면 `content=""`로 비움** (Pages HTML에 `http://` 백엔드가 남지 않음). HTTPS Pages에서는 `http` 메타는 클라이언트가 무시하므로 **`https` API** 또는 `?api=` 필요
4. 로컬(`localhost` / `127.0.0.1`)이면 `http://localhost:4000`
5. 그 외(예: Vercel에서 `/api` 프록시)에는 `/api`

### GitHub Pages + 백엔드 (연동 체크리스트)

Pages는 **HTTPS**로 열리므로, 브라우저에서 `fetch`할 API도 **`https://...` 주소**를 쓰는 것이 필수에 가깝습니다(plain `http://`는 [혼합 콘텐츠](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content)로 차단).

| 단계 | 할 일 |
|------|--------|
| 1 | 백엔드(`server/`)를 **HTTPS**로 공개 (역프록시, Cloudflare Tunnel, Railway/Fly 등). 끝 슬래시 없이 베이스만 사용 (`https://api.example.com`). |
| 2 | 저장소 **Settings → Secrets and variables → Actions → Variables** → **`VERITY_PAGES_API`** 에 위 URL 저장. |
| 3 | **Settings → Pages → Build and deployment → Source: GitHub Actions** 로 설정. |
| 4 | `main` 푸시(또는 Actions에서 **Deploy static site to Pages** 수동 실행). 워크플로가 `index.html`·`admin.html`의 `verity-default-api` 메타에 URL을 주입합니다. |
| 5 | 서버 **`CORS_ORIGIN`**: 기본값 `*` 이면 Pages에서 바로 호출 가능. 운영에서는 `https://<계정>.github.io` 또는 커스텀 도메인을 콤마로 지정 권장 (`server`는 콤마 구분 다중 출처 지원). |

**변수를 비우면** 배포 시 메타가 `content=""`로 비워집니다. 이 경우 사용자는 **`?api=https://백엔드`** 로 열거나, 나중에 변수를 넣고 다시 배포하면 됩니다.

### Pages에서 머클 트리 시각화

검증 페이지의 **머클 경로 시각화**는 다음이 맞아야 동작합니다.

1. **API 연결** — 위 절차대로 `API_BASE`가 백엔드를 가리킴 (`?api=` 또는 주입된 메타).
2. **데이터** — `GET /v1/verify/:token` 응답에 `merkleRoot`, `merkleProof`, `merkleLeafHash`(또는 `assetId`로 리프 재계산 가능)가 있어야 합니다. 자산이 아직 분 배치에 **봉인되지 않았으면** 경로가 비어 있어 시각화 대신 안내 문구만 나옵니다.
3. **Web Crypto** — 시각화·경로 검증은 **HTTPS**(또는 `localhost`)에서만 동작합니다. GitHub Pages는 HTTPS이므로 조건 충족입니다.

토큰 입력 조회 또는 **`/v/{토큰}`** / **`?id=`** 로 들어오면 같은 API로 데이터를 받아 루트(상단)부터 리프까지 경로가 그려집니다.

## GitHub Pages

`.github/workflows/deploy-pages.yml`이 **정적 파일만** `_pages` 폴더에 모아 배포합니다 (전체 모노레포를 올리지 않음).

1. **Settings → Pages → Source: GitHub Actions**
2. `main` 푸시 또는 Actions에서 워크플로 수동 실행
3. 첫 배포 시 `github-pages` Environment 승인이 필요할 수 있음
4. 예전 다크 UI가 보이면 **Source가 Actions인지** 확인하고, 브라우저에서 **강력 새로고침**(Ctrl+F5) 또는 시크릿 창으로 열어보세요. `style.css?v=…` 쿼리로 캐시를 끊습니다.

`/v/{토큰}` 은 `404.html`(=`index.html` 복사본)로 처리합니다. **`.nojekyll`** 로 Jekyll 비활성화.

## Vercel

프로젝트 **Root Directory를 저장소 루트(`.`)** 로 두고 배포하면 됩니다. `vercel.json`에 라우팅이 있습니다.

## Admin

- `/admin` 또는 `admin.html`
- `ADMIN_TOKEN`, API Base URL — `server/README.md` 참고
