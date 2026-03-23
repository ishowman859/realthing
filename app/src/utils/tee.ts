import * as Crypto from "expo-crypto";
import { TeeProof } from "./verityApi";

/**
 * Expo managed 환경에서는 하드웨어 TEE private key 서명이 제한적이므로,
 * 서버/앱 플로우를 먼저 연결할 수 있도록 TEE payload 형식만 생성합니다.
 * 이후 prebuild/bare에서 네이티브 키스토어 서명으로 교체해야 합니다.
 */
export async function createTeeProofForSha256(input: {
  owner: string;
  sha256: string;
  serial: string;
}): Promise<TeeProof> {
  const timestamp = Date.now();
  const nonce = await Crypto.getRandomBytesAsync(16).then((bytes) =>
    Array.from(bytes as Uint8Array).map((b) => b.toString(16).padStart(2, "0")).join("")
  );

  return {
    keyId: null,
    signature: null,
    payload: {
      serial: input.serial,
      owner: input.owner,
      sha256: input.sha256,
      nonce,
      timestamp,
    },
    provider: "unavailable",
    verified: false,
  };
}
