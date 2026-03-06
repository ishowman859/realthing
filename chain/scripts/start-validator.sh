#!/bin/bash
set -e

CHAIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$CHAIN_DIR/.." && pwd)"
KEYS_DIR="$CHAIN_DIR/keys"
LEDGER_DIR="$CHAIN_DIR/ledger"
LOG_DIR="$CHAIN_DIR/logs"

echo "============================================"
echo "  Verity Chain - Validator Start"
echo "============================================"
echo ""

mkdir -p "$LOG_DIR"

if [ ! -d "$LEDGER_DIR" ]; then
    echo "ERROR: Ledger not found. Run create-genesis.sh first."
    exit 1
fi

IDENTITY_PUBKEY=$(solana-keygen pubkey "$KEYS_DIR/validator-identity.json")
VOTE_PUBKEY=$(solana-keygen pubkey "$KEYS_DIR/validator-vote.json")

echo "Identity:     $IDENTITY_PUBKEY"
echo "Vote Account: $VOTE_PUBKEY"
echo "RPC:          http://localhost:8899"
echo "WebSocket:    ws://localhost:8900"
echo ""

# Verity 프로그램 BPF 자동 로드
BPF_ARGS=""
PHOTO_HASH_SO="$ROOT_DIR/target/deploy/photo_hash.so"
PHOTO_HASH_KEYPAIR="$ROOT_DIR/target/deploy/photo_hash-keypair.json"

if [ -f "$PHOTO_HASH_SO" ] && [ -f "$PHOTO_HASH_KEYPAIR" ]; then
    PROGRAM_ID=$(solana-keygen pubkey "$PHOTO_HASH_KEYPAIR")
    BPF_ARGS="--bpf-program $PROGRAM_ID BPFLoader2111111111111111111111111111111111 $PHOTO_HASH_SO"
    echo "Loading Verity program: $PROGRAM_ID"
fi

echo ""
echo "Starting validator..."
echo "Log file: $LOG_DIR/validator.log"
echo ""

exec solana-validator \
    --identity "$KEYS_DIR/validator-identity.json" \
    --vote-account "$KEYS_DIR/validator-vote.json" \
    --ledger "$LEDGER_DIR" \
    --rpc-port 8899 \
    --rpc-bind-address 0.0.0.0 \
    --dynamic-port-range 8000-8020 \
    --gossip-port 8001 \
    --no-os-network-limits-test \
    --no-wait-for-vote-to-start-leader \
    --enable-rpc-transaction-history \
    --enable-extended-tx-metadata-storage \
    --full-rpc-api \
    --allow-private-addr \
    --log "$LOG_DIR/validator.log" \
    --limit-ledger-size 50000000 \
    $BPF_ARGS
