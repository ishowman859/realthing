# Verity 정적 웹 (저장소 루트)

검증 UI는 **`index.html`**, **`style.css`**, **`script.js`** — 관리자는 **`admin.html`**, **`admin.css`**, **`admin.js`** 입니다. API는 별도 `server/`에서 제공합니다.

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

`/v/{토큰}` 은 `404.html`(=`index.html` 복사본)로 처리합니다. **`.nojekyll`** 로 Jekyll 비활성화.

## Vercel

프로젝트 **Root Directory를 저장소 루트(`.`)** 로 두고 배포하면 됩니다. `vercel.json`에 라우팅이 있습니다.

## Admin

- `/admin` 또는 `admin.html`
- `ADMIN_TOKEN`, API Base URL — `server/README.md` 참고
