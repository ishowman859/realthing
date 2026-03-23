import crypto from "node:crypto";

// [각주1] 자산별 머클 리프는 트리 종류/값/식별자를 고정 포맷으로 직렬화해 생성합니다.
export function createAssetLeafHash(asset, treeType = null) {
  const normalizedTreeType = normalizeTreeType(treeType || asset?.mode);
  const hashValue =
    normalizedTreeType === "sha256"
      ? String(asset?.sha256 || "")
      : String(asset?.phash || "");
  const serial = String(asset.serial || "");
  const id = String(asset.id || "");
  const payload = `${normalizedTreeType}|${hashValue}|${serial}|${id}`;
  return sha256Hex(payload);
}

export function buildMerkleTree(leafHashes) {
  if (!Array.isArray(leafHashes) || leafHashes.length === 0) {
    return { root: null, proofs: [] };
  }

  const levels = [leafHashes.slice()];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = prev[i + 1] ?? prev[i];
      next.push(hashPair(left, right));
    }
    levels.push(next);
  }

  const proofs = leafHashes.map((_, index) => buildProofForIndex(levels, index));
  return {
    root: levels[levels.length - 1][0],
    proofs,
  };
}

export function verifyMerkleProof(leafHash, proof, expectedRoot) {
  if (!leafHash || !Array.isArray(proof) || !expectedRoot) return false;
  let current = leafHash;
  for (const node of proof) {
    const sibling = String(node?.hash || "");
    const position = String(node?.position || "");
    if (!sibling || (position !== "left" && position !== "right")) return false;
    current = position === "left" ? hashPair(sibling, current) : hashPair(current, sibling);
  }
  return current === expectedRoot;
}

function buildProofForIndex(levels, leafIndex) {
  const proof = [];
  let idx = leafIndex;
  for (let level = 0; level < levels.length - 1; level += 1) {
    const nodes = levels[level];
    const isRightNode = idx % 2 === 1;
    const siblingIndex = isRightNode ? idx - 1 : idx + 1;
    const siblingHash = nodes[siblingIndex] ?? nodes[idx];
    proof.push({
      position: isRightNode ? "left" : "right",
      hash: siblingHash,
    });
    idx = Math.floor(idx / 2);
  }
  return proof;
}

function hashPair(left, right) {
  return sha256Hex(`${left}${right}`);
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeTreeType(value) {
  return String(value || "").toLowerCase() === "phash" ? "phash" : "sha256";
}

