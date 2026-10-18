/**
 * Seasonality (pola bulanan historis) dihitung LOKAL dari harga penutupan
 * harian tersimpan. Rumus (docs/methodology.md §seasonality):
 *
 *   return bulan M = close terakhir M / close terakhir bulan sebelumnya − 1
 *
 * - Hanya bulan LENGKAP: bulan berjalan (bulan dari `todayWib`) tidak dihitung.
 * - Butuh close akhir bulan kalender TEPAT sebelumnya; bulan pertama data dan
 *   bulan setelah celah (tidak ada bar sebulan penuh) dilewati, tidak diisi.
 * - Harga belum terverifikasi penyesuaian corporate action (split/right
 *   issue dapat membuat return palsu) — ditampilkan sebagai catatan.
 * - "Proporsi naik" = jumlah tahun dengan return > 0 dibagi jumlah tahun yang
 *   teramati. Statistik masa lalu, BUKAN peluang naik di masa depan.
 */

export interface SeasonalityBar {
  tradingDate: string; // YYYY-MM-DD
  close: number;
}

export interface MonthStat {
  month: number; // 1–12
  n: number;
  mean: number | null;
  median: number | null;
  positive: number;
}

export interface SeasonalityResult {
  /** year → 12 return bulanan (indeks 0 = Januari); null = tidak teramati. */
  matrix: Array<{ year: number; returns: Array<number | null> }>;
  months: MonthStat[];
  firstMonth: string | null; // YYYY-MM bulan pertama yang punya return
  lastMonth: string | null;
  observedMonths: number;
}

const monthKey = (date: string) => date.slice(0, 7);
function prevMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function monthlySeasonality(bars: readonly SeasonalityBar[], todayWib: string): SeasonalityResult {
  const currentMonth = monthKey(todayWib);
  const lastClose = new Map<string, number>();
  for (const bar of [...bars].sort((a, b) => (a.tradingDate < b.tradingDate ? -1 : 1))) {
    if (!Number.isFinite(bar.close) || bar.close <= 0) continue;
    lastClose.set(monthKey(bar.tradingDate), bar.close);
  }

  const byYear = new Map<number, Array<number | null>>();
  const observed: string[] = [];
  for (const [key, close] of [...lastClose.entries()].sort()) {
    if (key >= currentMonth) continue; // bulan berjalan/masa depan belum lengkap
    const prev = lastClose.get(prevMonthKey(key));
    if (prev === undefined) continue; // bulan pertama atau setelah celah
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    const row = byYear.get(year) ?? Array<number | null>(12).fill(null);
    row[month - 1] = close / prev - 1;
    byYear.set(year, row);
    observed.push(key);
  }

  const matrix = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, returns]) => ({ year, returns }));
  const months: MonthStat[] = Array.from({ length: 12 }, (_, i) => {
    const values = matrix.map((r) => r.returns[i]).filter((v): v is number => v !== null && v !== undefined);
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return {
      month: i + 1,
      n: values.length,
      mean: values.length ? values.reduce((s, v) => s + v, 0) / values.length : null,
      median: values.length ? (sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2) : null,
      positive: values.filter((v) => v > 0).length,
    };
  });
  return { matrix, months, firstMonth: observed[0] ?? null, lastMonth: observed.at(-1) ?? null, observedMonths: observed.length };
}
