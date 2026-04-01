import { useState, useCallback, useEffect } from "react";
import { computePhash, computeSha256 } from "../utils/phash";
import { extractVideoPhashKeyframes } from "../utils/videoPhash";
import {
  HashMode,
  VerificationAssetRecord,
  VerificationLookupPayload,
  listAssets,
  registerAsset,
  registerSha256Ingest,
  recheckVerificationByToken,
} from "../utils/verityApi";
import {
  clearPendingAnchor,
  readPendingAnchor,
  writePendingAnchor,
} from "../utils/pendingAnchorStore";
import { sendAnchorCompletedNotification } from "../utils/anchorNotifications";
import { createTeeProofForSha256 } from "../utils/tee";
export type RegistrationStatus =
  | "idle"
  | "computing_hash"
  | "building_tx"
  | "awaiting_signature"
  | "confirming"
  | "success"
  | "error";

export type AnchorMonitorStatus = "idle" | "pending" | "anchored" | "error";

export interface AnchorMonitorState {
  status: AnchorMonitorStatus;
  token: string | null;
  verificationUrl: string | null;
  serial: string | null;
  message: string | null;
  lastCheckedAtMs: number | null;
  anchoredAtMs: number | null;
}

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
  anchorMonitor: AnchorMonitorState;
}

export function useVerityHash(ownerAddress: string) {
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
    anchorMonitor: {
      status: "idle",
      token: null,
      verificationUrl: null,
      serial: null,
      message: null,
      lastCheckedAtMs: null,
      anchoredAtMs: null,
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = await readPendingAnchor();
      if (!pending || cancelled) return;
      setState((prev) => ({
        ...prev,
        verificationUrl: prev.verificationUrl || pending.verificationUrl,
        anchorMonitor: {
          status: "pending",
          token: pending.token,
          verificationUrl: pending.verificationUrl,
          serial: pending.serial || null,
          message: "Batch anchor pending. The app will keep checking after you reopen it.",
          lastCheckedAtMs: pending.lastCheckedAtMs ?? null,
          anchoredAtMs: null,
        },
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.anchorMonitor.status !== "pending" || !state.anchorMonitor.token) return;

    let cancelled = false;
    let notifying = false;

    const poll = async () => {
      try {
        const payload = await recheckVerificationByToken(state.anchorMonitor.token!);
        if (cancelled) return;
        const anchored = isVerificationAnchored(payload);
        const checkedAtMs = Date.now();

        if (anchored) {
          await clearPendingAnchor();
          if (!notifying) {
            notifying = true;
            await sendAnchorCompletedNotification({
              serial: payload.serial || state.anchorMonitor.serial,
              verificationUrl: state.anchorMonitor.verificationUrl,
            }).catch(() => undefined);
          }
          setState((prev) => ({
            ...prev,
            anchorMonitor: {
              status: "anchored",
              token: prev.anchorMonitor.token,
              verificationUrl: prev.anchorMonitor.verificationUrl,
              serial: payload.serial || prev.anchorMonitor.serial,
              message: "Batch anchor completed. You can review the Merkle and on-chain details on the verification screen.",
              lastCheckedAtMs: checkedAtMs,
              anchoredAtMs: payload.onchainTimestampMs ?? checkedAtMs,
            },
          }));
          return;
        }

        await writePendingAnchor({
          token: state.anchorMonitor.token!,
          verificationUrl: state.anchorMonitor.verificationUrl || "",
          serial: payload.serial || state.anchorMonitor.serial,
          owner: payload.owner || null,
          mode: payload.mode || null,
          sha256: payload.sha256 || null,
          phash: payload.phash || null,
          createdAtMs: checkedAtMs,
          lastCheckedAtMs: checkedAtMs,
        });

        setState((prev) => ({
          ...prev,
          anchorMonitor: {
            ...prev.anchorMonitor,
            status: "pending",
            serial: payload.serial || prev.anchorMonitor.serial,
            message: "Batch anchor pending. Rechecking the server for updated status.",
            lastCheckedAtMs: checkedAtMs,
          },
        }));
      } catch (error: any) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          anchorMonitor: {
            ...prev.anchorMonitor,
            status: "pending",
            message: `Batch status recheck failed: ${error?.message || "Please try again in a moment."}`,
            lastCheckedAtMs: Date.now(),
          },
        }));
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state.anchorMonitor.status, state.anchorMonitor.token, state.anchorMonitor.serial, state.anchorMonitor.verificationUrl]);

  const registerPhoto = useCallback(
    async (
      imageUri: string,
      mode: HashMode,
      aiRiskScore?: number,
      metadata?: Record<string, unknown>,
      opts?: { mediaType?: "photo" | "video" }
    ) => {
      const owner = ownerAddress.trim();
      if (!owner) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error:
            "Missing owner address. Set app.json extra.verityOwnerAddress or EXPO_PUBLIC_VERITY_OWNER_ADDRESS.",
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
        const mediaType = opts?.mediaType ?? "photo";

        if (mode === "sha256") {
          // [각주1] SHA-256 + pHash(선택). 사진은 동시 계산, 동영상은 구간 썸네일+장면전환 키프레임.
          // 서버는 수신 시각 기준 10초 버킷으로 묶어 SHA-256/pHash 머클 배치를 생성합니다.
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

          const teeProof = await createTeeProofForSha256({
            owner,
            sha256,
            serial,
          });

          const record = await registerSha256Ingest({
            owner,
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
            teeProof,
          });

          setState((prev) => ({
            ...prev,
            status: "success",
            txSignature: null,
            verificationUrl: record.verificationUrl,
            qrCodeUrl: record.qrCodeUrl,
            records: [record, ...prev.records],
            anchorMonitor: {
              status: "pending",
              token: extractVerificationToken(record.verificationUrl),
              verificationUrl: record.verificationUrl,
              serial: record.serial || serial,
              message: "Batch anchor pending. The app will keep checking after you leave this screen.",
              lastCheckedAtMs: null,
              anchoredAtMs: null,
            },
          }));

          await persistPendingAnchorRecord(record, serial, sha256, phashVal);

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
          owner,
          mode,
          mediaType,
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
          anchorMonitor: {
            status: "pending",
            token: extractVerificationToken(record.verificationUrl),
            verificationUrl: record.verificationUrl,
            serial: record.serial || serial,
            message: "Batch anchor pending. The app will keep checking after you leave this screen.",
            lastCheckedAtMs: null,
            anchoredAtMs: null,
          },
        }));

        await persistPendingAnchorRecord(record, serial, sha256, phash);

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
          error: error.message || "Registration failed.",
        }));
      }
    },
    [ownerAddress]
  );

  const loadRecords = useCallback(async () => {
    const owner = ownerAddress.trim();
    if (!owner) return;

    setState((prev) => ({ ...prev, loadingRecords: true }));

    try {
      const records = await listAssets(owner);
      setState((prev) => ({ ...prev, records, loadingRecords: false }));
    } catch (error) {
      console.error("Failed to load records:", error);
      setState((prev) => ({ ...prev, loadingRecords: false }));
    }
  }, [ownerAddress]);

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
      anchorMonitor: prev.anchorMonitor,
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

function extractVerificationToken(verificationUrl?: string | null): string | null {
  const url = String(verificationUrl || "").trim();
  if (!url) return null;
  const clean = url.replace(/\/+$/, "");
  const token = clean.split("/").pop();
  return token || null;
}

async function persistPendingAnchorRecord(
  record: VerificationAssetRecord,
  serial: string,
  sha256: string,
  phash: string | null
) {
  const token = extractVerificationToken(record.verificationUrl);
  if (!token) return;
  await writePendingAnchor({
    token,
    verificationUrl: record.verificationUrl,
    serial: record.serial || serial,
    owner: record.owner || null,
    mode: record.mode || null,
    sha256: record.sha256 || sha256,
    phash: record.phash || phash || null,
    createdAtMs: Date.now(),
    lastCheckedAtMs: null,
  });
}

function isVerificationAnchored(payload: VerificationLookupPayload): boolean {
  return !!(
    payload.onchainTimestampMs ||
    payload.batchAnchor?.txHash ||
    payload.batchMerkleRoots?.primary ||
    payload.batchMerkleRoots?.sha256 ||
    payload.batchMerkleRoots?.phash
  );
}
