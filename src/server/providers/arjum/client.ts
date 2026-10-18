import { ARJUM_BASE_URL } from "./config";
import {
  ArjumAuthError,
  ArjumClientError,
  ArjumNonJsonError,
  ArjumRateLimitError,
  ArjumSchemaError,
  ArjumTransientError,
} from "./errors";

export interface ArjumAttemptLog {
  path: string;
  attempt: number;
  /** Nomor key yang dipakai (mis. "key#2"), BUKAN nilai key. */
  keyLabel: string;
  httpStatus: number | null;
  contentType: string | null;
  durationMs: number;
  outcome: "ok" | "retry" | "fail";
  error?: string;
}

export type ArjumKeySource = string | (() => { key: string; label: string });

export interface ArjumClientOptions {
  /** Satu key, atau pemilih key yang dipanggil ulang setiap percobaan. */
  apiKey: ArjumKeySource;
  /**
   * Reservasi kuota SEBELUM setiap percobaan (termasuk retry). Melempar bila
   * budget habis. `cost` = kuota yang dipotong penyedia untuk request ini
   * (1, kecuali endpoint batch seperti /api/price/list: 1 per kode).
   */
  reserve: (cost: number) => Promise<void>;
  maxAttempts?: number;
  timeoutMs?: number;
  onAttempt?: (log: ArjumAttemptLog) => void;
  /** Header non-sensitif setiap respons HTTP (termasuk 4xx/5xx) — untuk rekonsiliasi kuota. */
  onHeaders?: (headers: Record<string, string>) => Promise<void> | void;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface ArjumResponse {
  body: unknown;
  httpStatus: number;
  contentType: string | null;
  durationMs: number;
  attempts: number;
  /** Hanya header respons non-sensitif (tidak pernah header request/auth). */
  responseHeaders: Record<string, string>;
}

const MAX_RETRY_AFTER_MS = 60_000;
const SAFE_HEADER_PATTERN = /^(content-type|date|cache-control|age|retry-after|x-ratelimit-.*|ratelimit-.*|x-quota-.*|cf-cache-status)$/i;

function pickSafeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (SAFE_HEADER_PATTERN.test(key)) out[key.toLowerCase()] = value;
  });
  return out;
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

async function readDetail(bodyText: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(bodyText) as { detail?: unknown };
    return typeof parsed.detail === "string" ? parsed.detail.slice(0, 200) : null;
  } catch {
    return null;
  }
}

/**
 * GET ke Arjum dengan base URL terkunci. Retry terbatas + exponential backoff
 * dengan jitter HANYA untuk 5xx/timeout/network/429; Retry-After dihormati
 * (ditolak bila > 60 detik, bukan ditunggu). 401/403, 4xx lain, dan respons
 * non-JSON TIDAK di-retry. Setiap percobaan memesan kuota lebih dulu.
 */
export async function arjumGet(
  options: ArjumClientOptions,
  path: string,
  params: Record<string, string | number | undefined> = {},
  call: { cost?: number; maxAttempts?: number } = {},
): Promise<ArjumResponse> {
  if (!path.startsWith("/api/")) throw new Error(`Path Arjum tidak diizinkan: ${path}`);

  const url = new URL(path, ARJUM_BASE_URL);
  if (url.origin !== ARJUM_BASE_URL) throw new Error("Origin Arjum berubah — request dibatalkan.");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = options.random ?? Math.random;
  const maxAttempts = call.maxAttempts ?? options.maxAttempts ?? 3;
  const cost = call.cost ?? 1;
  if (!Number.isInteger(cost) || cost < 1) throw new Error(`Biaya kuota tidak valid: ${cost}`);
  const timeoutMs = options.timeoutMs ?? 30_000;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await options.reserve(cost);

    const { key, label: keyLabel } =
      typeof options.apiKey === "string" ? { key: options.apiKey, label: "key#1" } : options.apiKey();
    const started = Date.now();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { "X-API-Key": key, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const durationMs = Date.now() - started;
      const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      lastError = new ArjumTransientError(isTimeout ? `Timeout ${timeoutMs}ms` : "Kegagalan jaringan", error);
      const willRetry = attempt < maxAttempts;
      options.onAttempt?.({ path, attempt, keyLabel, httpStatus: null, contentType: null, durationMs, outcome: willRetry ? "retry" : "fail", error: lastError.message });
      if (!willRetry) break;
      await sleep(backoffMs(attempt, random));
      continue;
    }

    const durationMs = Date.now() - started;
    const contentType = response.headers.get("content-type");
    if (options.onHeaders) {
      try {
        await options.onHeaders(pickSafeHeaders(response.headers));
      } catch {
        // Rekonsiliasi kuota tidak boleh menggagalkan request yang sudah terjadi.
      }
    }
    const bodyText = await response.text();
    const log = (outcome: ArjumAttemptLog["outcome"], error?: string) =>
      options.onAttempt?.({ path, attempt, keyLabel, httpStatus: response.status, contentType, durationMs, outcome, error });

    if (response.status === 401 || response.status === 403) {
      const err = new ArjumAuthError(response.status, await readDetail(bodyText));
      log("fail", err.message);
      throw err;
    }

    const isJson = contentType?.toLowerCase().includes("application/json") ?? false;

    if (response.status === 429 || response.status >= 500) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      lastError =
        response.status === 429
          ? new ArjumRateLimitError(retryAfterMs !== null ? Math.round(retryAfterMs / 1000) : null)
          : new ArjumTransientError(`HTTP ${response.status}`);
      const tooLong = retryAfterMs !== null && retryAfterMs > MAX_RETRY_AFTER_MS;
      const willRetry = attempt < maxAttempts && !tooLong;
      log(willRetry ? "retry" : "fail", lastError.message);
      if (!willRetry) throw lastError;
      await sleep(retryAfterMs ?? backoffMs(attempt, random));
      continue;
    }

    if (!isJson) {
      const err = new ArjumNonJsonError(response.status, contentType);
      log("fail", err.message);
      throw err;
    }

    if (response.status >= 400) {
      const err = new ArjumClientError(response.status, await readDetail(bodyText));
      log("fail", err.message);
      throw err;
    }

    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      const err = new ArjumSchemaError("Body berlabel JSON tetapi gagal di-parse.", null);
      log("fail", err.message);
      throw err;
    }

    log("ok");
    return { body, httpStatus: response.status, contentType, durationMs, attempts: attempt, responseHeaders: pickSafeHeaders(response.headers) };
  }

  throw lastError ?? new ArjumTransientError("Gagal tanpa detail.");
}

/** 1s, 2s, 4s, ... + jitter 0–500ms, maksimal 30s. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  return Math.min(30_000, 1000 * 2 ** (attempt - 1) + Math.floor(random() * 500));
}
