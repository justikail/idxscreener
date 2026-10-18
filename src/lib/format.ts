const nf = (digits: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function formatIdr(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    value,
  );
}

export function formatNumber(value: number, digits = 0): string {
  return nf(digits).format(value);
}

/** "+3,59%" / "−1,20%" — tanda minus tipografis, desimal koma (id-ID). */
export function formatPercent(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${nf(digits).format(Math.abs(value))}%`;
}

const SCALE: Array<[number, string]> = [
  [1e12, "T"],
  [1e9, "M"],
  [1e6, "jt"],
  [1e3, "rb"],
];

/** Angka ringkas gaya Indonesia: 798,1 M (miliar), 131,9 jt (juta). */
export function formatCompact(value: number, digits = 1): string {
  const abs = Math.abs(value);
  for (const [unit, label] of SCALE) {
    if (abs >= unit) return `${nf(digits).format(value / unit)} ${label}`;
  }
  return nf(0).format(value);
}

export function formatCompactIdr(value: number): string {
  return `Rp${formatCompact(value)}`;
}

export function formatVolume(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? formatCompact(n, n >= 1e6 ? 2 : 1) : raw;
}

export function formatRatio(value: number, digits = 2): string {
  return `${nf(digits).format(value)}x`;
}

export function formatDateId(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" });
}

/** Waktu kejadian (timestamp) dalam WIB, mis. "5 Okt 2026, 11.43 WIB" — untuk riwayat job. */
export function formatDateTimeWib(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const text = date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${text} WIB`;
}

/**
 * Tanggal perdagangan (kolom DATE "YYYY-MM-DD") ditampilkan tanpa konversi
 * zona waktu agar tidak bergeser sehari: "Jumat, 2 Okt 2026".
 */
export function formatTradingDate(ymd: string, opts: { weekday?: boolean } = { weekday: true }): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.toLocaleDateString("id-ID", {
    timeZone: "UTC",
    weekday: opts.weekday ? "long" : undefined,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
