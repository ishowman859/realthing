import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_RUNTIME_CONFIG_PATH = path.resolve(
  __dirname,
  "..",
  "data",
  "runtime-config.json"
);

function trim(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function getRuntimeConfigPath() {
  return trim(process.env.RUNTIME_CONFIG_PATH) || DEFAULT_RUNTIME_CONFIG_PATH;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeSolanaConfig(input = {}) {
  return {
    rpcUrl: trim(input.rpcUrl),
    cluster: trim(input.cluster),
    commitment: trim(input.commitment),
    keypair: trim(input.keypair),
    anchorDisabled: input.anchorDisabled === true || input.anchorDisabled === "1",
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

export function readRuntimeConfig() {
  const filePath = getRuntimeConfigPath();
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export function writeRuntimeConfig(nextConfig) {
  const filePath = getRuntimeConfigPath();
  ensureParentDir(filePath);
  const normalized = {
    ...readRuntimeConfig(),
    ...nextConfig,
  };
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return normalized;
}

export function getRuntimeSolanaConfig() {
  const config = readRuntimeConfig();
  return normalizeSolanaConfig(config.solana || {});
}

export function saveRuntimeSolanaConfig(input) {
  const solana = normalizeSolanaConfig(input);
  const next = writeRuntimeConfig({ solana });
  return normalizeSolanaConfig(next.solana || {});
}
