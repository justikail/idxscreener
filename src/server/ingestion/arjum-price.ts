import type { ArjumPriceListEntry, ArjumPriceResponse } from "@/server/providers/arjum/schemas";
import { coerceNumber } from "@/server/providers/arjum/schemas";

/**
 * /api/price → baris cache `latest_quotes`. Tidak pernah dijadikan candle.
 *
 * Fallback penutupan: penyedia mengisi last_price dengan penutupan sesi
 * sebelumnya ketika belum ada transaksi (probe 4 Okt: no_trade_today=true,
 * market_state=weekend, source_date=2026-10-02). Kondisi itu ditandai
 * `isFallbackClose` dan UI menyebutnya "penutupan <source_date>", bukan harga
 * hari ini. quote_age_ms adalah usia transaksi terakhir, bukan latensi feed.
 */
export interface NormalizedQuote {
  lastPrice: number | null;
  freq: number | null;
  lot: number | null;
  value: number | null;
  sourceDate: string | null;
  dataTs: string | null;
  servedTs: string | null;
  marketState: string | null;
  marketLabel: string | null;
  noTradeToday: boolean | null;
  quoteAgeMs: number | null;
  isFallbackClose: boolean;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeQuote(response: ArjumPriceResponse, code: string, todayWib: string): { quote: NormalizedQuote | null; issue: string | null } {
  if (response.code && response.code.toUpperCase() !== code.toUpperCase()) {
    return { quote: null, issue: `code "${response.code}" ≠ ${code}; respons ditolak.` };
  }
  const lastPrice = coerceNumber(response.last_price);
  if (lastPrice !== null && lastPrice <= 0) return { quote: null, issue: `last_price ${lastPrice} tidak valid; respons ditolak.` };
  const sourceDate = typeof response.source_date === "string" && ISO.test(response.source_date) ? response.source_date : null;
  const noTradeToday = typeof response.no_trade_today === "boolean" ? response.no_trade_today : null;
  const ts = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, 64) : null);
  const quoteAge = coerceNumber(response.quote_age_ms);
  return {
    quote: {
      lastPrice,
      freq: coerceNumber(response.freq),
      lot: coerceNumber(response.lot),
      value: coerceNumber(response.value),
      sourceDate,
      dataTs: ts(response.data_ts),
      servedTs: ts(response.served_ts),
      marketState: typeof response.market_state === "string" ? response.market_state.slice(0, 32) : null,
      marketLabel: typeof response.market_label === "string" ? response.market_label.slice(0, 128) : null,
      noTradeToday,
      quoteAgeMs: quoteAge !== null && quoteAge >= 0 ? Math.round(quoteAge) : null,
      // Fallback bila penyedia menyatakan tidak ada transaksi hari ini, atau
      // tanggal sumber bukan hari ini (WIB). Tanpa source_date: dianggap fallback (tidak terbukti hari ini).
      isFallbackClose: noTradeToday === true || sourceDate === null || sourceDate < todayWib,
    },
    issue: null,
  };
}

export interface NormalizedListQuote extends NormalizedQuote {
  /** Perubahan dalam rupiah menurut penyedia. */
  change: number | null;
  /** Penutupan acuan = last_price − change (null bila tidak masuk akal). */
  prevClose: number | null;
  /** Dihitung sendiri dari last_price dan prevClose, bukan diambil dari change_pct penyedia. */
  changePct: number | null;
  vwap: number | null;
}

/**
 * Satu entri /api/price/list → baris `latest_quotes`.
 *
 * - Ada source_date → harga itu milik tanggal tersebut; fallback bila < hari ini (WIB).
 * - Tanpa source_date tetapi ada data_ts (jam transaksi, TANPA tanggal) →
 *   transaksi hari ini; tanggalnya diambil dari waktu fetch (WIB).
 * - Keduanya kosong → tidak terbukti hari ini → fallback.
 * - change_pct penyedia hanya dibandingkan, tidak dipakai: contoh dokumentasi
 *   memuat change 0 dengan change_pct 0,93 (tidak konsisten).
 */
export function normalizeListQuote(
  entry: ArjumPriceListEntry,
  code: string,
  todayWib: string,
  market: { status?: string | null; label?: string | null } | null | undefined,
): { quote: NormalizedListQuote | null; issue: string | null } {
  if (entry.code && entry.code.toUpperCase() !== code.toUpperCase()) {
    return { quote: null, issue: `code "${entry.code}" ≠ ${code}; entri ditolak.` };
  }
  const lastPrice = coerceNumber(entry.last_price);
  if (lastPrice === null || lastPrice <= 0) return { quote: null, issue: `last_price ${lastPrice ?? "kosong"} tidak valid; entri ditolak.` };
  const rawSourceDate = typeof entry.source_date === "string" && ISO.test(entry.source_date) ? entry.source_date : null;
  const dataTs = typeof entry.data_ts === "string" || typeof entry.data_ts === "number" ? String(entry.data_ts).slice(0, 64) : null;
  const isFallbackClose = rawSourceDate !== null ? rawSourceDate < todayWib : dataTs === null;
  const sourceDate = rawSourceDate ?? (dataTs !== null ? todayWib : null);

  const change = coerceNumber(entry.change);
  const prev = change !== null ? lastPrice - change : null;
  const prevClose = prev !== null && prev > 0 ? prev : null;
  const changePct = prevClose !== null ? lastPrice / prevClose - 1 : null;
  const providerPct = coerceNumber(entry.change_pct);
  const issue =
    changePct !== null && providerPct !== null && Math.abs(providerPct - changePct * 100) > 0.05
      ? `change_pct penyedia ${providerPct} ≠ hitungan ${(changePct * 100).toFixed(2)} (dari change ${change}); dipakai hitungan sendiri.`
      : prev !== null && prevClose === null
        ? `change ${change} menghasilkan penutupan acuan ≤ 0; perubahan tidak disimpan.`
        : null;

  const quoteAge = coerceNumber(entry.quote_age_ms);
  const vwap = coerceNumber(entry.vwap);
  return {
    quote: {
      lastPrice,
      freq: coerceNumber(entry.freq),
      lot: coerceNumber(entry.lot),
      value: coerceNumber(entry.value),
      sourceDate,
      dataTs,
      servedTs: typeof entry.served_ts === "string" || typeof entry.served_ts === "number" ? String(entry.served_ts).slice(0, 64) : null,
      marketState: typeof market?.status === "string" ? market.status.slice(0, 32) : null,
      marketLabel: typeof market?.label === "string" ? market.label.slice(0, 128) : null,
      noTradeToday: typeof entry.no_trade_today === "boolean" ? entry.no_trade_today : null,
      quoteAgeMs: quoteAge !== null && quoteAge >= 0 ? Math.round(quoteAge) : null,
      isFallbackClose,
      change: prevClose !== null ? change : null,
      prevClose,
      changePct,
      vwap: vwap !== null && vwap > 0 ? vwap : null,
    },
    issue,
  };
}
