# Verity Verify Web

정적 검증 페이지 프론트엔드입니다. API 서버는 별도(`server`)로 분리되어 있습니다.

## 로컬 실행

정적 파일이므로 간단한 HTTP 서버로 실행합니다.

```bash
cd verify-web
npx serve .
```

## API 연결

우선순위:

1. `window.__VERITY_API_BASE__`
2. URL query: `?api=https://api.example.com`
3. 로컬(`localhost`)이면 `http://localhost:4000`
4. 그 외에는 `/api`

예시:

- `https://verify.verity.app/v/abc123?api=https://api.verity.app`

## Vercel 배포

1. Vercel에서 새 프로젝트 생성
2. Root Directory를 `verify-web`로 설정
3. Deploy

`vercel.json`에 SPA/토큰 URL 라우팅(`/v/:token`)이 포함되어 있습니다.

## Admin 페이지

- 경로: `/admin` (또는 `/admin.html`)
- 필요값: `ADMIN_TOKEN`
- 조회 API:
  - `GET /v1/admin/health`
  - `GET /v1/admin/assets?limit=50`
  - `GET /v1/admin/batches?limit=30`

`admin.html`에서 API Base URL과 관리자 토큰을 입력하면 최근 자산/배치 데이터를 확인할 수 있습니다.

