import { z } from "zod";

// Skema berdasarkan pengamatan respons nyata di browser (audit-dashboard-
// invezgo-arjum.md §C.2, 18–20 Sep 2026) dan tabel parameter dokumentasi
// Arjum (AGENTS.md §4) — BUKAN kontrak resmi. Semua objek memakai
// .passthrough(): field tambahan ikut tersimpan di raw snapshot, tetapi tidak
// pernah otomatis menjadi metrik. Field yang WAJIB hanya yang dipakai sebagai
// kunci/nilai inti; sisanya nullable karena belum terbukti selalu terisi.

const numericLike = z.union([z.number(), z.string(), z.null()]).optional();

export const arjumHistoryRowSchema = z
  .object({
    date: z.string(), // YYYY-MM-DD menurut audit
    open: numericLike,
    high: numericLike,
    low: numericLike,
    close: numericLike,
    change: numericLike,
    change_pct: numericLike,
    value: numericLike, // Rupiah (audit D.1)
    volume: numericLike, // LEMBAR, bukan lot (audit D.1)
    freq: numericLike,
    avg: numericLike, // null pada hari tanpa transaksi (audit C.2)
    // Foreign flow: n_foreign dicatat lembar oleh audit; f_buy/f_sell satuannya
    // belum dikonfirmasi. Disimpan mentah, tidak dipakai kalkulasi.
    f_buy: numericLike,
    f_sell: numericLike,
    n_foreign: numericLike,
  })
  .passthrough();

export const arjumHistoryResponseSchema = z
  .object({
    stock_code: z.string().min(1),
    frame: z.string().optional(),
    rows: z.array(arjumHistoryRowSchema),
  })
  .passthrough();

export const arjumMarketCapRowSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().nullable().optional(),
    close: numericLike,
    listed_shares: numericLike,
    market_cap: numericLike,
    turnover_ratio: numericLike,
  })
  .passthrough();

export const arjumMarketCapResponseSchema = z
  .object({
    date: z.string().nullable().optional(),
    total: numericLike,
    page: numericLike,
    per_page: numericLike,
    total_pages: numericLike,
    data: z.array(arjumMarketCapRowSchema),
  })
  .passthrough();

export const arjumFinancialStatementsResponseSchema = z
  .object({
    stock_code: z.string().min(1),
    report_type: z.string().optional(),
    period: z.string().optional(),
    count: numericLike,
    items: z.array(
      z
        .object({
          year: numericLike,
          quarter: numericLike,
          label: z.string().nullable().optional(),
          fetched_at: z.string().nullable().optional(),
          data: z.record(z.unknown()).nullable().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

// Field broker teramati pada probe 4 Okt 2026 (docs/probes). Satuan bvol/svol
// diverifikasi per respons terhadap volume harian (arjum-broker.ts), bukan diasumsikan.
export const arjumBrokerRowSchema = z
  .object({
    broker_code: z.string().min(1),
    broker_name: z.string().nullable().optional(),
    bval: numericLike,
    bvol: numericLike,
    bfrq: numericLike,
    sval: numericLike,
    svol: numericLike,
    sfrq: numericLike,
    nval: numericLike,
    nvol: numericLike,
  })
  .passthrough();

export const arjumBrokerSummaryResponseSchema = z
  .object({
    stock_code: z.string().min(1),
    brokers: z.array(arjumBrokerRowSchema),
    broker_start_date: z.string().nullable().optional(),
    broker_end_date: z.string().nullable().optional(),
    broker_date_min: z.string().nullable().optional(),
    broker_date_max: z.string().nullable().optional(),
    broker_net: z.boolean().nullable().optional(),
    flow: z.string().nullable().optional(),
  })
  .passthrough();

// Bentuk di bawah berasal dari key tingkat atas yang tercatat audit 5 Okt
// (docs/arjum-endpoint-inventory.csv); isi detail divalidasi oleh normalizer
// masing-masing dan ditolak bila tidak sesuai, bukan ditebak.
export const arjumBrokerAccumulationResponseSchema = z
  .object({
    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),
    top_buyers: z.unknown().optional(),
    top_sellers: z.unknown().optional(),
    series: z.unknown(),
  })
  .passthrough();

export const arjumInsidersResponseSchema = z
  .object({
    total: numericLike,
    total_pages: numericLike,
    page: numericLike,
    page_size: numericLike,
    count: numericLike,
  })
  .passthrough();

export const arjumSeasonalResponseSchema = z
  .object({
    years: z.unknown().optional(),
    monthly_returns: z.unknown(),
    yearly_avg: z.unknown().optional(),
    summary: z.unknown().optional(),
  })
  .passthrough();

export const arjumHealthResponseSchema = z
  .object({
    ok: z.unknown().optional(),
    status: z.unknown().optional(),
  })
  .passthrough();

/** /api/price/{code}: bentuk teramati pada probe 4 Okt 2026 (docs/probes). */
export const arjumPriceResponseSchema = z
  .object({
    code: z.string().nullable().optional(),
    last_price: numericLike,
    freq: numericLike,
    lot: numericLike,
    value: numericLike,
    data_ts: z.union([z.string(), z.number(), z.null()]).optional(),
    served_ts: z.union([z.string(), z.number(), z.null()]).optional(),
    source_date: z.string().nullable().optional(),
    no_trade_today: z.boolean().nullable().optional(),
    market_state: z.string().nullable().optional(),
    market_label: z.string().nullable().optional(),
    quote_age_ms: numericLike,
  })
  .passthrough();

/**
 * /api/price/list. Entri per kode memakai bentuk /api/price ditambah change
 * (rupiah), change_pct, vwap; `market` dikirim sekali di level respons.
 */
export const arjumPriceListEntrySchema = arjumPriceResponseSchema.extend({
  change: numericLike,
  change_pct: numericLike,
  vwap: numericLike,
});

export const arjumPriceListResponseSchema = z
  .object({
    count: numericLike,
    stocks: z.record(z.string(), arjumPriceListEntrySchema),
    market: z
      .object({ status: z.string().nullable().optional(), label: z.string().nullable().optional(), next_open: z.string().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type ArjumPriceListResponse = z.infer<typeof arjumPriceListResponseSchema>;
export type ArjumPriceListEntry = z.infer<typeof arjumPriceListEntrySchema>;

export type ArjumHistoryResponse = z.infer<typeof arjumHistoryResponseSchema>;
export type ArjumHistoryRow = z.infer<typeof arjumHistoryRowSchema>;
export type ArjumMarketCapResponse = z.infer<typeof arjumMarketCapResponseSchema>;
export type ArjumFinancialStatementsResponse = z.infer<typeof arjumFinancialStatementsResponseSchema>;
export type ArjumBrokerSummaryResponse = z.infer<typeof arjumBrokerSummaryResponseSchema>;
export type ArjumPriceResponse = z.infer<typeof arjumPriceResponseSchema>;

export function coerceNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Ringkasan struktur respons untuk log probe: nama key + tipe, tanpa nilai. */
export function describeShape(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.length > 0 && depth < 3 ? [describeShape(value[0], depth + 1)] : [];
  if (value !== null && typeof value === "object") {
    if (depth >= 3) return "{…}";
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, describeShape(v, depth + 1)]));
  }
  return value === null ? "null" : typeof value;
}
