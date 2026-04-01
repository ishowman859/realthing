import * as ImageManipulator from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import jpeg from "jpeg-js";

const HASH_SIZE = 8;

/**
 * 앱/웹/서버 공통 8x8 average hash(64-bit, 16 hex)입니다.
 * 표준화된 JPG를 8x8 grayscale로 축소한 뒤 평균값 이상 픽셀을 1로 둡니다.
 */
export async function computePhash(imageUri: string): Promise<string> {
  const resized = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: HASH_SIZE, height: HASH_SIZE } }],
    {
      format: ImageManipulator.SaveFormat.JPEG,
      compress: 0.9,
      base64: true,
    }
  );

  if (!resized.base64) {
    throw new Error("Failed to get base64 image data");
  }

  const bytes = Buffer.from(resized.base64, "base64");
  const decoded = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
  });
  return computeAverageHashFromRgba(decoded.data, decoded.width, decoded.height);
}

/**
 * 이미지 파일의 SHA-256 해시를 계산합니다.
 * 파일 바이트를 base64로 읽은 뒤, 그 base64 문자열에 대해 SHA-256을 계산합니다.
 */
export async function computeSha256(imageUri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return bytesToHex(new Uint8Array(digest));
}

function computeAverageHashFromRgba(
  rgba: Uint8Array,
  width: number,
  height: number
): string {
  if (width !== HASH_SIZE || height !== HASH_SIZE) {
    throw new Error(`Expected ${HASH_SIZE}x${HASH_SIZE} image for pHash`);
  }
  let total = 0;
  const grayscale: number[] = [];
  for (let i = 0; i < rgba.length; i += 4) {
    const gray = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
    grayscale.push(gray);
    total += gray;
  }
  const avg = total / grayscale.length;

  let hex = "";
  for (let i = 0; i < grayscale.length; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j += 1) {
      nibble = (nibble << 1) | (grayscale[i + j] >= avg ? 1 : 0);
    }
    hex += nibble.toString(16);
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
