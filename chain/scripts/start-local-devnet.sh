#!/bin/bash
set -e

CHAIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$CHAIN_DIR/.." && pwd)"
LOG_DIR="$CHAIN_DIR/logs"

echo "============================================"
echo "  Verity Chain - Local Development Mode"
echo "============================================"
echo ""
echo "  This starts a lightweight local validator"
echo "  with the Verity program pre-loaded."
echo ""

mkdir -p "$LOG_DIR"

# 프로그램 빌드 시도
cd "$ROOT_DIR"
if command -v anchor &> /dev/null; then
    echo "Building Verity program..."
    anchor build 2>/dev/null || echo "Build skipped (ensure Rust + Anchor are installed)"
fi

# BPF 프로그램 로드 옵션
BPF_ARGS=""
PHOTO_HASH_SO="$ROOT_DIR/target/deploy/photo_hash.so"
PHOTO_HASH_KEYPAIR="$ROOT_DIR/target/deploy/photo_hash-keypair.json"

if [ -f "$PHOTO_HASH_SO" ] && [ -f "$PHOTO_HASH_KEYPAIR" ]; then
    PROGRAM_ID=$(solana-keygen pubkey "$PHOTO_HASH_KEYPAIR")
    BPF_ARGS="--bpf-program $PROGRAM_ID BPFLoader2111111111111111111111111111111111 $PHOTO_HASH_SO"
    echo "Pre-loading program: $PROGRAM_ID"
fi

echo ""
echo "Starting local devnet..."
echo "  RPC:       http://localhost:8899"
echo "  WebSocket: ws://localhost:8900"
echo "  Faucet:    Available (unlimited SOL/VRT for testing)"
echo ""
echo "Press Ctrl+C to stop."
echo ""

# solana-test-validator로 로컬 개발 체인 시작
exec solana-test-validator \
    --rpc-port 8899 \
    --ticks-per-slot 32 \
    --slots-per-epoch 50 \
    --limit-ledger-size 50000000 \
    --log "$LOG_DIR/devnet.log" \
    $BPF_ARGS \
    --reset
