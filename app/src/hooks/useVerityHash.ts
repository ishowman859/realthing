import { useState, useCallback } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { computePhash, computeSha256 } from "../utils/phash";
import { extractVideoPhashKeyframes } from "../utils/videoPhash";
import {
  HashMode,
  VerificationAssetRecord,
  listAssets,
  registerAsset,
  registerSha256Ingest,
} from "../utils/verityApi";
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
      metadata?: Record<string, unknown>,
      opts?: { mediaType?: "photo" | "video" }
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

        const serial = createSerial(mode);
        let phash: string | null = null;
        let sha256: string;

        if (mode === "sha256") {
          // [각주1] SHA-256 + pHash(선택). 사진은 동시 계산, 동영상은 구간 썸네일+장면전환 키프레임.
          // 서버는 수신 시각 기준 1분 버킷으로 모아 머클 배치(processMinuteBatches)합니다.
          const mediaType = opts?.mediaType ?? "photo";
          let phashVal: string | null = null;
          let mergedMeta: Record<string, unknown> = { ...(metadata ?? {}) };

          if (mediaType === "video") {
            const [sha256Computed, keyframes] = await Promise.all([
              computeSha256(imageUri),
              extractVideoPhashKeyframes(imageUri),
            ]);
            sha256 = sha256Computed;
            phashVal = keyframes[0]?.phash ?? null;
            mergedMeta = {
              ...mergedMeta,
              videoPhashKeyframes: keyframes,
              videoPhashStrategy: "interval_ms+scene_hamming",
            };
          } else {
            const [sha256Computed, phashComputed] = await Promise.all([
              computeSha256(imageUri),
              computePhash(imageUri),
            ]);
            sha256 = sha256Computed;
            phashVal = phashComputed;
          }

          setState((prev) => ({
            ...prev,
            currentPhash: phashVal,
            currentSha256: sha256,
            status: "confirming",
          }));

          const record = await registerSha256Ingest({
            owner: walletPublicKey.toBase58(),
            sha256,
            phash: phashVal ?? undefined,
            mediaType,
            serial,
            capturedTimestampMs:
              typeof mergedMeta.captureTimestamp === "number"
                ? (mergedMeta.captureTimestamp as number)
                : typeof metadata?.captureTimestamp === "number"
                  ? metadata.captureTimestamp
                  : Date.now(),
            aiRiskScore,
            metadata: mergedMeta,
          });

          setState((prev) => ({
            ...prev,
            status: "success",
            txSignature: null,
            verificationUrl: record.verificationUrl,
            qrCodeUrl: record.qrCodeUrl,
            records: [record, ...prev.records],
          }));

          return {
            phash: phashVal,
            sha256,
            signature: null,
            verificationUrl: record.verificationUrl,
          };
        }

        const [phashComputed, sha256Computed] = await Promise.all([
          computePhash(imageUri),
          computeSha256(imageUri),
        ]);
        phash = phashComputed;
        sha256 = sha256Computed;
        setState((prev) => ({
          ...prev,
          currentPhash: phash,
          currentSha256: sha256,
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
          chainTxSignature: null,
          teeProof: undefined,
        });

        setState((prev) => ({
          ...prev,
          status: "success",
          txSignature: null,
          verificationUrl: record.verificationUrl,
          qrCodeUrl: record.qrCodeUrl,
          records: [record, ...prev.records],
        }));

        return {
          phash,
          sha256,
          signature: null,
          verificationUrl: record.verificationUrl,
        };
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
