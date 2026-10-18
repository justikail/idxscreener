import { z } from "zod";

// Skema berdasarkan TEMUAN RISET (laporan extension browser, lihat
// docs/data-sources.md), BUKAN dokumentasi API resmi BEI — field bisa berubah
// tanpa pemberitahuan. Nama field persis seperti dilaporkan (32 nama field
// terdaftar meski laporan sumber menyebut "30 field" — diskrepansi ini
// TIDAK didiamkan, dicatat di docs/data-sources.md).
//
// Hanya StockCode dan Date yang WAJIB ada (dipakai sebagai kunci utama baris).
// Field lain nullable karena laporan tidak menjamin semua field selalu terisi.
// Nilai numerik bisa datang sebagai number ATAU string dari serializer ASP.NET
// — makanya numericLike, bukan z.number() langsung.

const numericLike = z.union([z.number(), z.string(), z.null()]).optional();
const stringLike = z.union([z.string(), z.null()]).optional();

export const idxStockSummaryRowSchema = z
  .object({
    No: numericLike,
    IDStockSummary: numericLike,
    Date: z.string(), // wajib — dipakai validasi tanggal dataset (AGENTS.md §6)
    StockCode: z.string().min(1), // wajib — kunci baris
    StockName: stringLike,
    // Opaque: notasi/status papan, kamus resmi belum ditemukan (lihat
    // docs/data-sources.md). TIDAK diinterpretasikan jadi status apa pun.
    Remarks: stringLike,
    Previous: numericLike,
    OpenPrice: numericLike,
    FirstTrade: numericLike,
    High: numericLike,
    Low: numericLike,
    Close: numericLike,
    Change: numericLike,
    Volume: numericLike,
    Value: numericLike,
    Frequency: numericLike,
    IndexIndividual: numericLike,
    Offer: numericLike,
    OfferVolume: numericLike,
    Bid: numericLike,
    BidVolume: numericLike,
    ListedShares: numericLike,
    // BUKAN free float resmi — proksi berlabel saja (lihat docs/methodology.md
    // dan temuan riset). Disimpan raw, tidak dipakai kalkulasi apa pun di M3.
    TradebleShares: numericLike,
    WeightForIndex: numericLike,
    // Unit tidak terkonfirmasi (rupiah? lembar?) — disimpan raw, TIDAK
    // diasumsikan rupiah (AGENTS.md §5).
    ForeignSell: numericLike,
    ForeignBuy: numericLike,
    DelistingDate: stringLike,
    NonRegularVolume: numericLike,
    NonRegularValue: numericLike,
    NonRegularFrequency: numericLike,
    persen: numericLike,
    percentage: numericLike,
  })
  .passthrough(); // field tak dikenal ikut lewat, ditangkap sebagai extra saat normalisasi — bukan divalidasi ketat, bukan dijadikan metrik diam-diam.

export type IdxStockSummaryRow = z.infer<typeof idxStockSummaryRowSchema>;

/** Respons GetStockSummary: array datar (BUKAN {data:[...]}), tanpa amplop pagination. */
export const idxStockSummaryResponseSchema = z.array(idxStockSummaryRowSchema);

const KNOWN_KEYS = new Set([
  "No",
  "IDStockSummary",
  "Date",
  "StockCode",
  "StockName",
  "Remarks",
  "Previous",
  "OpenPrice",
  "FirstTrade",
  "High",
  "Low",
  "Close",
  "Change",
  "Volume",
  "Value",
  "Frequency",
  "IndexIndividual",
  "Offer",
  "OfferVolume",
  "Bid",
  "BidVolume",
  "ListedShares",
  "TradebleShares",
  "WeightForIndex",
  "ForeignSell",
  "ForeignBuy",
  "DelistingDate",
  "NonRegularVolume",
  "NonRegularValue",
  "NonRegularFrequency",
  "persen",
  "percentage",
]);

/** Field di luar daftar yang diketahui — dicatat sebagai data_quality_issue, bukan diam-diam diabaikan. */
export function extractUnknownKeys(row: Record<string, unknown>): string[] {
  return Object.keys(row).filter((k) => !KNOWN_KEYS.has(k));
}
