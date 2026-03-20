import crypto from "node:crypto";
import sharp from "sharp";

/** 파일 바이트 SHA-256 (소문자 hex 64) */
export function sha256Buffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * 8×8 평균 해시 → 64비트 = 16자리 hex (DB phash 컬럼 형식과 동일)
 * 이미지가 아니거나 디코드 실패 시 null
 */
export async function averageHash16FromImageBuffer(buf) {
  try {
    const { data } = await sharp(buf, { failOn: "none" })
      .resize(8, 8, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (!data || data.length < 64) return null;
    let sum = 0;
    for (let i = 0; i < 64; i++) sum += data[i];
    const mean = sum / 64;
    const bits = [];
    for (let i = 0; i < 64; i++) bits.push(data[i] >= mean ? 1 : 0);
    let hex = "";
    for (let i = 0; i < 64; i += 4) {
      let n = 0;
      for (let j = 0; j < 4; j++) n = (n << 1) | bits[i + j];
      hex += n.toString(16);
    }
    return hex;
  } catch {
    return null;
  }
}

export function isProbablyImageMime(mime) {
  return /^image\/(jpeg|png|webp|gif|bmp|heic|heif)$/i.test(mime || "");
}

export function isProbablyVideoMime(mime) {
  return /^video\//i.test(mime || "");
}
