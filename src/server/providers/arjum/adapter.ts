import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "@/server/db/schema";
import { recordProviderQuota, reserveQuota } from "@/server/quota/budget";
import { arjumGet, type ArjumAttemptLog, type ArjumClientOptions, type ArjumKeySource, type ArjumResponse } from "./client";
import { ARJUM_PROVIDER, assertStockCode } from "./config";
import { ArjumSchemaError } from "./errors";
import {
  arjumBrokerAccumulationResponseSchema,
  arjumBrokerSummaryResponseSchema,
  arjumFinancialStatementsResponseSchema,
  arjumHealthResponseSchema,
  arjumHistoryResponseSchema,
  arjumInsidersResponseSchema,
  arjumMarketCapResponseSchema,
  arjumPriceListResponseSchema,
  arjumPriceResponseSchema,
  arjumSeasonalResponseSchema,
} from "./schemas";

/**
 * Kapabilitas yang dipakai aplikasi. "ingest" = dipakai job ingestion;
 * "probe" = hanya dipanggil probe read-only untuk validasi, belum disimpan.
 */
export const ARJUM_CAPABILITIES = {
  dailyBars: "ingest",
  marketCap: "ingest",
  financialStatements: "ingest",
  brokerSummary: "ingest",
  brokerAccumulation: "ingest",
  insiders: "ingest",
  seasonal: "ingest",
  price: "ingest",
  priceList: "ingest",
  health: "ingest",
} as const;

export type FinancialReportType = "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW_REPORT";
export type FinancialPeriod = "quarterly" | "annually";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function assertIsoDate(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (!ISO_DATE.test(value)) throw new Error(`${name} harus YYYY-MM-DD, diberikan "${value}".`);
  return value;
}

export interface Parsed<T> {
  data: T;
  response: ArjumResponse;
}

function parseWith<T>(schemaDef: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown } } }, response: ArjumResponse, label: string): Parsed<T> {
  const result = schemaDef.safeParse(response.body);
  if (!result.success) throw new ArjumSchemaError(`Respons ${label} tidak sesuai skema yang diharapkan.`, result.error.issues);
  return { data: result.data, response };
}

function clampInt(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} harus bilangan bulat ${min}–${max} (dokumentasi Arjum), diberikan ${value}.`);
  }
  return value;
}

export class ArjumProvider {
  readonly name = ARJUM_PROVIDER;

  constructor(private readonly options: ArjumClientOptions) {}

  /** GET /api/history/{code} — limit 20–500 (default dokumentasi 120), frame daily/weekly/monthly. */
  async history(code: string, opts: { limit?: number; frame?: "daily" | "weekly" | "monthly" } = {}) {
    const c = assertStockCode(code);
    const limit = clampInt(opts.limit ?? 120, 20, 500, "limit");
    const res = await arjumGet(this.options, `/api/history/${c}`, { limit, frame: opts.frame ?? "daily" });
    return parseWith(arjumHistoryResponseSchema, res, "history");
  }

  /** GET /api/market-cap — per_page maks 50; codes maks 50 (mengabaikan pagination). */
  async marketCap(opts: { page?: number; perPage?: number; date?: string; codes?: string[] } = {}) {
    const params: Record<string, string | number | undefined> = {
      page: clampInt(opts.page ?? 1, 1, 10_000, "page"),
      per_page: clampInt(opts.perPage ?? 50, 1, 50, "per_page"),
      date: opts.date,
    };
    if (opts.codes && opts.codes.length > 0) {
      if (opts.codes.length > 50) throw new Error("codes maksimal 50 per request.");
      params.codes = opts.codes.map(assertStockCode).join(",");
    }
    const res = await arjumGet(this.options, "/api/market-cap", params);
    return parseWith(arjumMarketCapResponseSchema, res, "market-cap");
  }

  /** GET /api/financial-statements/{code} — report_type, period, limit maks 40, year opsional (AGENTS.md §4). */
  async financialStatements(
    code: string,
    opts: { reportType: FinancialReportType; period: FinancialPeriod; limit?: number; year?: number },
  ) {
    const c = assertStockCode(code);
    const res = await arjumGet(this.options, `/api/financial-statements/${c}`, {
      report_type: opts.reportType,
      period: opts.period,
      limit: clampInt(opts.limit ?? 4, 1, 40, "limit"),
      year: opts.year !== undefined ? clampInt(opts.year, 2000, 2100, "year") : undefined,
    });
    return parseWith(arjumFinancialStatementsResponseSchema, res, "financial-statements");
  }

  /**
   * GET /api/broker-summary/{code}. start_date/end_date teruji audit 5 Okt.
   * `brokerLimit`/`allData` dikirim hanya bila diminta; maknanya diverifikasi
   * lewat jumlah broker yang kembali, bukan diasumsikan (lihat arjum-broker.ts).
   */
  async brokerSummary(code: string, opts: { startDate?: string; endDate?: string; brokerLimit?: number; allData?: boolean } = {}) {
    const c = assertStockCode(code);
    const res = await arjumGet(this.options, `/api/broker-summary/${c}`, {
      start_date: assertIsoDate(opts.startDate, "start_date"),
      end_date: assertIsoDate(opts.endDate, "end_date"),
      broker_limit: opts.brokerLimit !== undefined ? clampInt(opts.brokerLimit, 1, 500, "broker_limit") : undefined,
      all_data: opts.allData ? "true" : undefined,
    });
    return parseWith(arjumBrokerSummaryResponseSchema, res, "broker-summary");
  }

  /** GET /api/broker-accumulation/{code} — start_date, end_date, top (AGENTS.md §4). */
  async brokerAccumulation(code: string, opts: { startDate?: string; endDate?: string; top?: number } = {}) {
    const c = assertStockCode(code);
    const res = await arjumGet(this.options, `/api/broker-accumulation/${c}`, {
      start_date: assertIsoDate(opts.startDate, "start_date"),
      end_date: assertIsoDate(opts.endDate, "end_date"),
      top: opts.top !== undefined ? clampInt(opts.top, 1, 50, "top") : undefined,
    });
    return parseWith(arjumBrokerAccumulationResponseSchema, res, "broker-accumulation");
  }

  /** GET /api/insiders/{code} — page (10 baris/halaman teramati), action_type opsional. */
  async insiders(code: string, opts: { page?: number; actionType?: string } = {}) {
    const c = assertStockCode(code);
    if (opts.actionType !== undefined && !/^[A-Za-z_]{1,32}$/.test(opts.actionType)) throw new Error("action_type tidak valid.");
    const res = await arjumGet(this.options, `/api/insiders/${c}`, {
      page: clampInt(opts.page ?? 1, 1, 1000, "page"),
      action_type: opts.actionType,
    });
    return parseWith(arjumInsidersResponseSchema, res, "insiders");
  }

  /** GET /api/seasonal/{code} — statistik bulanan olahan penyedia. */
  async seasonal(code: string) {
    const c = assertStockCode(code);
    const res = await arjumGet(this.options, `/api/seasonal/${c}`);
    return parseWith(arjumSeasonalResponseSchema, res, "seasonal");
  }

  /** GET /api/health — hanya bukti API dapat dihubungi. */
  async health() {
    const res = await arjumGet(this.options, "/api/health");
    return parseWith(arjumHealthResponseSchema, res, "health");
  }

  async price(code: string) {
    const c = assertStockCode(code);
    const res = await arjumGet(this.options, `/api/price/${c}`);
    return parseWith(arjumPriceResponseSchema, res, "price");
  }

  /**
   * GET /api/price/list?codes=… — harga terakhir banyak kode dalam SATU
   * request. Biaya: 1 kuota per kode, TERMASUK kode tidak dikenal yang
   * dilewati penyedia (probe 18 Okt 2026: 3 kode, 1 fiktif → X-Quota-Cost 3).
   * Jadi kuota direservasi sebanyak jumlah kode, dan pemanggil hanya mengirim
   * kode yang ada di database. Batch besar tidak di-retry otomatis: satu
   * percobaan ulang bisa memotong ratusan kuota lagi.
   */
  async priceList(codes: string[]) {
    const list = [...new Set(codes.map(assertStockCode))];
    if (list.length === 0) throw new Error("priceList: daftar kode kosong.");
    if (list.length > PRICE_LIST_MAX_CODES) throw new Error(`priceList: maksimum ${PRICE_LIST_MAX_CODES} kode per request (diberikan ${list.length}).`);
    const res = await arjumGet(this.options, "/api/price/list", { codes: list.join(",") }, { cost: list.length, maxAttempts: list.length > 50 ? 1 : 2 });
    const parsed = parseWith(arjumPriceListResponseSchema, res, "price-list");
    const header = Number(res.responseHeaders["x-quota-cost"]);
    return { ...parsed, requested: list, quotaCost: Number.isFinite(header) ? header : null };
  }
}

/** Batas dokumentasi Arjum untuk /api/price/list. */
export const PRICE_LIST_MAX_CODES = 1000;

/** Menyambungkan client ke reservasi kuota bersama di DB. */
export function createArjumProvider(
  db: PostgresJsDatabase<typeof schema>,
  opts: { apiKey: ArjumKeySource; dailyLimit: number; onAttempt?: (log: ArjumAttemptLog) => void; maxAttempts?: number },
): ArjumProvider {
  return new ArjumProvider({
    apiKey: opts.apiKey,
    maxAttempts: opts.maxAttempts,
    onAttempt: opts.onAttempt,
    reserve: async (cost) => {
      await reserveQuota(db, ARJUM_PROVIDER, opts.dailyLimit, cost);
    },
    onHeaders: (headers) => recordProviderQuota(db, ARJUM_PROVIDER, headers, opts.dailyLimit),
  });
}
