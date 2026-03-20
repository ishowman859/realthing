export interface YuvFrameSample {
  // [각주1] YUV 중 밝기(Y) 평면만 사용하면 경량 계산이 가능합니다.
  yPlane: Uint8Array;
  width: number;
  height: number;
  timestampMs: number;
}

export interface TemporalMoiréMetrics {
  firstToFifthAbsDiff: number;
  highFrequencyNoise: number;
  intervalConsistencyMs: number;
}

export interface TemporalMoiréResult {
  suspicious: boolean;
  metrics: TemporalMoiréMetrics;
  reason: string;
}

export interface TemporalMoiréOptions {
  targetIntervalMs?: number; // default: 200ms
  maxAbsDiff?: number; // default: 6.5 (0~255 scale)
  minHighFrequencyNoise?: number; // default: 0.045 (0~1)
  sampleStride?: number; // default: 2
}

const DEFAULTS: Required<TemporalMoiréOptions> = {
  targetIntervalMs: 200,
  maxAbsDiff: 6.5,
  minHighFrequencyNoise: 0.045,
  sampleStride: 2,
};

// [각주2] 0.2초 간격 5프레임 기준으로 모니터/모아레 의심을 경량 판정합니다.
export function detectTemporalMoiré(
  frames: YuvFrameSample[],
  options?: TemporalMoiréOptions
): TemporalMoiréResult {
  const cfg = { ...DEFAULTS, ...(options || {}) };
  if (frames.length < 5) {
    return {
      suspicious: false,
      metrics: {
        firstToFifthAbsDiff: 999,
        highFrequencyNoise: 0,
        intervalConsistencyMs: 999,
      },
      reason: "insufficient_frames",
    };
  }

  const selected = frames.slice(0, 5);
  const first = selected[0];
  const fifth = selected[4];

  if (!sameGeometry(first, fifth)) {
    return {
      suspicious: false,
      metrics: {
        firstToFifthAbsDiff: 999,
        highFrequencyNoise: 0,
        intervalConsistencyMs: 999,
      },
      reason: "shape_mismatch",
    };
  }

  const firstToFifthAbsDiff = meanAbsoluteDifference(
    first.yPlane,
    fifth.yPlane,
    first.width,
    first.height,
    cfg.sampleStride
  );

  // [각주3] 고주파 노이즈는 (원본 - 주변 평균)의 절대값 평균으로 근사합니다.
  const highFrequencyNoise =
    (estimateHighFrequencyNoise(first.yPlane, first.width, first.height, cfg.sampleStride) +
      estimateHighFrequencyNoise(fifth.yPlane, fifth.width, fifth.height, cfg.sampleStride)) /
    2;

  const intervalConsistencyMs = meanIntervalError(selected, cfg.targetIntervalMs);
  const lowMotion = firstToFifthAbsDiff <= cfg.maxAbsDiff;
  const hasFineNoise = highFrequencyNoise >= cfg.minHighFrequencyNoise;

  return {
    suspicious: lowMotion && hasFineNoise,
    metrics: {
      firstToFifthAbsDiff,
      highFrequencyNoise,
      intervalConsistencyMs,
    },
    reason: lowMotion && hasFineNoise ? "low_motion_with_high_freq_noise" : "normal",
  };
}

function sameGeometry(a: YuvFrameSample, b: YuvFrameSample): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.yPlane.length === b.yPlane.length
  );
}

function meanAbsoluteDifference(
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  height: number,
  stride: number
): number {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const idx = y * width + x;
      sum += Math.abs(a[idx] - b[idx]);
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

function estimateHighFrequencyNoise(
  yPlane: Uint8Array,
  width: number,
  height: number,
  stride: number
): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += stride) {
    for (let x = 1; x < width - 1; x += stride) {
      const center = yPlane[y * width + x];
      const top = yPlane[(y - 1) * width + x];
      const bottom = yPlane[(y + 1) * width + x];
      const left = yPlane[y * width + (x - 1)];
      const right = yPlane[y * width + (x + 1)];
      const localMean = (top + bottom + left + right) / 4;
      sum += Math.abs(center - localMean);
      count += 1;
    }
  }

  const avgResidual = count > 0 ? sum / count : 0;
  return avgResidual / 255;
}

function meanIntervalError(frames: YuvFrameSample[], targetIntervalMs: number): number {
  if (frames.length < 2) return 999;
  let sum = 0;
  let count = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const delta = frames[i].timestampMs - frames[i - 1].timestampMs;
    sum += Math.abs(delta - targetIntervalMs);
    count += 1;
  }
  return count > 0 ? sum / count : 999;
}

