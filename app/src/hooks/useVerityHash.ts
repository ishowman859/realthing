import { useState, useCallback } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { computePhash, computeSha256 } from "../utils/phash";
import { buildRegisterTransaction } from "../utils/solana";
import {
  HashMode,
  VerificationAssetRecord,
  getSha256UsageCount,
  listAssets,
  registerAsset,
} from "../utils/verityApi";
import { createTeeProofForSha256 } from "../utils/tee";

export type RegistrationStatus =
  | "idle"
  | "computing_hash"
  | "building_tx"
  | "awaiting_signature"
  | "confirming"
  | "success"
  | "error";

interface VerityHashState {
  status: RegistrationStatus;
  currentPhash: string | null;
  currentSha256: string | null;
  txSignature: string | null;
  verificationUrl: string | null;
  qrCodeUrl: string | null;
  hashMode: HashMode | null;
  error: string | null;
  records: VerificationAssetRecord[];
  loadingRecords: boolean;
}

export function useVerityHash(
  walletPublicKey: PublicKey | null,
  signAndSend: (tx: Transaction) => Promise<string>
) {
  const [state, setState] = useState<VerityHashState>({
    status: "idle",
    currentPhash: null,
    currentSha256: null,
    txSignature: null,
    verificationUrl: null,
    qrCodeUrl: null,
    hashMode: null,
    error: null,
    records: [],
    loadingRecords: false,
  });

  const registerPhoto = useCallback(
    async (
      imageUri: string,
      mode: HashMode,
      aiRiskScore?: number,
      metadata?: Record<string, unknown>
    ) => {
      if (!walletPublicKey) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: "지갑이 연결되지 않았습니다",
        }));
        return;
      }

      try {
        setState((prev) => ({
          ...prev,
          status: "computing_hash",
          hashMode: mode,
          error: null,
          txSignature: null,
          verificationUrl: null,
          qrCodeUrl: null,
        }));

        const [phash, sha256] = await Promise.all([
          computePhash(imageUri),
          computeSha256(imageUri),
        ]);
        setState((prev) => ({
          ...prev,
          currentPhash: phash,
          currentSha256: sha256,
          status: mode === "sha256" ? "building_tx" : "confirming",
        }));

        let signature: string | null = null;
        let teeProof = undefined;
        const serial = createSerial(mode);
        if (mode === "sha256") {
          const usageCount = await getSha256UsageCount(walletPublicKey.toBase58());
          if (usageCount >= 1) {
            throw new Error("SHA-256 온체인 등록 무료 1회를 이미 사용했습니다");
          }

          teeProof = await createTeeProofForSha256({
            owner: walletPublicKey.toBase58(),
            sha256,
            serial,
          });

          const transaction = await buildRegisterTransaction(
            walletPublicKey,
            sha256,
            imageUri
          );

          setState((prev) => ({ ...prev, status: "awaiting_signature" }));
          signature = await signAndSend(transaction);
        }

        setState((prev) => ({
          ...prev,
          status: "confirming",
        }));

        const record = await registerAsset({
          owner: walletPublicKey.toBase58(),
          mode,
          mediaType: "photo",
          sourceUri: undefined,
          serial,
          sha256,
          phash,
          capturedTimestampMs:
            typeof metadata?.captureTimestamp === "number"
              ? metadata.captureTimestamp
              : Date.now(),
          gps:
            metadata?.gps &&
            typeof metadata.gps === "object" &&
            typeof (metadata.gps as any).lat === "number" &&
            typeof (metadata.gps as any).lng === "number"
              ? {
                  lat: (metadata.gps as any).lat,
                  lng: (metadata.gps as any).lng,
                }
              : null,
          aiRiskScore,
          metadata,
          chainTxSignature: signature,
          teeProof,
        });

        setState((prev) => ({
          ...prev,
          status: "success",
          txSignature: signature,
          verificationUrl: record.verificationUrl,
          qrCodeUrl: record.qrCodeUrl,
          records: [record, ...prev.records],
        }));

        return { phash, sha256, signature, verificationUrl: record.verificationUrl };
      } catch (error: any) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: error.message || "등록에 실패했습니다",
        }));
      }
    },
    [walletPublicKey, signAndSend]
  );

  const loadRecords = useCallback(async () => {
    if (!walletPublicKey) return;

    setState((prev) => ({ ...prev, loadingRecords: true }));

    try {
      const records = await listAssets(walletPublicKey.toBase58());
      setState((prev) => ({ ...prev, records, loadingRecords: false }));
    } catch (error) {
      console.error("Failed to load records:", error);
      setState((prev) => ({ ...prev, loadingRecords: false }));
    }
  }, [walletPublicKey]);

  const reset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      status: "idle",
      currentPhash: null,
      currentSha256: null,
      txSignature: null,
      verificationUrl: null,
      qrCodeUrl: null,
      hashMode: null,
      error: null,
    }));
  }, []);

  return {
    ...state,
    registerPhoto,
    loadRecords,
    reset,
  };
}

function createSerial(mode: HashMode): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const suffix = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `VRT-${mode.toUpperCase()}-${yyyy}${mm}${dd}-${suffix}`;
}
