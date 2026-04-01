import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import { Buffer } from "buffer";
import jpeg from "jpeg-js";
import ExifParser from "exif-parser";

const ANALYSIS_SIZE = 160;

export type FirstStageDecision = "pass" | "warn" | "reject";

export interface FirstStageFilterResult {
  decision: FirstStageDecision;
  score: number;
  reasons: string[];
  metrics: {
    blurVariance: number;
    periodicityScore: number;
    metadataRisk: number;
  };
}

/**
 * 공통 1차 필터:
 * - Blur(Var of Laplacian)로 품질 저하/재촬영 의심 신호 감지
 * - 주기성(autocorrelation)으로 화면 격자/모아레 유사 패턴 감지
 * - EXIF 이상치(편집 흔적 등) 감지
 */
export async function runFirstStageFilter(
  imageUri: string,
  options?: { skipPeriodicity?: boolean }
): Promise<FirstStageFilterResult> {
  const [pixelMetrics, metadataRiskResult] = await Promise.all([
    analyzePixels(imageUri, options),
    analyzeMetadataRisk(imageUri),
  ]);

  const reasons: string[] = [];
  let score = 0;

  // Blur risk
  if (pixelMetrics.blurVariance < 35) {
    score += 30;
      reasons.push("Low sharpness suggests blur, recapture, or motion.");
  } else if (pixelMetrics.blurVariance < 55) {
    score += 15;
      reasons.push("The image sharpness looks slightly low.");
  }

  // Periodicity risk (screen pixel grid / moire proxy)
  if (pixelMetrics.periodicityScore > 0.34) {
    score += 35;
      reasons.push("A screen-grid or moire-like pattern was detected.");
  } else if (pixelMetrics.periodicityScore > 0.24) {
    score += 18;
      reasons.push("A moderately strong repeating pattern was detected.");
  }

  if (metadataRiskResult.risk > 0) {
    score += metadataRiskResult.risk;
    reasons.push(...metadataRiskResult.reasons);
  }

  score = Math.max(0, Math.min(100, score));

  let decision: FirstStageDecision = "pass";
  if (score >= 65) {
    decision = "reject";
  } else if (score >= 35) {
    decision = "warn";
  }

  return {
    decision,
    score,
    reasons,
    metrics: {
      blurVariance: round2(pixelMetrics.blurVariance),
      periodicityScore: round3(pixelMetrics.periodicityScore),
      metadataRisk: metadataRiskResult.risk,
    },
  };
}

async function analyzePixels(
  imageUri: string,
  options?: { skipPeriodicity?: boolean }
): Promise<{
  blurVariance: number;
  periodicityScore: number;
}> {
  const resized = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: ANALYSIS_SIZE } }],
    {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );

  if (!resized.base64) {
    throw new Error("Failed to create a base64 image for analysis.");
  }

  const bytes = Buffer.from(resized.base64, "base64");
  const decoded = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
  });
  const gray = rgbaToGray(decoded.data, decoded.width, decoded.height);

  const blurVariance = varianceOfLaplacian(gray, decoded.width, decoded.height);
  const periodicityScore = options?.skipPeriodicity
    ? 0
    : estimatePeriodicity(gray, decoded.width, decoded.height);

  return { blurVariance, periodicityScore };
}

async function analyzeMetadataRisk(imageUri: string): Promise<{
  risk: number;
  reasons: string[];
}> {
  const reasons: string[] = [];
  let risk = 0;

  try {
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = Buffer.from(base64, "base64");
    const parsed = ExifParser.create(bytes).parse();
    const tags = parsed.tags ?? {};

    const softwareTag =
      tags.Software ?? tags.ProcessingSoftware ?? tags.HostComputer;
    const make = tags.Make;
    const model = tags.Model;

    if (softwareTag) {
      const softwareText = String(softwareTag).toLowerCase();
      if (
        softwareText.includes("photoshop") ||
        softwareText.includes("lightroom") ||
        softwareText.includes("snapseed") ||
        softwareText.includes("editor")
      ) {
        risk += 25;
          reasons.push("Metadata indicates editing software.");
      } else {
        risk += 10;
          reasons.push("Metadata includes post-processing software information.");
      }
    }

    // 카메라 정보가 전혀 없으면 약한 리스크만 부여(과탐 방지)
    if (!make && !model) {
      risk += 8;
        reasons.push("Camera device metadata is missing, which limits authenticity checks.");
    }
  } catch {
    // EXIF가 없거나 파싱 실패하면 약한 리스크만 부여
    risk += 6;
      reasons.push("Metadata could not be read, which lowers verification confidence.");
  }

  return { risk, reasons };
}

function rgbaToGray(
  rgba: Uint8Array,
  width: number,
  height: number
): Float32Array {
  const gray = new Float32Array(width * height);
  let p = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    gray[p++] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

// OpenCV 계열에서 널리 쓰는 블러 지표(Var of Laplacian) 간소 구현
function varianceOfLaplacian(
  gray: Float32Array,
  width: number,
  height: number
): number {
  const vals: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const c = gray[y * width + x];
      const up = gray[(y - 1) * width + x];
      const down = gray[(y + 1) * width + x];
      const left = gray[y * width + (x - 1)];
      const right = gray[y * width + (x + 1)];
      const lap = up + down + left + right - 4 * c;
      vals.push(lap);
    }
  }

  let sum = 0;
  for (const v of vals) sum += v;
  const mean = sum / vals.length;
  let variance = 0;
  for (const v of vals) {
    const d = v - mean;
    variance += d * d;
  }
  return variance / vals.length;
}

/**
 * 주기성 추정:
 * 인접 차분 시퀀스의 autocorrelation peak를 측정해
 * 화면 격자/재촬영 시 흔히 나타나는 규칙적 패턴 강도를 근사합니다.
 */
function estimatePeriodicity(
  gray: Float32Array,
  width: number,
  height: number
): number {
  const rowScores: number[] = [];
  const colScores: number[] = [];

  const rowStep = Math.max(1, Math.floor(height / 24));
  const colStep = Math.max(1, Math.floor(width / 24));

  for (let y = 0; y < height; y += rowStep) {
    const diffs: number[] = [];
    for (let x = 1; x < width; x++) {
      const d = Math.abs(gray[y * width + x] - gray[y * width + (x - 1)]);
      diffs.push(d);
    }
    rowScores.push(normalizedAutoPeak(diffs));
  }

  for (let x = 0; x < width; x += colStep) {
    const diffs: number[] = [];
    for (let y = 1; y < height; y++) {
      const d = Math.abs(gray[y * width + x] - gray[(y - 1) * width + x]);
      diffs.push(d);
    }
    colScores.push(normalizedAutoPeak(diffs));
  }

  const rowAvg = average(rowScores);
  const colAvg = average(colScores);
  return (rowAvg + colAvg) / 2;
}

function normalizedAutoPeak(values: number[]): number {
  if (values.length < 24) return 0;

  let mean = 0;
  for (const v of values) mean += v;
  mean /= values.length;

  const centered = values.map((v) => v - mean);

  let energy = 0;
  for (const v of centered) energy += v * v;
  if (energy <= 1e-6) return 0;

  let peak = 0;
  const maxLag = Math.min(18, Math.floor(values.length / 3));
  for (let lag = 2; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < centered.length - lag; i++) {
      corr += centered[i] * centered[i + lag];
    }
    const normalized = Math.abs(corr) / energy;
    if (normalized > peak) peak = normalized;
  }

  return peak;
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const n of arr) sum += n;
  return sum / arr.length;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
