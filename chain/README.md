# Verity Chain (VRT Chain)

Solana VM(SVM) 기반 커스텀 체인 — 사진 원본 증명 전용 Appchain

## 아키텍처

```
┌─────────────────────────────────────────────┐
│               Verity Chain (SVM)             │
│                                             │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ VRT Token   │  │ Verity Program       │  │
│  │ (Native)    │  │ (pHash Registration) │  │
│  └─────────────┘  └──────────────────────┘  │
│                                             │
│  Custom Block Time: 200ms                   │
│  Custom Fee: Near-zero                      │
│  Validators: Permissioned                   │
└────────────────┬────────────────────────────┘
                 │ Bridge (Wormhole / Custom)
┌────────────────┴────────────────────────────┐
│           Solana Mainnet                     │
│  ┌──────────────────────────────────────┐   │
│  │ Bridge Program (SOL ↔ VRT)          │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## 체인 사양

| 항목 | 값 |
|------|-----|
| VM | Solana Virtual Machine (SVM) |
| 네이티브 토큰 | VRT (Verity Token) |
| 초기 공급량 | 1,000,000,000 VRT |
| 블록 타임 | 200ms |
| Tx 수수료 | 0.000005 VRT (~무료) |
| 합의 방식 | Tower BFT (Permissioned Validators) |
| 목적 | 사진 pHash 온체인 등록 전용 |

## 시작하기

```bash
# 1. 체인 키 생성
cd chain
./scripts/setup-keys.sh

# 2. Genesis 생성
./scripts/create-genesis.sh

# 3. 밸리데이터 실행
./scripts/start-validator.sh

# 4. 프로그램 배포
./scripts/deploy-programs.sh
```
