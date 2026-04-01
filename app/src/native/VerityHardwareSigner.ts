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
  "The VerityHardwareSigner native module is not linked. " +
  "If this is an Expo project, run `npx expo prebuild` and rebuild the Android/iOS native app.";

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
      throw new Error("Android StrongBox support is unavailable.");
    }
    return mod.createOrGetStrongBoxKey(alias);
  }
  if (Platform.OS === "ios") {
    if (!mod.createOrGetSecureEnclaveKey) {
      throw new Error("iOS Secure Enclave support is unavailable.");
    }
    return mod.createOrGetSecureEnclaveKey(alias);
  }
  throw new Error("Hardware-backed signing is not supported on this platform.");
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
