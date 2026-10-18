/** Pilihan jumlah baris per halaman yang bisa dipilih pengguna. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export interface PageState<T> {
  items: T[];
  page: number;
  pages: number;
  size: number;
  total: number;
  /** Nomor urut (1-based) baris pertama di halaman ini; 0 bila kosong. */
  from: number;
  to: number;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Potong daftar sesuai parameter URL `<key>` (halaman) dan `<key>_per`
 * (baris per halaman). Nilai tidak valid jatuh ke halaman 1 / ukuran default;
 * halaman di luar jangkauan dijepit ke halaman terakhir.
 */
export function paginate<T>(items: T[], params: SearchParamsRecord, key: string, defaultSize: number): PageState<T> {
  const rawSize = Number.parseInt(first(params[`${key}_per`]) ?? "", 10);
  const size = (PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : defaultSize;
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Number.parseInt(first(params[key]) ?? "1", 10) || 1), pages);
  const start = (page - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page, pages, size, total, from: slice.length ? start + 1 : 0, to: start + slice.length };
}

/**
 * URL halaman yang sama dengan parameter lain dipertahankan. Halaman 1 dan
 * ukuran default tidak ditulis agar URL tetap pendek.
 */
export function pageHref(
  path: string,
  params: SearchParamsRecord,
  key: string,
  over: { page: number; size: number },
  defaultSize: number,
  anchor?: string,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const value = first(v);
    if (value !== undefined && k !== key && k !== `${key}_per`) sp.set(k, value);
  }
  if (over.page > 1) sp.set(key, String(over.page));
  if (over.size !== defaultSize) sp.set(`${key}_per`, String(over.size));
  const s = sp.toString();
  return `${path}${s ? `?${s}` : ""}${anchor ? `#${anchor}` : ""}`;
}

/** Nomor halaman yang ditampilkan: awal, akhir, dan sekitar halaman aktif; null = celah "…". */
export function pageWindow(page: number, pages: number): Array<number | null> {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: Array<number | null> = [];
  for (const n of sorted) {
    const prev = out.at(-1);
    if (typeof prev === "number" && n - prev > 1) out.push(n - prev === 2 ? prev + 1 : null);
    out.push(n);
  }
  return out;
}
