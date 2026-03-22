# OpenCellID 덤프 (로컬 파일)

1. [OpenCellID](https://opencellid.org/)에서 계정·API 키를 발급하고, 약관에 따라 **셀 타워 데이터베이스** 덤프를 내려받습니다. (파일명·형식은 사이트 안내를 따르세요.)
2. CSV 또는 `.csv.gz` 를 이 폴더 등 원하는 경로에 둡니다.
3. 적재:

```bash
cd server
export DATABASE_URL="postgresql://..."
node scripts/import-opencellid.mjs ./data/cell_towers.csv.gz
```

전체 덮어쓰기:

```bash
node scripts/import-opencellid.mjs ./data/cell_towers.csv.gz --truncate
```

테스트용 행 수 제한:

```bash
node scripts/import-opencellid.mjs ./data/sample.csv --max-rows 100000
```

4. 적재 후 관리자로 상태 확인: `GET /v1/admin/opencellid/status` (`x-admin-token`).

서버는 자산 등록(`POST /v1/assets`, `POST /v1/ingest/sha256`) 시 메타의 `androidRadioRawSnapshot.cellScan`이 있으면 **로컬 `opencellid_cells` 테이블**에서 조회해 `serverOpencellidAnalysis` 필드를 메타에 합칩니다 (GPS와의 거리·불일치 등급).
