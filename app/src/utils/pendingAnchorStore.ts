import * as FileSystem from "expo-file-system";

const PENDING_ANCHOR_FILE = `${FileSystem.documentDirectory}pending-anchor.json`;

export interface PendingAnchorRecord {
  token: string;
  verificationUrl: string;
  serial?: string | null;
  owner?: string | null;
  mode?: string | null;
  sha256?: string | null;
  phash?: string | null;
  createdAtMs: number;
  lastCheckedAtMs?: number | null;
}

export async function readPendingAnchor(): Promise<PendingAnchorRecord | null> {
  try {
    const info = await FileSystem.getInfoAsync(PENDING_ANCHOR_FILE);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(PENDING_ANCHOR_FILE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAnchorRecord | null;
    if (!parsed || typeof parsed !== "object" || !parsed.token || !parsed.verificationUrl) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writePendingAnchor(record: PendingAnchorRecord): Promise<void> {
  await FileSystem.writeAsStringAsync(PENDING_ANCHOR_FILE, JSON.stringify(record));
}

export async function clearPendingAnchor(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(PENDING_ANCHOR_FILE);
    if (info.exists) {
      await FileSystem.deleteAsync(PENDING_ANCHOR_FILE, { idempotent: true });
    }
  } catch {
    // ignore persistence cleanup errors
  }
}
