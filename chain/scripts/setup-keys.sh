#!/bin/bash
set -e

CHAIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KEYS_DIR="$CHAIN_DIR/keys"

echo "============================================"
echo "  Verity Chain - Key Generation"
echo "============================================"
echo ""

mkdir -p "$KEYS_DIR"

# 밸리데이터 Identity 키
if [ ! -f "$KEYS_DIR/validator-identity.json" ]; then
    echo "[1/5] Generating validator identity keypair..."
    solana-keygen new --no-bip39-passphrase -o "$KEYS_DIR/validator-identity.json"
else
    echo "[1/5] Validator identity already exists, skipping."
fi

# 밸리데이터 Vote Account 키
if [ ! -f "$KEYS_DIR/validator-vote.json" ]; then
    echo "[2/5] Generating vote account keypair..."
    solana-keygen new --no-bip39-passphrase -o "$KEYS_DIR/validator-vote.json"
else
    echo "[2/5] Vote account already exists, skipping."
fi

# 밸리데이터 Stake Account 키
if [ ! -f "$KEYS_DIR/validator-stake.json" ]; then
    echo "[3/5] Generating stake account keypair..."
    solana-keygen new --no-bip39-passphrase -o "$KEYS_DIR/validator-stake.json"
else
    echo "[3/5] Stake account already exists, skipping."
fi

# Faucet 키 (테스트넷/데브넷용)
if [ ! -f "$KEYS_DIR/faucet.json" ]; then
    echo "[4/5] Generating faucet keypair..."
    solana-keygen new --no-bip39-passphrase -o "$KEYS_DIR/faucet.json"
else
    echo "[4/5] Faucet keypair already exists, skipping."
fi

# Treasury 키
if [ ! -f "$KEYS_DIR/treasury.json" ]; then
    echo "[5/5] Generating treasury keypair..."
    solana-keygen new --no-bip39-passphrase -o "$KEYS_DIR/treasury.json"
else
    echo "[5/5] Treasury keypair already exists, skipping."
fi

echo ""
echo "============================================"
echo "  Keys generated in: $KEYS_DIR"
echo "============================================"
echo ""
echo "Validator Identity: $(solana-keygen pubkey "$KEYS_DIR/validator-identity.json")"
echo "Vote Account:       $(solana-keygen pubkey "$KEYS_DIR/validator-vote.json")"
echo "Stake Account:      $(solana-keygen pubkey "$KEYS_DIR/validator-stake.json")"
echo "Faucet:             $(solana-keygen pubkey "$KEYS_DIR/faucet.json")"
echo "Treasury:           $(solana-keygen pubkey "$KEYS_DIR/treasury.json")"
echo ""
echo "IMPORTANT: Back up these keys securely!"
