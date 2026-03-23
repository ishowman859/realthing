/**
 * 분 배치 머클 루트를 Solana에 메모 인스트럭션으로 앵커합니다.
 * devnet / mainnet-beta / testnet — RPC URL로 구분합니다.
 */
import fs from "fs";
import {
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

/** SPL 메모 v2 상한에 맞춤 (UTF-8 바이트) */
const MEMO_MAX_BYTES = 566;

function trim(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function guessClusterFromRpcUrl(rpcUrl) {
  const u = rpcUrl.toLowerCase();
  if (u.includes("devnet")) return "devnet";
  if (u.includes("testnet")) return "testnet";
  if (u.includes("mainnet")) return "mainnet-beta";
  return "unknown";
}

function loadKeypairFromEnv() {
  const pathEnv = trim(process.env.SOLANA_MERKLE_KEYPAIR_PATH);
  if (pathEnv) {
    try {
      const file = fs.readFileSync(pathEnv, "utf8").trim();
      const arr = JSON.parse(file);
      if (Array.isArray(arr) && arr.length === 64) {
        return Keypair.fromSecretKey(Uint8Array.from(arr));
      }
    } catch (e) {
      console.warn("[verity-solana] SOLANA_MERKLE_KEYPAIR_PATH 읽기 실패:", e.message);
    }
  }

  const raw = trim(process.env.SOLANA_MERKLE_KEYPAIR);
  if (!raw) return null;
  try {
    if (raw.startsWith("[")) {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length !== 64) return null;
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    const decoded = bs58.decode(raw);
    if (decoded.length === 64) return Keypair.fromSecretKey(decoded);
  } catch (e) {
    console.warn("[verity-solana] SOLANA_MERKLE_KEYPAIR 파싱 실패:", e.message);
  }
  return null;
}

/**
 * @returns {{ rpcUrl: string, keypair: import("@solana/web3.js").Keypair, cluster: string, commitment: import("@solana/web3.js").Commitment } | null}
 */
export function getSolanaMerkleAnchorOptions() {
  if (trim(process.env.SOLANA_ANCHOR_DISABLED) === "1") return null;

  const rpcUrl = trim(process.env.SOLANA_RPC_URL);
  const keypair = loadKeypairFromEnv();
  if (!rpcUrl || !keypair) return null;

  const cluster =
    trim(process.env.SOLANA_CLUSTER) || guessClusterFromRpcUrl(rpcUrl);
  const c = trim(process.env.SOLANA_COMMITMENT).toLowerCase();
  const commitment =
    c === "processed" || c === "confirmed" || c === "finalized"
      ? c
      : "confirmed";

  return { rpcUrl, keypair, cluster, commitment };
}

/**
 * @param {{ merkleRoot: string, batchId: string, rpcUrl: string, keypair: Keypair, commitment?: string }} opts
 * @returns {Promise<{ signature: string }>}
 */
export async function submitMerkleRootMemo(opts) {
  const { merkleRoot, batchId, rpcUrl, keypair, commitment = "confirmed" } =
    opts;
  const payload = `verity:merkle:v1|${batchId}|${merkleRoot}`;
  const payloadBytes = Buffer.byteLength(payload, "utf8");
  if (payloadBytes > MEMO_MAX_BYTES) {
    throw new Error(
      `merkle memo too long (${payloadBytes} bytes, max ${MEMO_MAX_BYTES})`
    );
  }

  const memoIx = new TransactionInstruction({
    keys: [
      {
        pubkey: keypair.publicKey,
        isSigner: true,
        isWritable: false,
      },
    ],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(payload, "utf8"),
  });

  const connection = new Connection(rpcUrl, commitment);
  const latest = await connection.getLatestBlockhash("finalized");
  const tx = new Transaction();
  tx.feePayer = keypair.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.add(memoIx);

  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    [keypair],
    { commitment, maxRetries: 5 }
  );

  return { signature };
}

export function solanaExplorerTxUrl(cluster, signature) {
  const sig = trim(signature);
  if (!sig) return "";
  const c = cluster || "devnet";
  if (c === "mainnet-beta" || c === "mainnet") {
    return `https://explorer.solana.com/tx/${sig}`;
  }
  if (c === "testnet") {
    return `https://explorer.solana.com/tx/${sig}?cluster=testnet`;
  }
  if (c === "devnet") {
    return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
  }
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}
