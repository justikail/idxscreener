/**
 * Kalender bursa demo: hari kerja Senin-Jumat saja (tanpa kalender libur nasional
 * BEI — keterbatasan yang didokumentasikan di docs/data-sources.md). Tanggal
 * disimpan sebagai string YYYY-MM-DD (DATE, bukan TIMESTAMPTZ), lihat AGENTS.md §6.
 */
export function isTradingDay(date: Date): boolean {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Menghasilkan `count` tanggal perdagangan berurutan naik, berakhir di `endDate` (inklusif). */
export function tradingDaysEndingAt(endDate: Date, count: number): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

  while (days.length < count) {
    if (isTradingDay(cursor)) {
      days.push(toDateKey(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return days.reverse();
}
