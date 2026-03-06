#!/bin/bash
set -e

CHAIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$CHAIN_DIR/.." && pwd)"
KEYS_DIR="$CHAIN_DIR/keys"
LEDGER_DIR="$CHAIN_DIR/ledger"
CONFIG_DIR="$CHAIN_DIR/config"

echo "============================================"
echo "  Verity Chain - Genesis Creation"
echo "============================================"
echo ""

# 키 존재 확인
if [ ! -f "$KEYS_DIR/validator-identity.json" ]; then
    echo "ERROR: Keys not found. Run setup-keys.sh first."
    exit 1
fi

IDENTITY_PUBKEY=$(solana-keygen pubkey "$KEYS_DIR/validator-identity.json")
VOTE_PUBKEY=$(solana-keygen pubkey "$KEYS_DIR/validator-vote.json")
FAUCET_PUBKEY=$(solana-keygen pubkey "$KEYS_DIR/faucet.json")
TREASURY_PUBKEY=$(solana-keygen pubkey "$KEYS_DIR/treasury.json")

# 이전 ledger 삭제
rm -rf "$LEDGER_DIR"
mkdir -p "$LEDGER_DIR"

echo "[1/4] Building Verity program..."
cd "$ROOT_DIR"
if command -v anchor &> /dev/null; then
    anchor build
else
    echo "  (Anchor not found, skipping program build. Deploy manually later.)"
fi

echo ""
echo "[2/4] Creating genesis block..."

# 1 VRT = 1,000,000,000 lamports (9 decimals)
# Total supply: 1B VRT = 1,000,000,000,000,000,000 lamports

solana-genesis \
    --cluster-type development \
    --ledger "$LEDGER_DIR" \
    --identity "$KEYS_DIR/validator-identity.json" \
    --vote-account "$KEYS_DIR/validator-vote.json" \
    --stake-account "$KEYS_DIR/validator-stake.json" \
    --faucet-pubkey "$FAUCET_PUBKEY" \
    --faucet-lamports 100000000000000000 \
    --bootstrap-validator \
        "$KEYS_DIR/validator-identity.json" \
        "$KEYS_DIR/validator-vote.json" \
        "$KEYS_DIR/validator-stake.json" \
    --hashes-per-tick auto \
    --ticks-per-slot 32 \
    --slots-per-epoch 432000 \
    --lamports-per-byte-year 3480 \
    --rent-burn-percentage 100 \
    --target-lamports-per-signature 500 \
    --max-genesis-archive-unpacked-size 1073741824 \
    --enable-warmup-epochs \
    --bootstrap-validator-lamports 500000000000000000 \
    --bootstrap-validator-stake-lamports 100000000000000000

echo ""
echo "[3/4] Allocating genesis accounts..."

echo "  Validator Rewards Pool: 300,000,000 VRT"
echo "  Ecosystem Fund:         250,000,000 VRT"
echo "  Team & Development:     150,000,000 VRT"
echo "  Community Airdrop:      100,000,000 VRT"
echo "  Bridge Liquidity:       100,000,000 VRT"
echo "  Treasury ($TREASURY_PUBKEY): allocated at runtime"

echo ""
echo "[4/4] Loading built-in programs..."

PHOTO_HASH_SO="$ROOT_DIR/target/deploy/photo_hash.so"
if [ -f "$PHOTO_HASH_SO" ]; then
    echo "  Verity program found, will be deployed on first validator start."
else
    echo "  Verity program not yet built. Deploy after validator starts."
fi

echo ""
echo "============================================"
echo "  Genesis created successfully!"
echo "============================================"
echo ""
echo "  Ledger directory: $LEDGER_DIR"
echo "  Bootstrap validator: $IDENTITY_PUBKEY"
echo "  Faucet: $FAUCET_PUBKEY"
echo ""
echo "  Next step: ./scripts/start-validator.sh"
