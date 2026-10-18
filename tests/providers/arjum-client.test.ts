import { afterEach, describe, expect, it, vi } from "vitest";

import { arjumGet, backoffMs, type ArjumClientOptions } from "@/server/providers/arjum/client";
import { assertStockCode } from "@/server/providers/arjum/config";
import {
  ArjumAuthError,
  ArjumClientError,
  ArjumNonJsonError,
  ArjumRateLimitError,
  ArjumTransientError,
} from "@/server/providers/arjum/errors";
import { QuotaExhaustedError, quotaDateWib } from "@/server/quota/budget";

// Tanpa jaringan: fetch disuntik. Fokus: setiap percobaan (termasuk retry)
// memesan kuota, kegagalan permanen tidak di-retry, Retry-After dihormati.

const FAKE_KEY = "sk_test_bukan_key_asli";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function setup(responses: Array<Response | Error>) {
  const queue = [...responses];
  const fetchImpl = vi.fn<(url: URL | RequestInfo, init?: RequestInit) => Promise<Response>>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("fetch dipanggil lebih banyak dari yang diharapkan");
    if (next instanceof Error) throw next;
    return next;
  });
  const reserve = vi.fn(async () => {});
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const options: ArjumClientOptions = {
    apiKey: FAKE_KEY,
    reserve,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep,
    random: () => 0,
    maxAttempts: 3,
  };
  return { options, fetchImpl, reserve, sleep };
}

describe("arjumGet", () => {
  it("200 JSON: satu reservasi kuota, header X-API-Key terkirim, base URL terkunci", async () => {
    const { options, fetchImpl, reserve } = setup([jsonResponse(200, { ok: true })]);
    const res = await arjumGet(options, "/api/history/BBCA", { limit: 60 });

    expect(res.body).toEqual({ ok: true });
    expect(reserve).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://stock.arjum.com/api/history/BBCA?limit=60");
    expect((init?.headers as Record<string, string>)["X-API-Key"]).toBe(FAKE_KEY);
    // Header request (berisi key) tidak pernah ikut dikembalikan.
    expect(JSON.stringify(res)).not.toContain(FAKE_KEY);
  });

  it("401 -> ArjumAuthError tanpa retry", async () => {
    const { options, fetchImpl, reserve } = setup([jsonResponse(401, { detail: "Autentikasi diperlukan." })]);
    await expect(arjumGet(options, "/api/market-cap")).rejects.toBeInstanceOf(ArjumAuthError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledTimes(1);
  });

  it("HTML (mis. halaman challenge) -> ArjumNonJsonError tanpa retry", async () => {
    const html = new Response("<html>Just a moment...</html>", { status: 200, headers: { "content-type": "text/html" } });
    const { options, fetchImpl } = setup([html]);
    await expect(arjumGet(options, "/api/market-cap")).rejects.toBeInstanceOf(ArjumNonJsonError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("404 JSON -> ArjumClientError tanpa retry", async () => {
    const { options, fetchImpl } = setup([jsonResponse(404, { detail: "Saham tidak ditemukan" })]);
    await expect(arjumGet(options, "/api/history/ZZZZ")).rejects.toBeInstanceOf(ArjumClientError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("503 lalu 200: retry memesan kuota lagi (retry = konsumsi kuota potensial)", async () => {
    const { options, reserve, sleep } = setup([jsonResponse(503, {}), jsonResponse(200, { ok: 1 })]);
    const res = await arjumGet(options, "/api/market-cap");
    expect(res.attempts).toBe(2);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(backoffMs(1, () => 0));
  });

  it("timeout berulang -> ArjumTransientError setelah maxAttempts, reservasi = jumlah percobaan", async () => {
    const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    const { options, reserve } = setup([timeout, timeout, timeout]);
    await expect(arjumGet(options, "/api/market-cap")).rejects.toBeInstanceOf(ArjumTransientError);
    expect(reserve).toHaveBeenCalledTimes(3);
  });

  it("429 dengan Retry-After 2 detik: menunggu sesuai header lalu retry", async () => {
    const { options, sleep } = setup([jsonResponse(429, {}, { "retry-after": "2" }), jsonResponse(200, {})]);
    await arjumGet(options, "/api/market-cap");
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("429 dengan Retry-After 120 detik: tidak menunggu lama, langsung ArjumRateLimitError", async () => {
    const { options, fetchImpl, sleep } = setup([jsonResponse(429, {}, { "retry-after": "120" })]);
    await expect(arjumGet(options, "/api/market-cap")).rejects.toBeInstanceOf(ArjumRateLimitError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("budget habis saat reservasi: tidak ada request yang dikirim", async () => {
    const { options, fetchImpl } = setup([jsonResponse(200, {})]);
    options.reserve = async () => {
      throw new QuotaExhaustedError("arjum", "2026-10-04", 800, 800);
    };
    await expect(arjumGet(options, "/api/market-cap")).rejects.toBeInstanceOf(QuotaExhaustedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("menolak path di luar /api/ dan kode saham tidak valid (tidak ada URL arbitrer)", async () => {
    const { options } = setup([]);
    await expect(arjumGet(options, "https://contoh.invalid/api/x")).rejects.toThrow();
    expect(() => assertStockCode("BB/CA")).toThrow();
    expect(() => assertStockCode("../x")).toThrow();
    expect(assertStockCode(" bbca ")).toBe("BBCA");
  });
});

describe("quotaDateWib (reset kuota Arjum 00:00 WIB)", () => {
  it("17:30 UTC sudah hari berikutnya di WIB (UTC+7)", () => {
    expect(quotaDateWib(new Date("2026-10-03T17:30:00Z"))).toBe("2026-10-04");
  });
  it("16:59 UTC masih hari yang sama di WIB", () => {
    expect(quotaDateWib(new Date("2026-10-03T16:59:00Z"))).toBe("2026-10-03");
  });
});

describe("konfigurasi key & budget", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("hanya satu key dipakai: ARJUM_API_KEY, atau key pertama ARJUM_API_KEYS — tanpa rotasi", async () => {
    const { arjumApiKey, arjumConfiguredKeyCount } = await import("@/server/providers/arjum/config");
    delete process.env.ARJUM_API_KEY;
    process.env.ARJUM_API_KEYS = " sk_test_a , sk_test_b,sk_test_c";
    expect(arjumApiKey()).toBe("sk_test_a");
    expect(arjumApiKey()).toBe("sk_test_a");
    expect(arjumConfiguredKeyCount()).toBe(3);
    process.env.ARJUM_API_KEY = "sk_test_single";
    expect(arjumApiKey()).toBe("sk_test_single");
  });

  it("budget dipotong ke kuota akun, bawaan 990, tidak pernah dinaikkan", async () => {
    const { arjumDailyBudget, arjumBudgetClamped } = await import("@/server/providers/arjum/config");
    delete process.env.ARJUM_ACCOUNT_QUOTA;
    process.env.ARJUM_DAILY_BUDGET = "5000";
    expect(arjumDailyBudget()).toBe(1000);
    expect(arjumBudgetClamped()).toBe(true);
    process.env.ARJUM_DAILY_BUDGET = "abc";
    expect(arjumDailyBudget()).toBe(990);
    delete process.env.ARJUM_DAILY_BUDGET;
    expect(arjumDailyBudget()).toBe(990);
    process.env.ARJUM_DAILY_BUDGET = "300";
    expect(arjumDailyBudget()).toBe(300);
    expect(arjumBudgetClamped()).toBe(false);
  });

  it("setiap percobaan (termasuk retry) memanggil pemilih lagi, reservasi kuota tetap satu per percobaan", async () => {
    const { options, reserve, fetchImpl } = setup([jsonResponse(503, {}), jsonResponse(200, {})]);
    const labels: string[] = [];
    let n = 0;
    options.apiKey = () => ({ key: `sk_test_${n}`, label: `key#${++n}` });
    options.onAttempt = (log) => labels.push(log.keyLabel);
    await arjumGet(options, "/api/market-cap");
    expect(labels).toEqual(["key#1", "key#2"]);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[1]![1]?.headers as Record<string, string>)["X-API-Key"]).toBe("sk_test_1");
  });
});
