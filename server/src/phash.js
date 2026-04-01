export function hammingDistanceFromPhash(phashA, phashB) {
  if (!phashA || !phashB || phashA.length !== phashB.length) return 0;
  let distance = 0;
  for (let i = 0; i < phashA.length; i++) {
    const n1 = parseInt(phashA[i], 16);
    const n2 = parseInt(phashB[i], 16);
    if (Number.isNaN(n1) || Number.isNaN(n2)) return 0;
    let xor = n1 ^ n2;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

export function similarityFromPhash(phashA, phashB) {
  if (!phashA || !phashB || phashA.length !== phashB.length) return 0;
  const distance = hammingDistanceFromPhash(phashA, phashB);
  const totalBits = phashA.length * 4;
  const similarity = ((totalBits - distance) / totalBits) * 100;
  return Math.max(0, Math.min(100, Number(similarity.toFixed(2))));
}

export function getBestDuplicateScore(phash, candidates) {
  let best = 0;
  for (const row of candidates) {
    const sim = similarityFromPhash(phash, row.phash);
    if (sim > best) best = sim;
  }
  return best;
}
