import * as FileSystem from "expo-file-system";
import Constants from "expo-constants";

export type HashMode = "sha256" | "phash";
export type MediaType = "photo" | "video";

export interface TeeProofPayload {
  serial: string;
  owner: string;
  sha256: string;
  nonce: string;
  timestamp: number;
}

export interface TeeProof {
  keyId: string | null;
  signature: string | null;
  payload: TeeProofPayload;
  provider: "android-keystore" | "secure-enclave" | "unavailable";
  verified: boolean;
}

export interface RegisterAssetInput {
  owner: string;
  mode: HashMode;
  mediaType: MediaType;
  sourceUri?: string;
  serial?: string;
  sha256?: string;
  phash?: string;
  capturedTimestampMs?: number;
  gps?: { lat: number; lng: number } | null;
  aiRiskScore?: number;
  metadata?: Record<string, unknown>;
  chainTxSignature?: string | null;
  teeProof?: TeeProof;
}

export interface VerificationAssetRecord {
  id: string;
  owner: string;
  mode: HashMode;
  mediaType: MediaType;
  serial?: string;
  sourceUri: string | null;
  sha256?: string;
  phash?: string;
  capturedTimestampMs?: number;
  onchainTimestampMs?: number | null;
  gps?: { lat: number | null; lng: number | null };
  aiRiskScore?: number;
  metadata?: Record<string, unknown>;
  chainTxSignature?: string | null;
  teeProof?: TeeProof;
  verificationUrl: string;
  qrCodeUrl: string;
  createdAt: number;
}

const STORAGE_FILE = `${FileSystem.documentDirectory}verity-assets.json`;
const VERIFY_BASE_URL = "https://verify.verity.app/v";
const API_BASE_URL =
  (Constants.expoConfig?.extra?.verityApiUrl as string | undefined) || "";

export async function registerAsset(
  input: RegisterAssetInput
): Promise<VerificationAssetRecord> {
  if (API_BASE_URL) {
    try {
      return await registerAssetRemote(input);
    } catch {
      return registerAssetLocal(input);
    }
  }
  return registerAssetLocal(input);
}

export async function listAssets(owner: string): Promise<VerificationAssetRecord[]> {
  if (API_BASE_URL) {
    try {
      return await listAssetsRemote(owner);
    } catch {
      // 서버 미연결 시 로컬 폴백
    }
  }
  const all = await readLocalAssets();
  return all
    .filter((item) => item.owner === owner)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSha256UsageCount(owner: string): Promise<number> {
  const items = await listAssets(owner);
  return items.filter((item) => item.mode === "sha256").length;
}

async function registerAssetRemote(
  input: RegisterAssetInput
): Promise<VerificationAssetRecord> {
  const response = await fetch(`${API_BASE_URL}/v1/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error("서버에 자산 등록을 실패했습니다.");
  }
  return (await response.json()) as VerificationAssetRecord;
}

async function listAssetsRemote(owner: string): Promise<VerificationAssetRecord[]> {
  const response = await fetch(
    `${API_BASE_URL}/v1/assets?owner=${encodeURIComponent(owner)}`
  );
  if (!response.ok) {
    throw new Error("서버에서 히스토리를 조회하지 못했습니다.");
  }
  return (await response.json()) as VerificationAssetRecord[];
}

async function registerAssetLocal(
  input: RegisterAssetInput
): Promise<VerificationAssetRecord> {
  const id = createId();
  const verificationUrl = `${VERIFY_BASE_URL}/${id}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
    verificationUrl
  )}`;

  const record: VerificationAssetRecord = {
    id,
    ...input,
    sourceUri: input.sourceUri ?? null,
    serial: input.serial || createSerial(input.mode),
    verificationUrl,
    qrCodeUrl,
    createdAt: Date.now(),
  };

  const current = await readLocalAssets();
  current.push(record);
  await writeLocalAssets(current);
  return record;
}

async function readLocalAssets(): Promise<VerificationAssetRecord[]> {
  const info = await FileSystem.getInfoAsync(STORAGE_FILE);
  if (!info.exists) return [];

  const raw = await FileSystem.readAsStringAsync(STORAGE_FILE);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as VerificationAssetRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalAssets(records: VerificationAssetRecord[]): Promise<void> {
  await FileSystem.writeAsStringAsync(STORAGE_FILE, JSON.stringify(records));
}

function createId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}${rand}`;
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
