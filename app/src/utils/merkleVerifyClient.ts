import * as Crypto from "expo-crypto";

/** 서버 `src/merkle.js` · 웹 `script.js` 와 동일한 UTF-8 문자열 SHA-256(hex) */
export async function sha256HexUtf8(s: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);
}

export type MerkleProofNode = { hash: string; position: string };

export async function createClientLeafHash(v: {
  mode?: string;
  sha256?: string;
  phash?: string;
  serial?: string;
  assetId?: string;
}): Promise<string> {
  const mode = String(v.mode || "");
  const hashValue = String(v.sha256 || v.phash || "");
  const serial = String(v.serial || "");
  const id = String(v.assetId ?? "");
  const payload = `${mode}|${hashValue}|${serial}|${id}`;
  return sha256HexUtf8(payload);
}

export async function verifyMerkleProofClient(
  leafHash: string,
  proof: MerkleProofNode[],
  expectedRoot: string
): Promise<boolean> {
  if (!leafHash || !Array.isArray(proof) || !expectedRoot) return false;
  let current = leafHash;
  for (const node of proof) {
    const sibling = String(node?.hash || "");
    const position = String(node?.position || "");
    if (!sibling || (position !== "left" && position !== "right")) return false;
    const pair =
      position === "left" ? `${sibling}${current}` : `${current}${sibling}`;
    current = await sha256HexUtf8(pair);
  }
  return current === expectedRoot;
}
