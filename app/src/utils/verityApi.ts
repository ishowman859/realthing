import * as FileSystem from "expo-file-system";
import Constants from "expo-constants";
import { Platform } from "react-native";

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

export interface AntiSpoofResult {
  // [각주1] 0~1 범위에서 스푸핑(재촬영) 가능성 확률입니다.
  spoofProbability: number;
  // [각주2] 서버에서 사용한 모델 식별값입니다.
  model: string;
}

const STORAGE_FILE = `${FileSystem.documentDirectory}verity-assets.json`;
/** 검증 페이지 베이스 (로컬 폴백·QR 링크). 서버는 `VERIFY_BASE_URL` 환경변수로 동일하게 맞추는 것을 권장. */
/** 서버 `VERIFY_BASE_URL` 과 맞추면 좋음. 기본 패턴: …/v/{token} (정적 검증 페이지가 따로 있으면 그 URL로) */
const VERIFY_BASE_URL = "http://98.84.127.220:4000/v";
const API_BASE_URL = resolveApiBaseUrl();

// 로컬 API 주소: Android 에뮬레이터만 localhost → 10.0.2.2 (호스트 PC).
// 실제 폰은 localhost/127.0.0.1이 폰 자신을 가리키므로 EXPO_PUBLIC_VERITY_API_URL 로 PC LAN IP 지정.
function resolveApiBaseUrl(): string {
  const configured = (
    (Constants.expoConfig?.extra?.verityApiUrl as string | undefined) || ""
  ).trim();
  if (!configured) {
    if (Platform.OS === "android") {
      return Constants.isDevice ? "" : "http://10.0.2.2:4000";
    }
    return "http://98.84.127.220:4000";
  }
  if (
    Platform.OS === "android" &&
    (configured.includes("localhost") || configured.includes("127.0.0.1")) &&
    !Constants.isDevice
  ) {
    return configured
      .replace("localhost", "10.0.2.2")
      .replace("127.0.0.1", "10.0.2.2");
  }
  return configured;
}

export interface Sha256IngestInput {
  owner: string;
  sha256: string;
  /** 사진: 흑백 근사 pHash / 동영상: 대표 프레임(첫 키프레임) pHash */
  phash?: string | null;
  mediaType?: MediaType;
  serial?: string;
  capturedTimestampMs?: number;
  aiRiskScore?: number;
  metadata?: Record<string, unknown>;
}

/** 기기에서 계산한 SHA-256(+선택 pHash)을 서버로 보냅니다. 서버가 수신 시각 기준 1분 버킷으로 배치합니다. */
export async function registerSha256Ingest(
  input: Sha256IngestInput
): Promise<VerificationAssetRecord> {
  if (API_BASE_URL) {
    try {
      return await registerSha256IngestRemote(input);
    } catch {
      return registerAssetLocal({
        owner: input.owner,
        mode: "sha256",
        mediaType: input.mediaType ?? "photo",
        serial: input.serial,
        sha256: input.sha256,
        phash: input.phash ?? undefined,
        capturedTimestampMs: input.capturedTimestampMs,
        aiRiskScore: input.aiRiskScore,
        metadata: input.metadata,
        chainTxSignature: null,
      });
    }
  }
  return registerAssetLocal({
    owner: input.owner,
    mode: "sha256",
    mediaType: input.mediaType ?? "photo",
    serial: input.serial,
    sha256: input.sha256,
    phash: input.phash ?? undefined,
    capturedTimestampMs: input.capturedTimestampMs,
    aiRiskScore: input.aiRiskScore,
    metadata: input.metadata,
    chainTxSignature: null,
  });
}

async function registerSha256IngestRemote(
  input: Sha256IngestInput
): Promise<VerificationAssetRecord> {
  const response = await fetch(`${API_BASE_URL}/v1/ingest/sha256`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: input.owner,
      sha256: input.sha256,
      phash: input.phash ?? undefined,
      mediaType: input.mediaType ?? "photo",
      serial: input.serial,
      capturedTimestampMs: input.capturedTimestampMs,
      aiRiskScore: input.aiRiskScore,
      metadata: input.metadata,
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(errText || "SHA-256 수집 요청 실패");
  }
  return (await response.json()) as VerificationAssetRecord;
}

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

export async function checkAntiSpoof(
  imageUri: string
): Promise<AntiSpoofResult | null> {
  if (!API_BASE_URL) return null;
  try {
    const imageBase64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const response = await fetch(`${API_BASE_URL}/v1/anti-spoof/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64 }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<AntiSpoofResult>;
    if (typeof data.spoofProbability !== "number") return null;
    return {
      spoofProbability: Math.max(0, Math.min(1, data.spoofProbability)),
      model: data.model || "Silent-Face-Anti-Spoofing",
    };
  } catch {
    return null;
  }
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
