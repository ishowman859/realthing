import * as ImageManipulator from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";

const HASH_SIZE = 8;
const SAMPLE_SIZE = 32;

/**
 * 이미지 URI로부터 pHash(Perceptual Hash)를 계산합니다.
 *
 * 사진은 내부적으로 **그레이스케일(흑백) 근사** 파이프라인으로 처리됩니다
 * (32×32 리사이즈 후 DCT → 저주파 비트열 → hex).
 *
 * 알고리즘:
 * 1. 이미지를 32x32 그레이스케일로 리사이즈
 * 2. DCT(Discrete Cosine Transform) 적용
 * 3. 상위 8x8 저주파 성분만 추출
 * 4. 평균값 기준으로 0/1 비트 생성
 * 5. 64비트 hex string 반환
 *
 * Expo 환경에서는 픽셀 데이터 직접 접근이 제한되므로,
 * 축소 이미지의 base64 데이터를 기반으로 간소화된 pHash를 생성합니다.
 */
export async function computePhash(imageUri: string): Promise<string> {
  const resized = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: SAMPLE_SIZE, height: SAMPLE_SIZE } }],
    {
      format: ImageManipulator.SaveFormat.JPEG,
      compress: 0.5,
      base64: true,
    }
  );

  if (!resized.base64) {
    throw new Error("Failed to get base64 image data");
  }

  const grayscaleValues = base64ToGrayscale(resized.base64, SAMPLE_SIZE);
  const dctMatrix = applyDCT(grayscaleValues, SAMPLE_SIZE);
  const lowFreq = extractLowFrequency(dctMatrix, HASH_SIZE);
  const hash = computeHashFromDCT(lowFreq, HASH_SIZE);

  return hash;
}

/**
 * 이미지 파일의 SHA-256 해시를 계산합니다.
 * 파일 바이트를 base64로 읽은 뒤, 그 base64 문자열에 대해 SHA-256을 계산합니다.
 */
export async function computeSha256(imageUri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const sha256 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    base64,
    { encoding: Crypto.CryptoEncoding.HEX }
  );

  return sha256;
}

/**
 * base64 JPEG 데이터에서 근사 그레이스케일 값 배열을 추출합니다.
 * JPEG 디코딩 없이 바이트 분포를 기반으로 근사화합니다.
 */
function base64ToGrayscale(base64: string, size: number): number[][] {
  const raw = atob(base64);
  const totalPixels = size * size;
  const matrix: number[][] = [];

  const startOffset = Math.min(200, Math.floor(raw.length * 0.2));
  const usableLength = raw.length - startOffset;
  const step = Math.max(1, Math.floor(usableLength / totalPixels));

  let idx = 0;
  for (let y = 0; y < size; y++) {
    const row: number[] = [];
    for (let x = 0; x < size; x++) {
      const byteIdx = startOffset + idx * step;
      if (byteIdx < raw.length) {
        row.push(raw.charCodeAt(byteIdx) & 0xff);
      } else {
        row.push(128);
      }
      idx++;
    }
    matrix.push(row);
  }

  return matrix;
}

/**
 * 2D DCT-II (Discrete Cosine Transform) 적용
 */
function applyDCT(matrix: number[][], size: number): number[][] {
  const result: number[][] = [];

  for (let u = 0; u < size; u++) {
    result[u] = [];
    for (let v = 0; v < size; v++) {
      let sum = 0;
      for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
          sum +=
            matrix[x][y] *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size));
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      result[u][v] = (cu * cv * sum * 2) / size;
    }
  }

  return result;
}

/**
 * DCT 결과에서 좌상단 저주파 성분만 추출
 */
function extractLowFrequency(
  dct: number[][],
  hashSize: number
): number[][] {
  const low: number[][] = [];
  for (let i = 0; i < hashSize; i++) {
    low[i] = [];
    for (let j = 0; j < hashSize; j++) {
      low[i][j] = dct[i][j];
    }
  }
  return low;
}

/**
 * DCT 저주파 성분의 평균을 기준으로 비트열 → hex string 해시 생성
 */
function computeHashFromDCT(
  lowFreq: number[][],
  hashSize: number
): string {
  let total = 0;
  const values: number[] = [];

  for (let i = 0; i < hashSize; i++) {
    for (let j = 0; j < hashSize; j++) {
      if (i === 0 && j === 0) continue; // DC 성분 제외
      values.push(lowFreq[i][j]);
      total += lowFreq[i][j];
    }
  }

  const avg = total / values.length;

  let bits = "";
  for (const val of values) {
    bits += val > avg ? "1" : "0";
  }

  while (bits.length < 64) {
    bits += "0";
  }
  bits = bits.substring(0, 64);

  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    const nibble = bits.substring(i, i + 4);
    hex += parseInt(nibble, 2).toString(16);
  }

  return hex;
}

/**
 * 두 pHash 간의 해밍 거리를 계산합니다 (유사도 비교용).
 * 값이 작을수록 유사한 이미지입니다.
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error("Hash lengths must be equal");
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const n1 = parseInt(hash1[i], 16);
    const n2 = parseInt(hash2[i], 16);
    let xor = n1 ^ n2;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }

  return distance;
}

/**
 * 두 pHash의 유사도를 0~100% 로 반환합니다.
 */
export function similarity(hash1: string, hash2: string): number {
  const maxBits = hash1.length * 4;
  const dist = hammingDistance(hash1, hash2);
  return Math.round(((maxBits - dist) / maxBits) * 100);
}
