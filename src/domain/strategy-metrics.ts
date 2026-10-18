import { sma } from "./indicators";
import { ttmFromQuarters, type MetricStatus } from "./fundamentals";

/**
 * Metrik tambahan untuk strategi Rekomendasi (formula_version 3). Semua dari
 * data harian tersimpan — tidak ada data intraday. Nilai yang datanya kurang
 * menjadi null (tidak pernah 0). Rumus didokumentasikan di docs/methodology.md.
 */

export interface PriceBar {
  close: number;
  high: number | null;
  low: number | null;
  value: number | null;
}

export interface PriceMetrics {
  /** Perubahan sesi terakhir terhadap penutupan sebelumnya (pecahan, 0,02 = 2%). */
  change1d: number | null;
  return5d: number | null;
  return20d: number | null;
  /** Posisi penutupan di rentang hari itu: 0 = di harga terendah, 1 = di tertinggi. */
  closePosition: number | null;
  /** Rata-rata nilai transaksi 20 sesi (Rupiah). Butuh 20 sesi bernilai. */
  valueAvg20: number | null;
  closeVsSma20: number | null;
  closeVsSma50: number | null;
  sma20VsSma50: number | null;
  /** Posisi penutupan di rentang tertinggi–terendah 250 sesi (0..1). Butuh ≥ 120 sesi. */
  rangePosition52w: number | null;
}

const ret = (closes: number[], n: number) => {
  const last = closes.at(-1);
  const base = closes.at(-1 - n);
  return last !== undefined && base !== undefined && base > 0 ? last / base - 1 : null;
};

export function priceMetrics(bars: readonly PriceBar[]): PriceMetrics {
  const closes = bars.map((b) => b.close);
  const last = bars.at(-1);
  const i = closes.length - 1;
  const s20 = sma(closes, 20)[i] ?? null;
  const s50 = sma(closes, 50)[i] ?? null;
  const vals = bars.slice(-20).map((b) => b.value);
  const valueAvg20 = vals.length === 20 && vals.every((v): v is number => v !== null) ? vals.reduce((a, b) => a + b, 0) / 20 : null;
  const range =
    last && last.high !== null && last.low !== null && last.high >= last.low && last.high > 0 ? (last.high === last.low ? null : (last.close - last.low) / (last.high - last.low)) : null;
  const year = bars.slice(-250);
  let rangePosition52w: number | null = null;
  if (year.length >= 120 && last) {
    const hi = Math.max(...year.map((b) => b.high ?? b.close));
    const lo = Math.min(...year.map((b) => b.low ?? b.close));
    rangePosition52w = hi > lo ? (last.close - lo) / (hi - lo) : null;
  }
  return {
    change1d: ret(closes, 1),
    return5d: ret(closes, 5),
    return20d: ret(closes, 20),
    closePosition: range === null ? null : Math.min(Math.max(range, 0), 1),
    valueAvg20,
    closeVsSma20: last && s20 ? last.close / s20 - 1 : null,
    closeVsSma50: last && s50 ? last.close / s50 - 1 : null,
    sma20VsSma50: s20 && s50 ? s20 / s50 - 1 : null,
    rangePosition52w,
  };
}

export interface QuarterValue {
  fiscalYear: number;
  fiscalQuarter: number;
  value: number | null;
}

/**
 * Pertumbuhan TTM tahunan: (TTM 4 kuartal terakhir ÷ TTM 4 kuartal sebelumnya) − 1.
 * Butuh 8 kuartal mandiri berurutan. TTM sebelumnya ≤ 0 → tidak bermakna
 * (pertumbuhan dari rugi tidak bisa dinyatakan sebagai persen).
 */
export function ttmGrowth(quarters: readonly QuarterValue[]): { value: number | null; status: MetricStatus } {
  const sorted = [...quarters].sort((a, b) => a.fiscalYear - b.fiscalYear || a.fiscalQuarter - b.fiscalQuarter);
  if (sorted.length < 8) return { value: null, status: "null_missing" };
  const last8 = sorted.slice(-8);
  const prior = last8.slice(0, 4);
  const recent = last8.slice(4);
  const a = ttmFromQuarters(prior);
  const b = ttmFromQuarters(recent);
  const pLast = prior.at(-1)!;
  const rFirst = recent[0]!;
  const contiguous = (pLast.fiscalQuarter === 4 ? rFirst.fiscalYear === pLast.fiscalYear + 1 && rFirst.fiscalQuarter === 1 : rFirst.fiscalYear === pLast.fiscalYear && rFirst.fiscalQuarter === pLast.fiscalQuarter + 1);
  if (a === null || b === null || !contiguous) return { value: null, status: "null_missing" };
  if (a <= 0) return { value: null, status: "not_applicable" };
  return { value: b / a - 1, status: "ok" };
}

/**
 * Konsentrasi beli broker (bandarmologi): jumlah net beli 3 broker pembeli
 * bersih terbesar ÷ nilai transaksi sesi yang sama. Contoh 0,08 = tiga broker
 * teratas membeli bersih senilai 8% dari seluruh transaksi hari itu.
 * Ini ukuran konsentrasi aktivitas broker, BUKAN identitas pemilik dana.
 */
export function brokerTop3NetRatio(netValues: readonly (number | null)[], sessionValue: number | null): number | null {
  if (sessionValue === null || sessionValue <= 0) return null;
  const buys = netValues.filter((v): v is number => v !== null && v > 0).sort((x, y) => y - x);
  if (buys.length === 0) return 0;
  return buys.slice(0, 3).reduce((a, b) => a + b, 0) / sessionValue;
}
