# Verity 정적 웹 (저장소 루트)

검증 UI는 **`index.html`**, **`style.css`**, **`script.js`** — 관리자는 **`admin.html`**, **`admin.css`**, **`admin.js`** 입니다. API는 별도 `server/`에서 제공합니다.

### 로고

기본 헤더 마크는 투명 배경 **`logo-mark.svg`** 입니다. 공식 실루엣 PNG만 있으면 디자인 툴로 누끼 딴 뒤 SVG/PNG로 바꿔 넣거나, `logo-mark.svg` 경로만 교체하면 됩니다.  
전체 **`logo.png`** 는 배포에 포함되며, **`?logo=https://...`** 로 다른 이미지를 쓸 수 있습니다 (흰 배경 PNG는 CSS에서 곱하기 블렌드로 배경을 줄입니다).

**Backpack 연결**로 브라우저 확장 지갑을 연 뒤 Solana 주소가 `owner`에 채워지고, **사진/동영상 업로드** 시 `POST /v1/verify/upload`로 해당 `owner`가 서버에 전달됩니다. (이 버튼은 Backpack 전용이며 Phantom 등은 연결하지 않습니다.) 로컬은 `npx serve .` + 서버 `npm run dev`면 기본 `http://localhost:4000`을 씁니다. GitHub Pages는 **`VERITY_PAGES_API`** 또는 **`?api=`** 로 백엔드를 지정합니다.

## 로컬 실행

저장소 루트에서:

```bash
npx serve .
```

## API 연결

우선순위는 다음과 같습니다.

1. `window.__VERITY_API_BASE__` (스크립트보다 먼저 설정한 경우)
2. URL 쿼리: **`?api=https://백엔드주소`** (빌드에 박힌 값보다 우선)
3. `<meta name="verity-default-api" content="..." />` — 로컬 `index.html` / `admin.html`에 직접 넣거나, **GitHub Actions 배포 시 주입**
4. 로컬(`localhost` / `127.0.0.1`)이면 `http://localhost:4000`
5. 그 외(예: Vercel에서 `/api` 프록시)에는 `/api`

### GitHub Pages + 백엔드

Pages는 **HTTPS**로 열리므로, 브라우저에서 `fetch`할 API도 **`https://...`인 주소**를 쓰는 것이 안전합니다(plain `http://`는 [혼합 콘텐츠](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content)로 차단될 수 있음).

1. 저장소 **Settings → Secrets and variables → Actions → Variables** 에서 **`VERITY_PAGES_API`** 추가  
   예: `https://api.example.com` (끝 슬래시 없이)
2. `main` 푸시 후 Pages 워크플로가 `index.html` / `admin.html`의 `verity-default-api` 메타에 위 값을 넣습니다.
3. 변수를 비워 두면 예전처럼 **`?api=https://백엔드주소`** 로만 지정할 수 있습니다.

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
