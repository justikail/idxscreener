import { fetchIdxRaw } from "./client";
import { extractUnknownKeys, idxStockSummaryResponseSchema, type IdxStockSummaryRow } from "./schema";
import { IdxBlockedError, IdxSchemaError } from "./errors";
import type { DailyBarsFetchResult, DailyBarsProvider, RawDailyBarRow } from "../types";

function coerceNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toRawDailyBarRow(row: IdxStockSummaryRow): RawDailyBarRow {
  const known = new Set([
    "StockCode",
    "StockName",
    "Date",
    "OpenPrice",
    "High",
    "Low",
    "Close",
    "Previous",
    "Volume",
    "Value",
    "Frequency",
  ]);
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!known.has(key)) extra[key] = value;
  }

  return {
    stockCode: row.StockCode,
    stockName: row.StockName ?? null,
    tradingDate: row.Date, // belum dinormalisasi ke YYYY-MM-DD — dilakukan di validate-daily-bars.ts
    open: coerceNumber(row.OpenPrice),
    high: coerceNumber(row.High),
    low: coerceNumber(row.Low),
    close: coerceNumber(row.Close),
    previous: coerceNumber(row.Previous),
    volume: coerceNumber(row.Volume),
    value: coerceNumber(row.Value),
    frequency: coerceNumber(row.Frequency),
    extra,
  };
}

export interface IdxAdapterFetchResult extends DailyBarsFetchResult {
  httpStatus: number;
  contentType: string | null;
  rawBody: unknown; // JSON asli (sebelum normalisasi), disimpan pemanggil ke provider_raw_snapshots
  unknownFieldKeys: string[]; // field yang muncul di respons tapi tidak ada di daftar yang diketahui
}

/**
 * Adapter provider IDX untuk daily bars. HANYA memanggil endpoint yang
 * dilaporkan riset (GetStockSummary?date=YYYYMMDD) — tidak menebak endpoint
 * lain. Tidak melakukan bypass proteksi apa pun; IdxBlockedError dilempar
 * apa adanya ke pemanggil (lihat AGENTS.md §5, §11).
 */
export class IdxDailyBarsProvider implements DailyBarsProvider {
  readonly name = "idx";

  async fetchDailyBars(dateYmd: string): Promise<IdxAdapterFetchResult> {
    const dateParam = dateYmd.replace(/-/g, ""); // YYYY-MM-DD -> YYYYMMDD sesuai temuan riset
    const fetchedAt = new Date();

    let raw: Awaited<ReturnType<typeof fetchIdxRaw>>;
    try {
      raw = await fetchIdxRaw("/primary/TradingSummary/GetStockSummary", { date: dateParam });
    } catch (error) {
      if (error instanceof IdxBlockedError) throw error;
      throw error;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw.bodyText);
    } catch {
      // HTTP 200 dengan content-type JSON tapi body bukan JSON valid — bukan
      // pola yang dilaporkan riset, diperlakukan sebagai schema error, bukan
      // diam-diam dianggap array kosong.
      throw new IdxSchemaError("Body diklaim JSON tapi gagal di-parse.", raw.bodyText.slice(0, 500));
    }

    const result = idxStockSummaryResponseSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new IdxSchemaError("Bentuk respons GetStockSummary tidak sesuai schema yang diketahui.", result.error.issues);
    }

    const rows = result.data;
    const unknownFieldKeys = [...new Set(rows.flatMap((r) => extractUnknownKeys(r)))];

    return {
      requestedDate: dateYmd,
      rows: rows.map(toRawDailyBarRow),
      fetchedAt,
      isEmpty: rows.length === 0,
      httpStatus: raw.httpStatus,
      contentType: raw.contentType,
      rawBody: parsedJson,
      unknownFieldKeys,
    };
  }
}
