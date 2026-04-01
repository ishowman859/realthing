/**
 * 배치별 SHA-256/pHash 머클 루트를 Solana에 메모 인스트럭션으로 앵커합니다.
 * mainnet-beta / devnet / testnet — RPC URL로 구분합니다.
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
import { getRuntimeSolanaConfig } from "./runtimeConfig.js";

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

export function parseSolanaKeypair(rawValue) {
  const raw = trim(rawValue);
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
    console.warn("[verity-solana] Solana 키 파싱 실패:", e.message);
  }
  return null;
}

/**
 * @returns {{ rpcUrl: string, keypair: import("@solana/web3.js").Keypair, cluster: string, commitment: import("@solana/web3.js").Commitment } | null}
 */
export function getSolanaMerkleAnchorOptions() {
  const runtimeConfig = getRuntimeSolanaConfig();
  const runtimeDisabled =
    runtimeConfig.anchorDisabled === true || runtimeConfig.anchorDisabled === "1";
  if (runtimeDisabled || trim(process.env.SOLANA_ANCHOR_DISABLED) === "1") {
    return null;
  }

  const rpcUrl = runtimeConfig.rpcUrl || trim(process.env.SOLANA_RPC_URL);
  const keypair = parseSolanaKeypair(runtimeConfig.keypair) || loadKeypairFromEnv();
  if (!rpcUrl || !keypair) return null;

  const cluster =
    runtimeConfig.cluster ||
    trim(process.env.SOLANA_CLUSTER) ||
    guessClusterFromRpcUrl(rpcUrl);
  const c = (runtimeConfig.commitment || trim(process.env.SOLANA_COMMITMENT)).toLowerCase();
  const commitment =
    c === "processed" || c === "confirmed" || c === "finalized"
      ? c
      : "confirmed";

  return { rpcUrl, keypair, cluster, commitment };
}

export function getSolanaAdminStatus() {
  const runtimeConfig = getRuntimeSolanaConfig();
  const runtimeKeypair = parseSolanaKeypair(runtimeConfig.keypair);
  const envOptions = getSolanaMerkleAnchorOptions();
  const activeOptions =
    runtimeConfig.rpcUrl && runtimeKeypair
      ? {
          rpcUrl: runtimeConfig.rpcUrl,
          keypair: runtimeKeypair,
          cluster: runtimeConfig.cluster || guessClusterFromRpcUrl(runtimeConfig.rpcUrl),
          commitment: runtimeConfig.commitment || "confirmed",
        }
      : envOptions;

  return {
    configured: !!activeOptions,
    source: runtimeConfig.rpcUrl || runtimeConfig.keypair ? "runtime" : "env",
    anchorDisabled:
      runtimeConfig.anchorDisabled === true || trim(process.env.SOLANA_ANCHOR_DISABLED) === "1",
    rpcUrl:
      activeOptions?.rpcUrl || runtimeConfig.rpcUrl || trim(process.env.SOLANA_RPC_URL) || "",
    cluster:
      activeOptions?.cluster ||
      runtimeConfig.cluster ||
      trim(process.env.SOLANA_CLUSTER) ||
      "",
    commitment:
      activeOptions?.commitment ||
      runtimeConfig.commitment ||
      trim(process.env.SOLANA_COMMITMENT) ||
      "confirmed",
    publicKey: activeOptions?.keypair?.publicKey?.toBase58?.() || "",
    hasRuntimeKeypair: !!runtimeKeypair,
    hasEnvKeypair: !!loadKeypairFromEnv(),
    runtimeUpdatedAt: runtimeConfig.updatedAt || "",
  };
}

/**
 * @param {{ batchId: string, sha256Root?: string | null, phashRoot?: string | null, rpcUrl: string, keypair: Keypair, commitment?: string }} opts
 * @returns {Promise<{ signature: string, payload: string }>}
 */
export async function submitMerkleRootMemo(opts) {
  const {
    batchId,
    sha256Root,
    phashRoot,
    rpcUrl,
    keypair,
    commitment = "confirmed",
  } = opts;
  const payload = [
    "verity:merkle:v2",
    batchId,
    trim(sha256Root) || "-",
    trim(phashRoot) || "-",
  ].join("|");
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

  return { signature, payload };
}

export function solanaExplorerTxUrl(cluster, signature) {
  const sig = trim(signature);
  if (!sig) return "";
  const c = cluster || "mainnet-beta";
  if (c === "mainnet-beta" || c === "mainnet") {
    return `https://explorer.solana.com/tx/${sig}`;
  }
  if (c === "testnet") {
    return `https://explorer.solana.com/tx/${sig}?cluster=testnet`;
  }
  if (c === "devnet") {
    return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
  }
  return `https://explorer.solana.com/tx/${sig}`;
}
