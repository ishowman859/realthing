import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { Buffer } from "buffer";
import {
  createOrGetHardwareKey,
  getHardwarePublicKey,
  signWithHardware,
} from "../native/VerityHardwareSigner";
import { TeeProof, TeeProofPayload } from "./verityApi";

const KEY_ALIAS = "verity-device-attestation-v1";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function createNonceHex(length = 16): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(length);
  return bytesToHex(bytes as Uint8Array);
}

function resolveProvider(): TeeProof["provider"] {
  if (Platform.OS === "android") return "android-keystore";
  if (Platform.OS === "ios") return "secure-enclave";
  return "unavailable";
}

function buildUnavailableProof(payload: TeeProofPayload): TeeProof {
  return {
    keyId: null,
    signature: null,
    payload,
    provider: "unavailable",
    verified: false,
  };
}

export async function createTeeProofForSha256(input: {
  owner: string;
  sha256: string;
  serial: string;
}): Promise<TeeProof> {
  const payload: TeeProofPayload = {
    serial: input.serial,
    owner: input.owner,
    sha256: input.sha256,
    nonce: await createNonceHex(16),
    timestamp: Date.now(),
    publicKey: null,
  };

  try {
    await createOrGetHardwareKey(KEY_ALIAS);
    const publicKey = await getHardwarePublicKey(KEY_ALIAS);
    const signedPayload: TeeProofPayload = {
      ...payload,
      publicKey,
    };
    const payloadBase64 = Buffer.from(
      JSON.stringify(signedPayload),
      "utf8"
    ).toString("base64");
    const signature = await signWithHardware(KEY_ALIAS, payloadBase64);
    const keyId = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      publicKey
    );

    return {
      keyId,
      signature,
      payload: signedPayload,
      provider: resolveProvider(),
      verified: false,
    };
  } catch {
    return buildUnavailableProof(payload);
  }
}
