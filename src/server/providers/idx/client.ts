import { IdxBlockedError, IdxTransientError } from "./errors";

const BASE_URL = "https://www.idx.co.id";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TRANSIENT_RETRIES = 2; // hanya untuk kegagalan jaringan/timeout, BUKAN untuk 403/blokir
const RETRY_BACKOFF_MS = [1_000, 3_000];

export interface RawHttpResult {
  httpStatus: number;
  contentType: string | null;
  bodyText: string;
}

/**
 * Fetch mentah satu request ke IDX dengan timeout dan retry TERBATAS hanya
 * untuk kegagalan transien (network error, timeout, 5xx). Respons 403 atau
 * konten HTML (indikasi halaman tantangan Cloudflare) TIDAK di-retry dan
 * TIDAK dicoba dilewati dengan cara apa pun (AGENTS.md §5, §11) — dilempar
 * sebagai IdxBlockedError agar pemanggil berhenti, bukan mengulang.
 */
export async function fetchIdxRaw(path: string, params: Record<string, string>): Promise<RawHttpResult> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ihsg-screener-dev/0.1; +https://localhost) Node.js",
          Accept: "application/json, text/plain, */*",
        },
      });
      clearTimeout(timeout);

      const contentType = response.headers.get("content-type");
      const bodyText = await response.text();

      if (response.status >= 500) {
        // 5xx dianggap transien, layak retry terbatas.
        lastError = new IdxTransientError(`HTTP ${response.status} dari IDX (kemungkinan transien).`);
        if (attempt < MAX_TRANSIENT_RETRIES) {
          await sleep(RETRY_BACKOFF_MS[attempt] ?? 3_000);
          continue;
        }
        throw lastError;
      }

      if (response.status !== 200 || !contentType?.includes("application/json")) {
        // 403/blokir Cloudflare atau bentuk lain yang bukan JSON 200 — TIDAK
        // di-retry, dilempar langsung.
        throw new IdxBlockedError(response.status, contentType);
      }

      return { httpStatus: response.status, contentType, bodyText };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof IdxBlockedError) throw error;

      const isAbort = error instanceof Error && error.name === "AbortError";
      lastError = new IdxTransientError(isAbort ? "Timeout menghubungi IDX." : "Gagal menghubungi IDX.", error);
      if (attempt < MAX_TRANSIENT_RETRIES) {
        await sleep(RETRY_BACKOFF_MS[attempt] ?? 3_000);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new IdxTransientError("Gagal menghubungi IDX tanpa detail error.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
