import { NativeModules, Platform } from "react-native";

type NativePinnedHttpModule = {
  request: (
    method: string,
    url: string,
    headers?: Record<string, string>,
    body?: string | null
  ) => Promise<{
    status: number;
    ok: boolean;
    body: string;
    headers?: Record<string, string>;
  }>;
};

const NativePinnedHttp = NativeModules.VerityPinnedHttp as
  | NativePinnedHttpModule
  | undefined;

function hasPinnedModule(): boolean {
  return Platform.OS === "android" && !!NativePinnedHttp?.request;
}

function shouldPin(url: string): boolean {
  if (!hasPinnedModule()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "api.veritychains.com";
  } catch {
    return false;
  }
}

type JsonRequestInit = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string | null;
};

export async function requestJson(
  url: string,
  init: JsonRequestInit = {}
): Promise<{
  ok: boolean;
  status: number;
  json: <T>() => Promise<T>;
  text: () => Promise<string>;
}> {
  if (!shouldPin(url)) {
    const response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body ?? undefined,
    });
    return {
      ok: response.ok,
      status: response.status,
      json: async <T>() => (await response.json()) as T,
      text: async () => await response.text(),
    };
  }

  const result = await NativePinnedHttp!.request(
    init.method || "GET",
    url,
    init.headers || {},
    init.body ?? null
  );

  return {
    ok: !!result.ok,
    status: Number(result.status || 0),
    json: async <T>() => JSON.parse(result.body || "null") as T,
    text: async () => result.body || "",
  };
}
