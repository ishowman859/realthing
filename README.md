# Verity Chain

**SVM(Solana Virtual Machine) 기반 커스텀 블록체인 — 사진 원본 증명 전용 Appchain**

월드코인이 World Chain을 만든 것처럼, Verity는 솔라나 VM 위에 자체 체인을 구축하여
사진의 pHash(Perceptual Hash)를 온체인에 기록하고 원본 증명/위변조 감지를 수행합니다.

## 아키텍처

```
┌──────────────────────────────────────────────────┐
│               Verity Chain (SVM)                 │
│                                                  │
│  ┌─────────────┐  ┌────────────┐  ┌───────────┐ │
│  │ VRT Token   │  │ Verity     │  │ Bridge    │ │
│  │ (Native)    │  │ Program    │  │ Program   │ │
│  └─────────────┘  └────────────┘  └───────────┘ │
│                                                  │
│  Block Time: 200ms  |  Fee: ~무료  |  SVM 호환   │
│  합의: Tower BFT    |  밸리데이터: Permissioned   │
└──────────────────┬───────────────────────────────┘
                   │ Bridge (Lock & Mint)
┌──────────────────┴───────────────────────────────┐
│               Solana Mainnet                      │
│  ┌────────────────────────────────────────────┐  │
│  │ Bridge Program (SOL ↔ VRT 교환)            │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## 프로젝트 구조

```
verity/
├── chain/                          # 체인 인프라
│   ├── config/
│   │   ├── chain-config.json         # 체인 파라미터 (블록타임, 수수료 등)
│   │   ├── genesis-accounts.json     # 제네시스 토큰 분배
│   │   └── nginx.conf                # RPC 프록시 설정
│   ├── scripts/
│   │   ├── setup-keys.sh             # 밸리데이터 키 생성
│   │   ├── create-genesis.sh         # 제네시스 블록 생성
│   │   ├── start-validator.sh        # 프로덕션 밸리데이터 실행
│   │   ├── start-local-devnet.sh     # 로컬 개발용 체인
│   │   └── deploy-programs.sh        # 프로그램 배포
│   └── docker-compose.yml           # Docker 기반 풀 스택
│
├── programs/                       # 온체인 프로그램 (Rust/Anchor)
│   ├── photo-hash/                   # 핵심: pHash 등록/검증
│   ├── pht-token/                    # Verity Token (거버넌스 + 보상)
│   └── bridge/                       # SOL ↔ VRT 브릿지
│
├── app/                            # 모바일 앱 (React Native/Expo)
│   ├── src/
│   │   ├── screens/                  # 홈, 카메라, 히스토리
│   │   ├── hooks/                    # 지갑, 포토해시 로직
│   │   └── utils/                    # pHash 알고리즘, 체인 연동
│   ├── eas.json                      # Android/iOS 빌드 설정
│   └── package.json
│
├── server/                         # 앱/웹 공용 백엔드 API (Express + Postgres)
│   ├── src/
│   │   ├── index.js                  # REST API 엔트리
│   │   ├── db.js                     # DB 접근/스키마 초기화
│   │   ├── s3.js                     # S3 업로드 유틸
│   │   └── phash.js                  # pHash 유사도 계산
│   ├── sql/schema.sql               # 테이블 정의
│   └── package.json
│
├── verify-web/                     # QR/URL 검증 웹 페이지
│   └── index.html
│
├── tests/                          # Anchor 테스트
├── Anchor.toml
├── Cargo.toml
└── README.md
```

## VRT 토큰 이코노미

| 배분 | 비율 | 수량 | 용도 |
|------|------|------|------|
| 밸리데이터 보상 | 30% | 300M VRT | 스테이킹 보상 |
| 생태계 펀드 | 25% | 250M VRT | 파트너십, 그랜트 |
| 팀 & 개발 | 15% | 150M VRT | 1년 클리프 + 3년 베스팅 |
| 커뮤니티 에어드랍 | 10% | 100M VRT | 얼리어답터 보상 |
| 브릿지 유동성 | 10% | 100M VRT | SOL↔VRT 교환 풀 |
| DAO 트레저리 | 10% | 100M VRT | 거버넌스 투표로 운영 |

**Photo-to-Earn**: 사진 등록 시 100 VRT 보상 지급

## 시작하기

### 사전 요구사항

- Rust + Cargo (rustup)
- Solana CLI v1.18+
- Anchor CLI v0.30+
- Node.js 18+
- Docker (선택, 풀스택 실행 시)

### 1. 로컬 체인 실행

```bash
# 키 생성
cd chain && chmod +x scripts/*.sh
./scripts/setup-keys.sh

# 로컬 개발 체인 시작
./scripts/start-local-devnet.sh
```

### 2. 프로그램 빌드 & 배포

```bash
# 빌드
anchor build

# 로컬 체인에 배포
./chain/scripts/deploy-programs.sh
```

### 3. 모바일 앱 실행

```bash
cd app
npm install
npx expo start
```

### 4. Docker로 풀스택 실행

```bash
cd chain
docker-compose up -d
```

## 핵심 플로우

1. **지갑 연결** → Phantom 앱으로 Verity Chain 연결
2. **사진 촬영** → expo-camera로 촬영
3. **pHash 계산** → DCT 기반 perceptual hash 추출 (클라이언트)
4. **온체인 등록** → Verity Program으로 pHash 기록 + VRT 보상 수령
5. **히스토리 조회** → 내 등록 기록을 VRT Explorer에서 확인
6. **브릿지** → SOL을 VRT로 교환하거나 반대로 출금

## 웹/백엔드 연동

`verify-web/index.html`은 QR/공유 URL로 접속한 자산 검증 페이지입니다.
검증 데이터는 `server` API를 호출해 조회합니다.

- URL 규칙: `/v/{token}` 또는 `?id={token}`
- 호출 API:
  - `GET /v1/verify/:token` (검증 결과 조회)
  - `POST /v1/verify/:token/recheck` (재검증 요청)
- 기본 API 서버: `http://localhost:4000`
  - 배포 시 동일 도메인 API 프록시 또는 `window.__VERITY_API_BASE__`로 변경

즉, 모바일 앱과 웹 검증 페이지는 **같은 서버 API를 공유**해서 사용하면 됩니다.

## 서버 빠른 시작

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

## 프론트엔드/서버 분리 구조 (Vercel)

- 프론트엔드: `verify-web/` (정적 검증 페이지)
- 서버(API): `server/` (Express + PostgreSQL)

각 디렉토리에 Vercel 설정을 분리해 둬서, 배포 시 **프로젝트 2개**로 연결하면 됩니다.

1. `verify-web` 프로젝트 생성 (Framework: Other)
   - Root Directory: `verify-web`
   - 도메인 예: `verify.verity.app`
2. `server` 프로젝트 생성 (Framework: Other)
   - Root Directory: `server`
   - 도메인 예: `api.verity.app`
   - 환경변수: `DATABASE_URL`, `VERIFY_BASE_URL`, `CORS_ORIGIN`
3. 프론트에서 API 연결
   - 같은 도메인 프록시면 기본값(`/api`) 사용
   - 분리 도메인이면 URL에 `?api=https://api.verity.app`를 붙이거나 `window.__VERITY_API_BASE__` 주입

즉, DB는 `server`에서만 관리하고, `verify-web`은 API 호출만 담당하는 분리 구조로 운영할 수 있습니다.

## 라이선스

MIT
