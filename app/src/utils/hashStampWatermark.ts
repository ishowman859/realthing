import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import jpeg from "jpeg-js";

/** 5×7 비트맵 글리프 (모니터 워터마크와 동일 패턴) */
const GLYPHS: Record<string, string[]> = {
  "0": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["10001", "10001", "10001", "11111", "00001", "00001", "00001"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  a: ["00000", "00110", "01001", "01111", "01001", "01001", "01001"],
  b: ["10000", "10000", "11110", "10001", "10001", "10001", "11110"],
  c: ["00000", "01110", "10001", "10000", "10000", "10001", "01110"],
  d: ["00001", "00001", "01111", "10001", "10001", "10001", "01111"],
  e: ["00000", "01110", "10001", "11111", "10000", "10001", "01110"],
  f: ["00000", "01111", "10000", "11110", "10000", "10000", "10000"],
  S: ["01111", "10000", "01110", "00001", "00001", "10001", "01110"],
  H: ["10001", "10001", "11111", "10001", "10001", "10001", "10001"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
};

function fillRectAlpha(
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number
) {
  const alpha = Math.max(0, Math.min(255, a)) / 255;
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(width, x + w);
  const y1 = Math.min(height, y + h);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const idx = (py * width + px) * 4;
      rgba[idx] = Math.round(r * alpha + rgba[idx] * (1 - alpha));
      rgba[idx + 1] = Math.round(g * alpha + rgba[idx + 1] * (1 - alpha));
      rgba[idx + 2] = Math.round(b * alpha + rgba[idx + 2] * (1 - alpha));
      rgba[idx + 3] = 255;
    }
  }
}

function drawGlyph(
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  char: string,
  scale: number,
  r: number,
  g: number,
  b: number,
  a: number
) {
  const key = GLYPHS[char] ? char : char.toLowerCase();
  const glyph = GLYPHS[key];
  if (!glyph) return;
  for (let gy = 0; gy < glyph.length; gy++) {
    for (let gx = 0; gx < glyph[gy].length; gx++) {
      if (glyph[gy][gx] === "1") {
        fillRectAlpha(
          rgba,
          width,
          height,
          x + gx * scale,
          y + gy * scale,
          scale,
          scale,
          r,
          g,
          b,
          a
        );
      }
    }
  }
}

function drawString(
  rgba: Uint8Array,
  w: number,
  h: number,
  startX: number,
  startY: number,
  text: string,
  scale: number,
  r: number,
  g: number,
  b: number,
  a: number
) {
  const letterW = 5 * scale;
  const gap = scale;
  let cx = startX;
  for (const ch of text) {
    if (ch === " ") {
      cx += letterW / 2 + gap;
      continue;
    }
    drawGlyph(rgba, w, h, cx, startY, ch, scale, r, g, b, a);
    cx += letterW + gap;
  }
}

/**
 * 촬영본 JPEG 하단에 SHA-256 / pHash(16hex) 텍스트를 박아 새 파일 URI를 반환합니다.
 */
export async function stampHashProofWatermark(
  imageUri: string,
  opts: {
    sha256: string | null | undefined;
    phash: string | null | undefined;
  }
): Promise<string> {
  const sha = String(opts.sha256 || "")
    .toLowerCase()
    .replace(/[^a-f0-9]/g, "");
  const ph = String(opts.phash || "")
    .toLowerCase()
    .replace(/[^a-f0-9]/g, "");

  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = Buffer.from(base64, "base64");
  const decoded = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
  });
  if (!decoded?.data || !decoded.width || !decoded.height) {
    throw new Error("이미지 디코딩 실패");
  }

  const width = decoded.width;
  const height = decoded.height;
  const rgba = decoded.data;

  const scale = Math.max(2, Math.round(Math.min(width, height) * 0.0055));
  const lineH = 7 * scale + Math.max(2, scale * 2);
  const margin = Math.max(8, Math.round(Math.min(width, height) * 0.02));
  const pad = 4 * scale;

  const lines: string[] = [];
  if (sha.length >= 64) {
    lines.push("SHA256");
    lines.push(sha.slice(0, 32));
    lines.push(sha.slice(32, 64));
  } else if (sha.length > 0) {
    lines.push("SHA256");
    lines.push(sha);
  }
  if (ph.length > 0) {
    lines.push("PHASH");
    lines.push(ph.length > 16 ? ph.slice(0, 16) : ph);
  }

  if (lines.length === 0) {
    throw new Error("표시할 해시가 없습니다");
  }

  const boxH = pad * 2 + lines.length * lineH;
  const boxW = width - margin * 2;
  const startX = margin;
  const startY = Math.max(0, height - margin - boxH);

  fillRectAlpha(rgba, width, height, startX, startY, boxW, boxH, 0, 0, 0, 200);

  let ty = startY + pad;
  for (const line of lines) {
    drawString(rgba, width, height, startX + pad, ty, line, scale, 255, 255, 255, 240);
    ty += lineH;
  }

  const encoded = jpeg.encode({ data: rgba, width, height }, 88);
  const outBase64 = Buffer.from(encoded.data).toString("base64");
  const outPath = `${FileSystem.cacheDirectory}verity-hash-proof-${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(outPath, outBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return outPath;
}
