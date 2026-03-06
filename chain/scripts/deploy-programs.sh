#!/bin/bash
set -e

CHAIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$CHAIN_DIR/.." && pwd)"
KEYS_DIR="$CHAIN_DIR/keys"

RPC_URL="http://localhost:8899"

echo "============================================"
echo "  Verity Chain - Program Deployment"
echo "============================================"
echo ""

# RPC 연결 확인
echo "[1/3] Checking chain connectivity..."
if ! solana cluster-version --url "$RPC_URL" 2>/dev/null; then
    echo "ERROR: Cannot connect to Verity Chain at $RPC_URL"
    echo "Make sure the validator is running (./scripts/start-validator.sh)"
    exit 1
fi
echo "  Connected to Verity Chain"
echo ""

# Solana CLI를 커스텀 체인으로 설정
solana config set --url "$RPC_URL" --keypair "$KEYS_DIR/validator-identity.json"

# Verity 프로그램 빌드
echo "[2/3] Building programs..."
cd "$ROOT_DIR"
anchor build

PROGRAM_SO="$ROOT_DIR/target/deploy/photo_hash.so"
PROGRAM_KEYPAIR="$ROOT_DIR/target/deploy/photo_hash-keypair.json"

if [ ! -f "$PROGRAM_SO" ]; then
    echo "ERROR: Program binary not found at $PROGRAM_SO"
    exit 1
fi

PROGRAM_ID=$(solana-keygen pubkey "$PROGRAM_KEYPAIR")

# 배포
echo "[3/3] Deploying Verity program..."
echo "  Program ID: $PROGRAM_ID"
solana program deploy \
    --url "$RPC_URL" \
    --keypair "$KEYS_DIR/validator-identity.json" \
    --program-id "$PROGRAM_KEYPAIR" \
    "$PROGRAM_SO"

echo ""
echo "============================================"
echo "  Deployment Complete!"
echo "============================================"
echo ""
echo "  Verity Program: $PROGRAM_ID"
echo "  Chain RPC:         $RPC_URL"
echo ""
echo "  Update your Anchor.toml and app config with this Program ID."
