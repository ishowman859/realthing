import { Platform } from "react-native";
import * as VideoThumbnails from "expo-video-thumbnails";
import { computePhash, hammingDistance } from "./phash";

export interface VideoPhashKeyframe {
  /** 동영상 내 시각(ms) */
  timeMs: number;
  phash: string;
}

export interface ExtractVideoPhashOptions {
  /** 기본 샘플 간격(ms). 이 간격마다 썸네일을 뽑습니다. */
  intervalMs?: number;
  /** 최대 키프레임 개수(장면 전환 포함) */
  maxKeyframes?: number;
  /** 이전 키프레임 대비 해밍 거리가 이 값 이상이면 장면 전환으로 간주 */
  sceneHammingThreshold?: number;
  /** 썸네일 탐색 상한(ms). 초과 시 중단 */
  maxProbeMs?: number;
}

/**
 * 동영상 URI에서 일정 간격으로 썸네일을 뽑고, 각 썸네일에 대해 pHash를 계산합니다.
 * - 연속 샘플 간 해밍 거리가 `sceneHammingThreshold` 이상이면 "장면 전환"으로 보고 키프레임에 추가합니다.
 * - 첫 프레임(t=0)은 항상 포함합니다.
 *
 * 네이티브에서만 동작합니다(Web은 미지원).
 */
export async function extractVideoPhashKeyframes(
  videoUri: string,
  options?: ExtractVideoPhashOptions
): Promise<VideoPhashKeyframe[]> {
  if (Platform.OS === "web") {
    console.warn("[videoPhash] Web에서는 expo-video-thumbnails를 사용할 수 없습니다.");
    return [];
  }

  const intervalMs = options?.intervalMs ?? 2000;
  const maxKeyframes = options?.maxKeyframes ?? 40;
  const sceneHammingThreshold = options?.sceneHammingThreshold ?? 12;
  const maxProbeMs = options?.maxProbeMs ?? 15 * 60 * 1000;

  const keyframes: VideoPhashKeyframe[] = [];
  let lastKeptPhash: string | null = null;
  let lastSamplePhash: string | null = null;

  for (let t = 0; t <= maxProbeMs && keyframes.length < maxKeyframes; t += intervalMs) {
    let thumbUri: string;
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: t,
        quality: 0.45,
      });
      thumbUri = uri;
    } catch {
      break;
    }

    const phash = await computePhash(thumbUri);

    if (keyframes.length === 0) {
      keyframes.push({ timeMs: t, phash });
      lastKeptPhash = phash;
      lastSamplePhash = phash;
      continue;
    }

    lastSamplePhash = phash;

    if (lastKeptPhash === null) {
      keyframes.push({ timeMs: t, phash });
      lastKeptPhash = phash;
      continue;
    }

    const dist = hammingDistance(lastKeptPhash, phash);
    if (dist >= sceneHammingThreshold) {
      keyframes.push({ timeMs: t, phash });
      lastKeptPhash = phash;
    }
  }

  if (keyframes.length === 0 && lastSamplePhash) {
    keyframes.push({ timeMs: 0, phash: lastSamplePhash });
  }

  return keyframes;
}
