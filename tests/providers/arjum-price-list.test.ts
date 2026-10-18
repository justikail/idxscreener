import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { inPriceWindow } from "@/server/jobs/datasets";
import { normalizeListQuote } from "@/server/ingestion/arjum-price";
import { ArjumProvider, PRICE_LIST_MAX_CODES } from "@/server/providers/arjum/adapter";
import { arjumPriceListResponseSchema } from "@/server/providers/arjum/schemas";

const fixture = arjumPriceListResponseSchema.parse(JSON.parse(readFileSync("fixtures/arjum/price-list-weekend.json", "utf8")));

function provider(body: unknown, headers: Record<string, string> = {}) {
  const reserve = vi.fn<(cost: number) => Promise<void>>(async () => {});
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } }));
  const p = new ArjumProvider({ apiKey: "sk_test_bukan_key_asli", reserve, fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });
  return { p, reserve, fetchImpl };
}

describe("/api/price/list — adapter", () => {
  it("kuota direservasi sebanyak jumlah kode unik; X-Quota-Cost dibaca", async () => {
    const { p, reserve, fetchImpl } = provider(fixture, { "x-quota-cost": "2" });
    const res = await p.priceList(["bbca", "GOTO", "BBCA"]);
    expect(reserve).toHaveBeenCalledWith(2);
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe("https://stock.arjum.com/api/price/list?codes=BBCA%2CGOTO");
    expect(res.quotaCost).toBe(2);
    expect(Object.keys(res.data.stocks)).toEqual(["BBCA", "GOTO"]);
  });

  it("batch besar gagal sementara tidak di-retry (retry = ratusan kuota lagi)", async () => {
    const reserve = vi.fn<(cost: number) => Promise<void>>(async () => {});
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 502, headers: { "content-type": "application/json" } }));
    const p = new ArjumProvider({ apiKey: "x", reserve, fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });
    const codes = Array.from({ length: 51 }, (_, i) => `K${i}`);
    await expect(p.priceList(codes)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledWith(51);
  });

  it("kosong, kode tidak valid, atau > 1000 kode ditolak sebelum request", async () => {
    const { p, fetchImpl } = provider(fixture);
    await expect(p.priceList([])).rejects.toThrow();
    await expect(p.priceList(["BB-CA"])).rejects.toThrow();
    await expect(p.priceList(Array.from({ length: PRICE_LIST_MAX_CODES + 1 }, (_, i) => `K${i}`))).rejects.toThrow(/maksimum/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("/api/price/list — normalisasi", () => {
  it("respons nyata akhir pekan: penutupan 16 Okt, bukan harga hari ini; perubahan dihitung dari change", () => {
    const { quote, issue } = normalizeListQuote(fixture.stocks.BBCA!, "BBCA", "2026-10-18", fixture.market);
    expect(issue).toBeNull();
    expect(quote).toMatchObject({ lastPrice: 5175, sourceDate: "2026-10-16", isFallbackClose: true, change: -900, prevClose: 6075, vwap: 5217.1, marketState: "weekend" });
    expect(quote!.changePct!).toBeCloseTo(5175 / 6075 - 1, 10);
  });

  it("transaksi hari ini: tanpa source_date tetapi ada data_ts → tanggal dari waktu fetch", () => {
    const entry = { code: "BBCA", last_price: 6225, freq: 14203, lot: 275000, value: 226875000000, change: -75, change_pct: -1.19, data_ts: "14:32:07", quote_age_ms: 1204 };
    const { quote } = normalizeListQuote(entry, "BBCA", "2026-10-19", { status: "open", label: "Sesi 2" });
    expect(quote).toMatchObject({ isFallbackClose: false, sourceDate: "2026-10-19", dataTs: "14:32:07", prevClose: 6300 });
    // Tanpa source_date DAN tanpa data_ts → tidak terbukti hari ini.
    expect(normalizeListQuote({ ...entry, data_ts: null }, "BBCA", "2026-10-19", null).quote!.isFallbackClose).toBe(true);
  });

  it("change_pct penyedia yang tidak konsisten dicatat, hitungan sendiri yang dipakai", () => {
    // Contoh dokumentasi: ANTM change 0 tetapi change_pct 0,93.
    const entry = { code: "ANTM", last_price: 3250, freq: 0, lot: 0, value: 0, change: 0, change_pct: 0.93, source_date: "2026-10-06", data_ts: null, quote_age_ms: null };
    const { quote, issue } = normalizeListQuote(entry, "ANTM", "2026-10-07", null);
    expect(quote!.changePct).toBe(0);
    expect(issue).toContain("change_pct penyedia 0.93");
  });

  it("kode lain, harga ≤ 0, atau penutupan acuan ≤ 0 tidak menghasilkan angka menyesatkan", () => {
    expect(normalizeListQuote(fixture.stocks.BBCA!, "GOTO", "2026-10-18", null).quote).toBeNull();
    expect(normalizeListQuote({ ...fixture.stocks.BBCA!, last_price: 0 }, "BBCA", "2026-10-18", null).quote).toBeNull();
    const bad = normalizeListQuote({ ...fixture.stocks.GOTO!, change: 30 }, "GOTO", "2026-10-18", null);
    expect(bad.quote).toMatchObject({ prevClose: null, changePct: null, change: null });
    expect(bad.issue).toContain("≤ 0");
  });
});

describe("jendela pengambilan harga (WIB)", () => {
  it("Senin–Jumat 08:45–17:00 WIB saja", () => {
    expect(inPriceWindow(new Date("2026-10-19T08:44:00+07:00"))).toBe(false);
    expect(inPriceWindow(new Date("2026-10-19T08:45:00+07:00"))).toBe(true);
    expect(inPriceWindow(new Date("2026-10-19T15:30:00+07:00"))).toBe(true);
    expect(inPriceWindow(new Date("2026-10-19T17:01:00+07:00"))).toBe(false);
    expect(inPriceWindow(new Date("2026-10-18T10:00:00+07:00"))).toBe(false); // Minggu
  });
});
