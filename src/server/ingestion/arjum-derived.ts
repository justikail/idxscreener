/**
 * Hasil OLAHAN penyedia: /api/broker-accumulation dan /api/seasonal.
 * Divalidasi dan dipangkas ke field yang maknanya terverifikasi; disimpan di
 * provider_derived_snapshots dan selalu dilabeli "olahan Pihak Ketiga".
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export interface AccumulationPoint {
  date: string;
  nval: number;
  nvol: number | null;
  cum: number;
}

export interface AccumulationSeries {
  brokerCode: string;
  brokerName: string | null;
  points: AccumulationPoint[];
}

export interface AccumulationPayload {
  startDate: string;
  endDate: string;
  top: number | null;
  series: AccumulationSeries[];
  topBuyers: Array<{ brokerCode: string; total: number }>;
  topSellers: Array<{ brokerCode: string; total: number }>;
  checks: { cumulativeConsistent: boolean; baselineZero: boolean };
}

/**
 * Bentuk teramati (probe 6 Okt 2026): {code, start_date, end_date, series:[{
 * broker_code, broker_name, points:[{date, nval, nvol, cum_nval, bavg, savg}]}],
 * top_buyers/top_sellers:[{broker_code, broker_name, total_nval}]}. Default
 * ±80 sesi, top 3 pembeli + 3 penjual; `top` mengubah jumlah per sisi.
 * Validasi: cum_nval = penjumlahan berjalan nval sejak start_date (baseline 0).
 */
export function normalizeAccumulation(body: Record<string, unknown>, code: string, top: number | null): { payload: AccumulationPayload | null; issues: string[] } {
  const issues: string[] = [];
  if (typeof body.code === "string" && body.code.toUpperCase() !== code.toUpperCase()) return { payload: null, issues: [`code "${body.code}" ≠ ${code}; ditolak.`] };
  const start = typeof body.start_date === "string" && ISO.test(body.start_date) ? body.start_date : null;
  const end = typeof body.end_date === "string" && ISO.test(body.end_date) ? body.end_date : null;
  if (!start || !end || !Array.isArray(body.series)) return { payload: null, issues: ["Rentang/series tidak valid; ditolak."] };
  let cumulativeConsistent = true;
  let baselineZero = true;
  const series: AccumulationSeries[] = [];
  for (const s of body.series as Array<Record<string, unknown>>) {
    const brokerCode = typeof s.broker_code === "string" ? s.broker_code.toUpperCase() : "";
    if (!/^[A-Z0-9]{1,8}$/.test(brokerCode) || !Array.isArray(s.points)) continue;
    const points: AccumulationPoint[] = [];
    let running = 0;
    for (const p of s.points as Array<Record<string, unknown>>) {
      const date = typeof p.date === "string" && ISO.test(p.date) ? p.date : null;
      const nval = num(p.nval);
      const cum = num(p.cum_nval);
      if (!date || nval === null || cum === null || date < start || date > end) {
        issues.push(`[${brokerCode}] titik tidak valid dilewati.`);
        continue;
      }
      running += nval;
      if (points.length === 0 && Math.abs(cum - nval) > 1) baselineZero = false;
      if (Math.abs(cum - running) > Math.max(1, Math.abs(running) * 1e-9)) cumulativeConsistent = false;
      points.push({ date, nval, nvol: num(p.nvol), cum });
    }
    series.push({ brokerCode, brokerName: typeof s.broker_name === "string" ? s.broker_name.slice(0, 256) : null, points });
  }
  const totals = (v: unknown) =>
    Array.isArray(v)
      ? (v as Array<Record<string, unknown>>)
          .map((x) => ({ brokerCode: typeof x.broker_code === "string" ? x.broker_code.toUpperCase() : "", total: num(x.total_nval) }))
          .filter((x): x is { brokerCode: string; total: number } => /^[A-Z0-9]{1,8}$/.test(x.brokerCode) && x.total !== null)
      : [];
  if (!cumulativeConsistent) issues.push("cum_nval tidak sama dengan penjumlahan berjalan nval; grafik tidak ditampilkan.");
  return { payload: { startDate: start, endDate: end, top, series, topBuyers: totals(body.top_buyers), topSellers: totals(body.top_sellers), checks: { cumulativeConsistent, baselineZero } }, issues };
}

export interface SeasonalPayload {
  years: string[];
  /** bulan (1–12) → tahun → return % menurut penyedia. */
  monthly: Record<string, Record<string, number>>;
  /** bulan → {up, down, total} apa adanya (tanpa up_prob). */
  counts: Record<string, { up: number | null; down: number | null; total: number | null }>;
}

const MONTH_KEYS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Bentuk teramati: {stock_code, years[], monthly_returns:{Jan:{2020:-3.14…}},
 * summary:{Jan:{avg, up, down, total, up_prob}}, yearly_avg}. Return dalam
 * persen. Metode penyedia TIDAK diketahui: tidak sama dengan penutupan akhir
 * bulan ÷ akhir bulan sebelumnya maupun open→close bulan (BBCA, 3/15 bulan
 * cocok), dan bulan berjalan ikut dihitung. `up_prob` sengaja dibuang.
 */
export function normalizeSeasonal(body: Record<string, unknown>, code: string): { payload: SeasonalPayload | null; issues: string[] } {
  if (typeof body.stock_code === "string" && body.stock_code.toUpperCase() !== code.toUpperCase()) return { payload: null, issues: [`stock_code ≠ ${code}; ditolak.`] };
  const mr = body.monthly_returns;
  if (!mr || typeof mr !== "object") return { payload: null, issues: ["monthly_returns tidak ada; ditolak."] };
  const monthly: SeasonalPayload["monthly"] = {};
  const counts: SeasonalPayload["counts"] = {};
  const summary = (body.summary && typeof body.summary === "object" ? body.summary : {}) as Record<string, Record<string, unknown>>;
  MONTH_KEYS.forEach((key, i) => {
    const byYear = (mr as Record<string, unknown>)[key];
    const m: Record<string, number> = {};
    if (byYear && typeof byYear === "object") {
      for (const [y, v] of Object.entries(byYear as Record<string, unknown>)) if (/^\d{4}$/.test(y) && num(v) !== null) m[y] = v as number;
    }
    monthly[String(i + 1)] = m;
    const s = summary[key] ?? {};
    counts[String(i + 1)] = { up: num(s.up), down: num(s.down), total: num(s.total) };
  });
  const years = Array.isArray(body.years) ? (body.years as unknown[]).filter((y): y is string => typeof y === "string" && /^\d{4}$/.test(y)) : [];
  return { payload: { years, monthly, counts }, issues: [] };
}
