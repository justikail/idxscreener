import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdxDailyBarsProvider } from "@/server/providers/idx/adapter";
import { IdxBlockedError, IdxSchemaError, IdxTransientError } from "@/server/providers/idx/errors";

// Semua test di sini memakai fetch YANG DI-MOCK — TIDAK ADA request jaringan
// sungguhan ke idx.co.id (CI default memakai fixture, lihat AGENTS.md §12 dan
// instruksi M3). Contract test terhadap endpoint live bersifat opt-in
// terpisah (belum diaktifkan pada sesi ini — akses server-side saat ini
// diblokir Cloudflare, lihat docs/data-sources.md).

const CLOUDFLARE_CHALLENGE_HTML = `<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>`;

function mockFetchOnce(response: { status: number; contentType: string; body: string }) {
  return vi.fn(async () =>
    new Response(response.body, {
      status: response.status,
      headers: { "content-type": response.contentType },
    }),
  );
}

describe("IdxDailyBarsProvider (mocked HTTP)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("respons 403 dengan halaman Cloudflare -> IdxBlockedError, TIDAK di-retry", async () => {
    const fetchMock = mockFetchOnce({ status: 403, contentType: "text/html; charset=UTF-8", body: CLOUDFLARE_CHALLENGE_HTML });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new IdxDailyBarsProvider();
    await expect(provider.fetchDailyBars("2026-08-14")).rejects.toThrow(IdxBlockedError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // TIDAK diulang — blokir bukan kegagalan transien
  });

  it("respons 200 dengan array baris valid -> berhasil dinormalisasi", async () => {
    const rows = [
      {
        No: 1,
        IDStockSummary: 100,
        Date: "2026-08-14T00:00:00",
        StockCode: "TESTX",
        StockName: "Contoh Uji Tbk",
        Remarks: "",
        Previous: 1000,
        OpenPrice: 1000,
        FirstTrade: 1000,
        High: 1050,
        Low: 990,
        Close: 1020,
        Change: 20,
        Volume: 5000000,
        Value: 5100000000,
        Frequency: 300,
        IndexIndividual: 0,
        Offer: 1025,
        OfferVolume: 100,
        Bid: 1015,
        BidVolume: 100,
        ListedShares: 1000000000,
        TradebleShares: 800000000,
        WeightForIndex: 0.5,
        ForeignSell: 0,
        ForeignBuy: 0,
        DelistingDate: null,
        NonRegularVolume: 0,
        NonRegularValue: 0,
        NonRegularFrequency: 0,
        persen: 2.0,
        percentage: 2.0,
      },
    ];
    const fetchMock = mockFetchOnce({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(rows) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new IdxDailyBarsProvider();
    const result = await provider.fetchDailyBars("2026-08-14");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ stockCode: "TESTX", close: 1020, volume: 5000000 });
    expect(result.unknownFieldKeys).toHaveLength(0);
    expect(result.isEmpty).toBe(false);
  });

  it("respons 200 JSON array kosong -> isEmpty=true, tidak melempar error", async () => {
    const fetchMock = mockFetchOnce({ status: 200, contentType: "application/json", body: "[]" });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new IdxDailyBarsProvider();
    const result = await provider.fetchDailyBars("2026-08-16"); // misal hari Minggu
    expect(result.isEmpty).toBe(true);
    expect(result.rows).toHaveLength(0);
  });

  it("respons 200 JSON tapi baris tidak punya StockCode -> IdxSchemaError", async () => {
    const fetchMock = mockFetchOnce({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ Date: "2026-08-14", Close: 100 }]),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new IdxDailyBarsProvider();
    await expect(provider.fetchDailyBars("2026-08-14")).rejects.toThrow(IdxSchemaError);
  });

  it("field tak dikenal pada respons ditangkap sebagai unknownFieldKeys, tidak jadi metrik diam-diam", async () => {
    const rows = [
      {
        Date: "2026-08-14T00:00:00",
        StockCode: "TESTX",
        Close: 1020,
        MedanMagnetBumi: 42, // field fiktif yang tidak ada di daftar dikenal
      },
    ];
    const fetchMock = mockFetchOnce({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new IdxDailyBarsProvider();
    const result = await provider.fetchDailyBars("2026-08-14");
    expect(result.unknownFieldKeys).toContain("MedanMagnetBumi");
  });

  it("HTTP 500 di-retry terbatas lalu melempar IdxTransientError bila terus gagal", async () => {
    const fetchMock = vi.fn(
      async () => new Response("Internal Server Error", { status: 500, headers: { "content-type": "text/plain" } }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new IdxDailyBarsProvider();
    const promise = provider.fetchDailyBars("2026-08-14");
    // Pasang assertion (attach .catch) SEBELUM timer dijalankan, supaya Node
    // tidak sempat melaporkan "unhandled rejection" saat promise reject di
    // tengah vi.runAllTimersAsync() (baru dipasang di baris berikutnya = telat).
    const assertion = expect(promise).rejects.toThrow(IdxTransientError);
    // Percepat timer backoff retry (setTimeout) agar test tidak menunggu detik sungguhan.
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1); // TERBUKTI ada retry (berbeda dari 403 yang tidak retry)
  });
});
