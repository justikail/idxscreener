import { describe, expect, it } from "vitest";

import { tryParseSourceDate, validateAndNormalizeDailyBars } from "@/server/ingestion/validate-daily-bars";
import type { RawDailyBarRow } from "@/server/providers/types";

// Fixture SINTETIS (bukan data IDX asli) hanya meniru BENTUK data sesuai
// temuan riset (lihat docs/data-sources.md) — kode saham "TESTX"/"TESTY" jelas
// bukan kode BEI sungguhan, sengaja dibuat demikian.

function makeRow(overrides: Partial<RawDailyBarRow> = {}): RawDailyBarRow {
  return {
    stockCode: "TESTX",
    stockName: "Contoh Uji Tbk",
    tradingDate: "2026-08-14T00:00:00",
    open: 1000,
    high: 1050,
    low: 990,
    close: 1020,
    previous: 1000,
    volume: 5_000_000,
    value: 5_100_000_000,
    frequency: 300,
    extra: {},
    ...overrides,
  };
}

describe("tryParseSourceDate", () => {
  it("mem-parse format ISO 8601", () => {
    expect(tryParseSourceDate("2026-08-14T00:00:00")).toBe("2026-08-14");
    expect(tryParseSourceDate("2026-08-14")).toBe("2026-08-14");
  });

  it("mem-parse format /Date(ms)/ ala JSON.NET lama", () => {
    const ms = Date.UTC(2026, 7, 14); // Agustus = index 7
    expect(tryParseSourceDate(`/Date(${ms})/`)).toBe("2026-08-14");
  });

  it("mengembalikan null untuk format tidak dikenal (bukan menebak)", () => {
    expect(tryParseSourceDate("bukan-tanggal")).toBeNull();
    expect(tryParseSourceDate("")).toBeNull();
  });
});

describe("validateAndNormalizeDailyBars", () => {
  it("array kosong menghasilkan info issue, TIDAK diasumsikan hari libur", () => {
    const result = validateAndNormalizeDailyBars([], "20260814");
    expect(result.validRows).toHaveLength(0);
    expect(result.issues).toEqual([
      expect.objectContaining({ severity: "info", code: "empty_response" }),
    ]);
  });

  it("baris valid dinormalisasi dengan benar", () => {
    const result = validateAndNormalizeDailyBars([makeRow()], "20260814");
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]).toMatchObject({
      instrumentCode: "TESTX",
      tradingDate: "2026-08-14",
      close: 1020,
      hasTransaction: true,
    });
    expect(result.issues).toHaveLength(0);
  });

  it("baris dengan tanggal TIDAK COCOK dengan tanggal diminta dikecualikan", () => {
    const result = validateAndNormalizeDailyBars(
      [makeRow({ tradingDate: "2026-08-15T00:00:00" })],
      "20260814",
    );
    expect(result.validRows).toHaveLength(0);
    expect(result.issues[0]).toMatchObject({ severity: "error", code: "date_mismatch" });
  });

  it("kode duplikat pada tanggal sama dikecualikan (baris kedua)", () => {
    const result = validateAndNormalizeDailyBars(
      [makeRow(), makeRow({ close: 999 })],
      "20260814",
    );
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]!.close).toBe(1020);
    expect(result.issues.some((i) => i.code === "duplicate_stock_code")).toBe(true);
  });

  it("kode/nama mengandung DUMMY dikecualikan, tidak diterbitkan sebagai saham produksi", () => {
    const result = validateAndNormalizeDailyBars(
      [makeRow({ stockCode: "DUMMY1" }), makeRow({ stockCode: "TESTY", stockName: "DUMMY Test Tbk" })],
      "20260814",
    );
    expect(result.validRows).toHaveLength(0);
    expect(result.issues.filter((i) => i.code === "dummy_row_excluded")).toHaveLength(2);
  });

  it("volume 0 dengan close terisi dianggap NORMAL (tidak ada transaksi), bukan data hilang", () => {
    const result = validateAndNormalizeDailyBars([makeRow({ volume: 0 })], "20260814");
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]!.hasTransaction).toBe(false);
    expect(result.validRows[0]!.close).not.toBeNull();
    expect(result.issues.some((i) => i.code === "no_price_data")).toBe(false);
  });

  it("baris tanpa data harga sama sekali diberi warning, tapi tetap disertakan", () => {
    const result = validateAndNormalizeDailyBars(
      [makeRow({ open: null, high: null, low: null, close: null })],
      "20260814",
    );
    expect(result.validRows).toHaveLength(1);
    expect(result.issues.some((i) => i.code === "no_price_data")).toBe(true);
  });

  it("tanggal baris tidak bisa diparse dikecualikan", () => {
    const result = validateAndNormalizeDailyBars(
      [makeRow({ tradingDate: "tanggal-aneh" })],
      "20260814",
    );
    expect(result.validRows).toHaveLength(0);
    expect(result.issues[0]).toMatchObject({ code: "unparseable_date" });
  });
});
