import Constants from "expo-constants";

const DEFAULT_VERITY_OWNER_ADDRESS = "demo-owner";

/**
 * 서버 API의 `owner` 필드. 지갑 연동은 메인 서버에서 처리한다고 가정하고,
 * 앱 빌드 시 extra 또는 EXPO_PUBLIC_VERITY_OWNER_ADDRESS 로 고정값을 넣습니다.
 */
function readExtraOwnerAddress(): string {
  const fromExpo = Constants.expoConfig?.extra?.verityOwnerAddress;
  if (typeof fromExpo === "string" && fromExpo.trim()) return fromExpo.trim();
  const manifest = Constants.manifest as {
    extra?: { verityOwnerAddress?: string };
  } | null;
  const fromManifest = manifest?.extra?.verityOwnerAddress;
  if (typeof fromManifest === "string" && fromManifest.trim())
    return fromManifest.trim();
  const env =
    typeof process !== "undefined" && process.env?.EXPO_PUBLIC_VERITY_OWNER_ADDRESS
      ? String(process.env.EXPO_PUBLIC_VERITY_OWNER_ADDRESS).trim()
      : "";
  return env;
}

export function resolveVerityOwnerAddress(): string {
  return readExtraOwnerAddress() || DEFAULT_VERITY_OWNER_ADDRESS;
}
