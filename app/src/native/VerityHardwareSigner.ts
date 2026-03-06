import { NativeModules, Platform } from "react-native";

type NativeSignerModule = {
  // [각주1] Android StrongBox / iOS Secure Enclave 키를 생성하거나 기존 키를 반환합니다.
  createOrGetStrongBoxKey?: (alias: string) => Promise<string>;
  createOrGetSecureEnclaveKey?: (alias: string) => Promise<string>;
  // [각주2] payload(Base64)를 디바이스 보안 칩 키로 서명합니다.
  sign: (alias: string, payloadBase64: string) => Promise<string>;
  // [각주3] 공개키 조회 및 키 삭제 유틸입니다.
  getPublicKey: (alias: string) => Promise<string>;
  deleteKey: (alias: string) => Promise<boolean>;
};

const LINK_ERROR =
  "VerityHardwareSigner 네이티브 모듈이 연결되지 않았습니다. " +
  "Expo 프로젝트라면 `npx expo prebuild` 후 Android/iOS 네이티브 빌드를 다시 진행하세요.";

const NativeSigner = NativeModules.VerityHardwareSigner as NativeSignerModule | undefined;

function requireNative(): NativeSignerModule {
  if (!NativeSigner) {
    throw new Error(LINK_ERROR);
  }
  return NativeSigner;
}

export async function createOrGetHardwareKey(alias: string): Promise<string> {
  const mod = requireNative();
  if (Platform.OS === "android") {
    if (!mod.createOrGetStrongBoxKey) {
      throw new Error("Android StrongBox 메서드가 없습니다.");
    }
    return mod.createOrGetStrongBoxKey(alias);
  }
  if (Platform.OS === "ios") {
    if (!mod.createOrGetSecureEnclaveKey) {
      throw new Error("iOS Secure Enclave 메서드가 없습니다.");
    }
    return mod.createOrGetSecureEnclaveKey(alias);
  }
  throw new Error("현재 플랫폼은 하드웨어 서명을 지원하지 않습니다.");
}

export async function signWithHardware(
  alias: string,
  payloadBase64: string
): Promise<string> {
  return requireNative().sign(alias, payloadBase64);
}

export async function getHardwarePublicKey(alias: string): Promise<string> {
  return requireNative().getPublicKey(alias);
}

export async function deleteHardwareKey(alias: string): Promise<boolean> {
  return requireNative().deleteKey(alias);
}
