# Verity 정적 웹 (저장소 루트)

검증 UI는 **`index.html`**, **`style.css`**, **`script.js`** — 관리자는 **`admin.html`**, **`admin.css`**, **`admin.js`** 입니다. API는 별도 `server/`에서 제공합니다.

### 로고

기본 헤더 마크는 투명 배경 **`logo-mark.svg`** 입니다. 공식 실루엣 PNG만 있으면 디자인 툴로 누끼 딴 뒤 SVG/PNG로 바꿔 넣거나, `logo-mark.svg` 경로만 교체하면 됩니다.  
전체 **`logo.png`** 는 배포에 포함되며, **`?logo=https://...`** 로 다른 이미지를 쓸 수 있습니다 (흰 배경 PNG는 CSS에서 곱하기 블렌드로 배경을 줄입니다).

검증 페이지에서 **사진/동영상 파일을 업로드**하면 `POST /v1/verify/upload`로 등록되고, 서버가 `{ asset, verification }` JSON으로 응답합니다 (로컬은 `npx serve .` + 서버 `npm run dev`, Pages는 `?api=` 필요).

## 로컬 실행

저장소 루트에서:

```bash
npx serve .
```

## API 연결

1. `window.__VERITY_API_BASE__`
2. URL query: `?api=https://api.example.com`
3. 로컬(`localhost`)이면 `http://localhost:4000`
4. 그 외(예: Vercel에서 `/api` 프록시)에는 `/api`
5. GitHub Pages 배포본(메타 `verity-gh-pages` 주입) 또는 `*.github.io` → 기본 API 없음, **`?api=`** 필요

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
