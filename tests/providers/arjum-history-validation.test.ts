import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { validateArjumHistory } from "@/server/ingestion/validate-arjum-history";
import { arjumHistoryResponseSchema, type ArjumHistoryResponse } from "@/server/providers/arjum/schemas";

const fixture = JSON.parse(readFileSync("fixtures/arjum/history-sample.json", "utf8"));
const TODAY = "2026-10-04";

function withRows(rows: ArjumHistoryResponse["rows"]): ArjumHistoryResponse {
  return { stock_code: "CONTOH", frame: "daily", rows };
}

const baseRow = { date: "2026-09-14", open: 1000, high: 1030, low: 990, close: 1020, volume: 2000000, value: 2040000000, freq: 410 };

describe("skema respons /api/history", () => {
  it("fixture berbentuk respons teramati lolos skema", () => {
    expect(arjumHistoryResponseSchema.safeParse(fixture).success).toBe(true);
  });
  it("respons tanpa rows ditolak skema", () => {
    expect(arjumHistoryResponseSchema.safeParse({ stock_code: "CONTOH" }).success).toBe(false);
  });
});

describe("validateArjumHistory", () => {
  it("fixture: semua baris valid, terurut naik, rentang tanggal benar", () => {
    const parsed = arjumHistoryResponseSchema.parse(fixture);
    const result = validateArjumHistory(parsed, "CONTOH", TODAY);
    expect(result.issues).toEqual([]);
    expect(result.validRows.map((r) => r.tradingDate)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
    expect(result.firstDate).toBe("2026-09-14");
    expect(result.lastDate).toBe("2026-09-18");
  });

  it("hari tanpa transaksi (volume 0, close terisi) disimpan sebagai hasTransaction=false, bukan data hilang", () => {
    const parsed = arjumHistoryResponseSchema.parse(fixture);
    const noTrade = validateArjumHistory(parsed, "CONTOH", TODAY).validRows.find((r) => r.tradingDate === "2026-09-16")!;
    expect(noTrade.volume).toBe(0);
    expect(noTrade.close).toBe(1035);
    expect(noTrade.hasTransaction).toBe(false);
  });

  it("volume disimpan dalam lembar apa adanya (tidak dikali/dibagi 100)", () => {
    const result = validateArjumHistory(withRows([baseRow]), "CONTOH", TODAY);
    expect(result.validRows[0]!.volume).toBe(2000000);
    expect(result.validRows[0]!.value).toBe(2040000000);
  });

  it.each([
    ["high < low", { high: 980, low: 990 }, "high_below_low"],
    ["close di atas high", { close: 1100 }, "ohlc_out_of_range"],
    ["open di bawah low", { open: 900 }, "ohlc_out_of_range"],
    ["close null", { close: null }, "missing_close"],
    ["harga negatif", { low: -1 }, "negative_value"],
    ["harga 0 dengan volume", { open: 0, high: 0, low: 0, close: 0 }, "zero_price_with_volume"],
    ["volume pecahan", { volume: 1500.5 }, "fractional_volume"],
    ["tanggal masa depan", { date: "2026-10-05" }, "future_date"],
    ["tanggal tidak valid", { date: "2026-02-30" }, "invalid_date"],
  ])("%s dikarantina, bukan diperbaiki", (_label, patch, issueCode) => {
    const result = validateArjumHistory(withRows([{ ...baseRow, ...patch }]), "CONTOH", TODAY);
    expect(result.validRows).toHaveLength(0);
    expect(result.issues.map((i) => i.code)).toContain(issueCode);
  });

  it("tanggal duplikat: baris kedua dikarantina", () => {
    const result = validateArjumHistory(withRows([baseRow, { ...baseRow, close: 1000 }]), "CONTOH", TODAY);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]!.close).toBe(1020);
    expect(result.issues.map((i) => i.code)).toEqual(["duplicate_date"]);
  });

  it("stock_code respons berbeda dari yang diminta: seluruh respons ditolak", () => {
    const result = validateArjumHistory(withRows([baseRow]), "BBCA", TODAY);
    expect(result.validRows).toHaveLength(0);
    expect(result.issues[0]!.code).toBe("stock_code_mismatch");
  });

  it("rows kosong: peringatan, tidak disimpulkan suspensi/delisting", () => {
    const result = validateArjumHistory(withRows([]), "CONTOH", TODAY);
    expect(result.validRows).toHaveLength(0);
    expect(result.issues[0]).toMatchObject({ severity: "warning", code: "empty_history" });
  });

  it("nilai numerik berbentuk string ikut dinormalisasi, string kosong menjadi null (bukan 0)", () => {
    const result = validateArjumHistory(
      withRows([{ ...baseRow, open: "1000", value: "" as unknown as number }]),
      "CONTOH",
      TODAY,
    );
    expect(result.validRows[0]!.open).toBe(1000);
    expect(result.validRows[0]!.value).toBeNull();
  });
});
