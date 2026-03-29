import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "react-native";

export const STANDARD_PHOTO_MAX_LONG_EDGE = 1920;
export const STANDARD_PHOTO_MAX_SHORT_EDGE = 1080;
export const STANDARD_PHOTO_JPEG_QUALITY = 0.9;

export interface StandardizedPhotoMeta {
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  maxLongEdge: number;
  maxShortEdge: number;
  jpegQuality: number;
  format: "jpeg";
}

export interface StandardizedPhotoResult {
  uri: string;
  mimeType: "image/jpeg";
  meta: StandardizedPhotoMeta;
}

export async function standardizePhotoForHashing(input: {
  uri: string;
  width?: number | null;
  height?: number | null;
}): Promise<StandardizedPhotoResult> {
  const originalSize = await resolveImageSize(input.uri, input.width, input.height);
  const targetSize = computeTargetSize(originalSize.width, originalSize.height);
  const actions =
    targetSize.width === originalSize.width && targetSize.height === originalSize.height
      ? []
      : [{ resize: { width: targetSize.width, height: targetSize.height } }];

  const result = await ImageManipulator.manipulateAsync(input.uri, actions, {
    compress: STANDARD_PHOTO_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: false,
  });

  return {
    uri: result.uri,
    mimeType: "image/jpeg",
    meta: {
      sourceWidth: originalSize.width,
      sourceHeight: originalSize.height,
      outputWidth: result.width,
      outputHeight: result.height,
      maxLongEdge: STANDARD_PHOTO_MAX_LONG_EDGE,
      maxShortEdge: STANDARD_PHOTO_MAX_SHORT_EDGE,
      jpegQuality: STANDARD_PHOTO_JPEG_QUALITY,
      format: "jpeg",
    },
  };
}

async function resolveImageSize(
  uri: string,
  width?: number | null,
  height?: number | null
): Promise<{ width: number; height: number }> {
  if (isPositiveInt(width) && isPositiveInt(height)) {
    return { width, height };
  }

  return await new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (resolvedWidth, resolvedHeight) =>
        resolve({ width: resolvedWidth, height: resolvedHeight }),
      reject
    );
  });
}

function computeTargetSize(width: number, height: number) {
  const isLandscape = width >= height;
  const maxWidth = isLandscape
    ? STANDARD_PHOTO_MAX_LONG_EDGE
    : STANDARD_PHOTO_MAX_SHORT_EDGE;
  const maxHeight = isLandscape
    ? STANDARD_PHOTO_MAX_SHORT_EDGE
    : STANDARD_PHOTO_MAX_LONG_EDGE;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function isPositiveInt(value?: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
