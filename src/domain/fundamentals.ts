// Kalkulasi rasio fundamental. Prinsip wajib (lihat AGENTS.md §8):
// - null, 0, invalid, stale, dan not_applicable adalah status berbeda. Tidak ada
//   fallback missing -> 0 untuk meloloskan filter atau menaikkan skor.
// - PER untuk EPS <= 0 ditandai not_meaningful, bukan otomatis murah.
// - PBV untuk ekuitas <= 0 tidak masuk ranking murah biasa.

export type MetricStatus = "ok" | "null_missing" | "not_applicable" | "stale" | "unavailable";

export interface MetricResult {
  value: number | null;
  status: MetricStatus;
}

const missing = (): MetricResult => ({ value: null, status: "null_missing" });
const notApplicable = (): MetricResult => ({ value: null, status: "not_applicable" });
const ok = (value: number): MetricResult => ({ value, status: "ok" });

/** Price to Earnings Ratio. EPS <= 0 -> not_applicable (bukan "murah"). */
export function per(price: number | null, epsTtm: number | null): MetricResult {
  if (price === null || epsTtm === null) return missing();
  if (epsTtm <= 0) return notApplicable();
  return ok(price / epsTtm);
}

/** Price to Book Value. Ekuitas <= 0 -> not_applicable. */
export function pbv(price: number | null, equityPerShare: number | null): MetricResult {
  if (price === null || equityPerShare === null) return missing();
  if (equityPerShare <= 0) return notApplicable();
  return ok(price / equityPerShare);
}

/** Return on Equity = laba TTM / rata-rata ekuitas (awal+akhir)/2. */
export function roe(netIncomeTtm: number | null, avgEquity: number | null): MetricResult {
  if (netIncomeTtm === null || avgEquity === null) return missing();
  if (avgEquity === 0) return notApplicable();
  return ok(netIncomeTtm / avgEquity);
}

/** Return on Assets = laba TTM / rata-rata total aset. */
export function roa(netIncomeTtm: number | null, avgTotalAssets: number | null): MetricResult {
  if (netIncomeTtm === null || avgTotalAssets === null) return missing();
  if (avgTotalAssets === 0) return notApplicable();
  return ok(netIncomeTtm / avgTotalAssets);
}

/** Net Profit Margin = laba TTM / pendapatan TTM. */
export function npm(netIncomeTtm: number | null, revenueTtm: number | null): MetricResult {
  if (netIncomeTtm === null || revenueTtm === null) return missing();
  if (revenueTtm === 0) return notApplicable();
  return ok(netIncomeTtm / revenueTtm);
}

/**
 * Debt to Equity Ratio = total liabilitas / total ekuitas (akhir periode).
 * Definisi ini memakai total liabilitas, bukan hanya utang berbunga — lihat
 * docs/methodology.md untuk perbandingan definisi dan alasan pemilihan.
 * Bank/nonbank TIDAK dibandingkan pada peer group yang sama untuk metrik ini
 * (lihat AGENTS.md §9); pemanggil bertanggung jawab memfilter peer group.
 */
export function der(totalLiabilities: number | null, totalEquity: number | null): MetricResult {
  if (totalLiabilities === null || totalEquity === null) return missing();
  if (totalEquity <= 0) return notApplicable();
  return ok(totalLiabilities / totalEquity);
}

export interface QuarterFact {
  fiscalYear: number;
  fiscalQuarter: number;
  value: number | null;
}

/**
 * Menghitung TTM (trailing twelve months) untuk metrik flow (pendapatan, laba)
 * dari 4 fakta kuartalan DISKRIT (bukan YTD) yang berurutan dan sebanding.
 * Mengembalikan null bila kurang dari 4 kuartal berurutan tanpa gap, atau ada
 * nilai null di antaranya. Tidak ada estimasi annualized diam-diam di sini —
 * annualized estimate adalah fitur terpisah yang harus diberi label eksplisit.
 */
export function ttmFromQuarters(lastFourQuarters: readonly QuarterFact[]): number | null {
  if (lastFourQuarters.length !== 4) return null;

  const sorted = [...lastFourQuarters].sort((a, b) =>
    a.fiscalYear !== b.fiscalYear ? a.fiscalYear - b.fiscalYear : a.fiscalQuarter - b.fiscalQuarter,
  );

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    const expectedQuarter = prev.fiscalQuarter === 4 ? 1 : prev.fiscalQuarter + 1;
    const expectedYear = prev.fiscalQuarter === 4 ? prev.fiscalYear + 1 : prev.fiscalYear;
    if (curr.fiscalQuarter !== expectedQuarter || curr.fiscalYear !== expectedYear) {
      return null; // gap terdeteksi
    }
  }

  if (sorted.some((q) => q.value === null)) return null;

  return sorted.reduce((sum, q) => sum + (q.value as number), 0);
}

/**
 * Konversi nilai YTD (kumulatif sejak awal tahun fiskal) menjadi nilai kuartal
 * diskrit: quarter_N = YTD_N - YTD_(N-1). Kuartal pertama tahun (Q1) sama
 * dengan YTD-nya. Memerlukan basis tahun fiskal dan versi yang sebanding;
 * pemanggil menjamin kedua nilai berasal dari tahun fiskal dan versi yang sama.
 */
export function discreteQuarterFromYtd(
  currentYtd: number | null,
  previousYtd: number | null,
  fiscalQuarter: number,
): number | null {
  if (currentYtd === null) return null;
  if (fiscalQuarter === 1) return currentYtd;
  if (previousYtd === null) return null;
  return currentYtd - previousYtd;
}
