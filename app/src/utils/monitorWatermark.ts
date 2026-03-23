import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import jpeg from "jpeg-js";

const GLYPHS: Record<string, string[]> = {
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
};

// [각주1] 모니터 촬영 모드에서 해시 전용 워터마크 이미지를 생성합니다.
export async function stampMonitorWatermark(imageUri: string): Promise<string> {
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

  const margin = Math.max(8, Math.round(Math.min(width, height) * 0.025));
  const scale = Math.max(2, Math.round(Math.min(width, height) * 0.006));
  const text = "MONITOR";
  const letterWidth = 5 * scale;
  const letterHeight = 7 * scale;
  const gap = scale;
  const textWidth = text.length * letterWidth + (text.length - 1) * gap;
  const padX = 5 * scale;
  const padY = 4 * scale;

  const boxW = textWidth + padX * 2;
  const boxH = letterHeight + padY * 2;
  const startX = Math.max(0, width - boxW - margin);
  const startY = Math.max(0, height - boxH - margin);

  // [각주2] 반투명 검은 배경 박스를 먼저 깔아 글자 대비를 확보합니다.
  fillRectAlpha(rgba, width, height, startX, startY, boxW, boxH, 0, 0, 0, 150);

  let cursorX = startX + padX;
  const cursorY = startY + padY;
  for (const ch of text) {
    drawGlyph(rgba, width, height, cursorX, cursorY, ch, scale, 255, 255, 255, 230);
    cursorX += letterWidth + gap;
  }

  const encoded = (jpeg as any).encode(
    { data: rgba, width, height },
    90
  );
  const outBase64 = Buffer.from(encoded.data).toString("base64");
  const outPath = `${FileSystem.cacheDirectory}monitor-watermarked-${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(outPath, outBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return outPath;
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
  const glyph = GLYPHS[char];
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

