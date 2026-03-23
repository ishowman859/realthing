import { sha256HexUtf8 } from "./merkleVerifyClient";

export type MerklePathLevel = {
  hash: string;
  sibling: string | null;
  position: string | null;
  childHash: string | null;
};

export function shortHashHex(hex: string, pre = 7, post = 5): string {
  const h = String(hex || "");
  if (h.length <= pre + post + 1) return h;
  return `${h.slice(0, pre)}…${h.slice(-post)}`;
}

export async function buildMerklePathLevels(
  leafHash: string,
  proof: { hash: string; position: string }[]
): Promise<{
  levels: MerklePathLevel[];
  computedRoot: string;
  badProof?: boolean;
}> {
  const levels: MerklePathLevel[] = [
    { hash: leafHash, sibling: null, position: null, childHash: null },
  ];
  if (!leafHash || !Array.isArray(proof) || proof.length === 0) {
    return { levels, computedRoot: leafHash || "" };
  }
  let acc = leafHash;
  for (const node of proof) {
    const sib = String(node?.hash || "");
    const pos = String(node?.position || "");
    if (!sib || (pos !== "left" && pos !== "right")) {
      return { levels, computedRoot: acc, badProof: true };
    }
    const child = acc;
    const pair = pos === "left" ? `${sib}${child}` : `${child}${sib}`;
    acc = await sha256HexUtf8(pair);
    levels.push({ hash: acc, sibling: sib, position: pos, childHash: child });
  }
  return { levels, computedRoot: acc };
}
