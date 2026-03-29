import * as FileSystem from "expo-file-system";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { computePhash, computeSha256 } from "./phash";
import { standardizePhotoForHashing } from "./standardizePhoto";
import { extractVideoPhashKeyframes } from "./videoPhash";

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
  gps?: { lat: number | null; lng: number | null } | null;
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

/**
 * 릴리스 빌드에서 `Constants.expoConfig`가 비는 경우가 있어, extra가 없어도 항상 쓸 기본 API.
 * 운영 기본값은 HTTPS 엔드포인트를 사용하고, 로컬 개발은 app.json extra / EXPO_PUBLIC_VERITY_API_URL 로 덮어씁니다.
 */
const DEFAULT_VERITY_API_BASE = "https://verify.verity.app";

const API_BASE_URL = resolveApiBaseUrl();

/** 검증 페이지는 API 호스트의 `/v/{token}` (서버가 index.html 제공). */
const VERIFY_BASE_URL = `${API_BASE_URL.replace(/\/$/, "")}/v`;

function readExtraApiUrl(): string {
  const fromExpo = Constants.expoConfig?.extra?.verityApiUrl;
  if (typeof fromExpo === "string" && fromExpo.trim()) return fromExpo.trim();
  const manifest = Constants.manifest as { extra?: { verityApiUrl?: string } } | null;
  const fromManifest = manifest?.extra?.verityApiUrl;
  if (typeof fromManifest === "string" && fromManifest.trim()) return fromManifest.trim();
  const envUrl =
    typeof process !== "undefined" && process.env?.EXPO_PUBLIC_VERITY_API_URL
      ? String(process.env.EXPO_PUBLIC_VERITY_API_URL).trim()
      : "";
  return envUrl;
}

function resolveApiBaseUrl(): string {
  let configured = readExtraApiUrl();
  if (!configured) {
    if (Platform.OS === "android" && !Constants.isDevice) {
      configured = "http://localhost:4000";
    } else {
      configured = DEFAULT_VERITY_API_BASE;
    }
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

/** 기기에서 계산한 SHA-256(+선택 pHash)을 서버로 보냅니다. 서버가 수신 시각 기준 10초 버킷으로 배치합니다. */
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

/** 웹 `script.js` · 앱 검증 화면과 동일한 공개 조회 응답 */
export interface MerkleProofNodeApi {
  hash: string;
  position: string;
}

export interface VerificationLookupPayload {
  token: string;
  assetId?: string;
  serial?: string;
  owner?: string;
  mode?: string;
  mediaType?: string;
  sha256?: string;
  phash?: string;
  assetUrl?: string;
  capturedTimestampMs?: number;
  onchainTimestampMs?: number | null;
  gps?: { lat?: number | null; lng?: number | null } | null;
  locationSummary?: string | null;
  indexedBlockNumber?: number | null;
  merkleTreeType?: "sha256" | "phash";
  merkleLeafHash?: string | null;
  merkleProof?: MerkleProofNodeApi[] | null;
  merkleRoot?: string | null;
  computedMerkleRoot?: string | null;
  merkleTrees?: {
    sha256?: VerificationMerkleTree | null;
    phash?: VerificationMerkleTree | null;
  };
  batchMerkleRoots?: {
    primary?: string | null;
    sha256?: string | null;
    phash?: string | null;
  } | null;
  batchAnchor?: {
    txHash?: string | null;
    blockNumber?: number | null;
    payload?: Record<string, unknown> | null;
    explorerUrl?: string | null;
    source?: string | null;
  } | null;
  chainTxSignature?: string | null;
  chainVerified?: boolean;
  duplicateScore?: number | null;
  aiRiskScore?: number | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface VerificationMerkleTree {
  type: "sha256" | "phash";
  leafHash?: string | null;
  proof?: MerkleProofNodeApi[] | null;
  storedRoot?: string | null;
  computedRoot?: string | null;
  verified?: boolean;
  reason?: string | null;
}

export interface UploadVerificationResult {
  verification: VerificationLookupPayload;
  exactMatchType?: "sha256" | null;
  bestPhashScore?: number | null;
  exactPhashMatch?: Omit<SimilarVerificationMatch, "score" | "mode"> | null;
  similarMatches?: SimilarVerificationMatch[];
}

export interface SimilarVerificationMatch {
  token: string;
  score: number;
  serial?: string;
  owner?: string;
  mode?: string;
  mediaType?: string;
  createdAt?: string;
}

export class VerificationLookupError extends Error {
  similarMatches: SimilarVerificationMatch[];
  bestPhashScore: number | null;
  exactPhashMatch: Omit<SimilarVerificationMatch, "score" | "mode"> | null;

  constructor(message: string, opts?: {
    similarMatches?: SimilarVerificationMatch[];
    bestPhashScore?: number | null;
    exactPhashMatch?: Omit<SimilarVerificationMatch, "score" | "mode"> | null;
  }) {
    super(message);
    this.name = "VerificationLookupError";
    this.similarMatches = opts?.similarMatches || [];
    this.bestPhashScore = opts?.bestPhashScore ?? null;
    this.exactPhashMatch = opts?.exactPhashMatch ?? null;
  }
}

export async function fetchVerificationByToken(
  token: string
): Promise<VerificationLookupPayload> {
  const t = token.trim();
  if (!t) throw new Error("토큰이 필요합니다.");
  if (!API_BASE_URL) throw new Error("API URL이 설정되지 않았습니다.");
  const res = await fetch(`${API_BASE_URL}/v1/verify/${encodeURIComponent(t)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      (body as { message?: string }).message || `조회 실패 (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

export async function recheckVerificationByToken(
  token: string
): Promise<VerificationLookupPayload> {
  const t = token.trim();
  if (!t) throw new Error("토큰이 필요합니다.");
  if (!API_BASE_URL) throw new Error("API URL이 설정되지 않았습니다.");
  const res = await fetch(
    `${API_BASE_URL}/v1/verify/${encodeURIComponent(t)}/recheck`,
    { method: "POST" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      (body as { message?: string }).message ||
      `재검증 요청 실패 (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

export async function uploadVerificationMedia(input: {
  uri: string;
  mediaType: MediaType;
  fileName?: string | null;
  mimeType?: string | null;
  owner?: string | null;
}): Promise<UploadVerificationResult> {
  if (!API_BASE_URL) throw new Error("API URL이 설정되지 않았습니다.");

  const standardizedPhoto =
    input.mediaType === "photo"
      ? await standardizePhotoForHashing({ uri: input.uri })
      : null;
  const hashUri = standardizedPhoto?.uri ?? input.uri;
  const sha256 = await computeSha256(hashUri);
  let phash: string | null = null;
  if (input.mediaType === "video") {
    const keyframes = await extractVideoPhashKeyframes(input.uri);
    phash = keyframes[0]?.phash ?? null;
  } else {
    phash = await computePhash(hashUri);
  }

  const res = await fetch(`${API_BASE_URL}/v1/verify/search-hashes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sha256,
      phash,
      mediaType: input.mediaType,
      fileName:
        input.fileName ||
        `${input.mediaType === "video" ? "verify-video" : "verify-image"}-${
          Date.now()
        }${input.mediaType === "video" ? ".mp4" : ".jpg"}`,
      mimeType:
        (input.mediaType === "photo" ? standardizedPhoto?.mimeType : input.mimeType) ||
        (input.mediaType === "video" ? "video/mp4" : "image/jpeg"),
      owner: input.owner?.trim() || null,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      (body as { message?: string }).message || `해시 검증 실패 (${res.status})`;
    throw new Error(msg);
  }
  const payload = (await res.json()) as {
    verification?: VerificationLookupPayload | null;
    similarMatches?: SimilarVerificationMatch[];
    bestPhashScore?: number | null;
    exactPhashMatch?: Omit<SimilarVerificationMatch, "score" | "mode"> | null;
  };
  if (!payload.verification) {
    const hasPhashClue =
      !!payload.exactPhashMatch ||
      (typeof payload.bestPhashScore === "number" && payload.bestPhashScore > 0);
    throw new VerificationLookupError(
      hasPhashClue
        ? "동일한 SHA-256 원본은 찾지 못했습니다. 서버에 같은 파일 바이트가 등록된 기록은 없고, pHash 유사 후보만 있습니다."
        : "동일한 SHA-256 원본을 찾지 못했습니다. 앱이 저장한 원본 사진/영상을 다시 선택해 주세요.",
      {
        similarMatches: payload.similarMatches || [],
        bestPhashScore: payload.bestPhashScore ?? null,
        exactPhashMatch: payload.exactPhashMatch ?? null,
      }
    );
  }
  return {
    verification: payload.verification,
    exactMatchType: "sha256",
    bestPhashScore: payload.bestPhashScore ?? null,
    exactPhashMatch: payload.exactPhashMatch ?? null,
    similarMatches: payload.similarMatches || [],
  };
}
