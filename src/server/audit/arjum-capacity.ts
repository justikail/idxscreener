/**
 * Logika murni audit kapasitas Arjum (tanpa jaringan, tanpa database) supaya
 * budget, checkpoint, rencana langkah, deduplikasi, dan pagination bisa diuji
 * tanpa memakai kuota. Runner ada di src/jobs/arjum-capacity-audit.ts.
 *
 * Prinsip: tidak ada body mentah yang disimpan. Setiap langkah hanya
 * menghasilkan "fakta" (jumlah baris, rentang tanggal, metadata pagination,
 * nama field) dan entri manifest yang sudah disanitasi.
 */

export class AuditBudgetExhaustedError extends Error {
  constructor(public readonly limit: number) {
    super(`Batas keras audit ${limit} panggilan HTTP tercapai.`);
    this.name = "AuditBudgetExhaustedError";
  }
}

/** Batas keras jumlah percobaan HTTP (termasuk retry dan pagination). */
export class AuditBudget {
  constructor(
    public readonly limit: number,
    public used = 0,
  ) {
    if (!Number.isInteger(limit) || limit < 0) throw new Error("Budget audit harus bilangan bulat ≥ 0.");
  }
  /** Dipanggil SEBELUM setiap percobaan HTTP. */
  consume(): void {
    if (this.used >= this.limit) throw new AuditBudgetExhaustedError(this.limit);
    this.used += 1;
  }
  get remaining(): number {
    return this.limit - this.used;
  }
}

export type Params = Record<string, string>;

export interface AuditStep {
  id: string;
  path: string;
  params: Params;
  purpose: string;
}

export const SAMPLE_CODE = "BBCA";

/**
 * Langkah tetap. Halaman market-cap 2..N ditambahkan dinamis setelah halaman 1
 * memberi total_pages. Tanggal sampel = sesi terakhir yang tersedia (diisi
 * runner dari data, bukan tanggal kalender).
 */
export function fixedSteps(sessionDate: string): AuditStep[] {
  const c = SAMPLE_CODE;
  return [
    { id: "health", path: "/api/health", params: {}, purpose: "status layanan; apakah memotong kuota" },
    { id: "market-cap:p1", path: "/api/market-cap", params: { page: "1", per_page: "50" }, purpose: "daftar instrumen + metadata total" },
    { id: "market-cap:date-2025-01-02", path: "/api/market-cap", params: { page: "1", per_page: "50", date: "2025-01-02" }, purpose: "daftar pada tanggal lampau: apakah memuat kode yang kini hilang" },
    { id: "market-cap:codes-batch", path: "/api/market-cap", params: { codes: "BBCA,BBRI,TLKM" }, purpose: "apakah parameter codes (multi-saham) bekerja" },
    { id: "search", path: "/api/search", params: { q: "BB" }, purpose: "kontrak pencarian" },
    { id: "history:daily-500", path: `/api/history/${c}`, params: { limit: "500", frame: "daily" }, purpose: "kedalaman daily maksimum per panggilan + data_available" },
    { id: "history:daily-range-2020", path: `/api/history/${c}`, params: { limit: "500", frame: "daily", start_date: "2020-01-01", end_date: "2020-03-31" }, purpose: "apakah start_date/end_date dihormati (penentu akses histori >500 sesi)" },
    { id: "history:CDIA-daily-20", path: "/api/history/CDIA", params: { limit: "20", frame: "daily" }, purpose: "data_available saham yang baru listing (rentang berbeda antarsaham?)" },
    { id: "history:weekly-500", path: `/api/history/${c}`, params: { limit: "500", frame: "weekly" }, purpose: "kedalaman weekly" },
    { id: "history:monthly-500", path: `/api/history/${c}`, params: { limit: "500", frame: "monthly" }, purpose: "kedalaman monthly" },
    ...(["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW_REPORT"] as const).flatMap((t) =>
      (["quarterly", "annually"] as const).map((p) => ({
        id: `fin:${t}:${p}`,
        path: `/api/financial-statements/${c}`,
        params: { report_type: t, period: p, limit: "40" },
        purpose: "jumlah periode tersedia vs batas 40",
      })),
    ),
    { id: "broker-summary:default", path: `/api/broker-summary/${c}`, params: {}, purpose: "rentang default + broker_date_min/max" },
    { id: "broker-summary:one-day", path: `/api/broker-summary/${c}`, params: { start_date: sessionDate, end_date: sessionDate }, purpose: "agregat satu hari" },
    { id: "broker-accumulation", path: `/api/broker-accumulation/${c}`, params: {}, purpose: "kontrak akumulasi" },
    { id: "insiders:p1", path: `/api/insiders/${c}`, params: { page: "1" }, purpose: "metadata pagination insider" },
    { id: "done-details:last-session", path: "/api/done-details", params: { code: c, date: sessionDate, page: "1", per_page: "100" }, purpose: "total transaksi satu saham-hari vs freq" },
    { id: "done-details:BBRI-last-session", path: "/api/done-details", params: { code: "BBRI", date: sessionDate, page: "1", per_page: "100" }, purpose: "total transaksi vs freq, saham kedua" },
    { id: "done-details:2025-10-02", path: "/api/done-details", params: { code: c, date: "2025-10-02", page: "1", per_page: "100" }, purpose: "kedalaman histori done details (±1 tahun)" },
    { id: "done-details:2024-10-02", path: "/api/done-details", params: { code: c, date: "2024-10-02", page: "1", per_page: "100" }, purpose: "kedalaman histori done details (±2 tahun)" },
    { id: "done-details:2020-01-02", path: "/api/done-details", params: { code: c, date: "2020-01-02", page: "1", per_page: "100" }, purpose: "kedalaman histori done details (2020)" },
    { id: "seasonal", path: `/api/seasonal/${c}`, params: {}, purpose: "kontrak seasonality" },
    { id: "analysis", path: `/api/analysis/${c}`, params: {}, purpose: "kontrak analisis penyedia" },
    { id: "screener-latest", path: "/api/screener/latest", params: {}, purpose: "kontrak screener penyedia" },
    { id: "price", path: `/api/price/${c}`, params: {}, purpose: "snapshot harga terakhir" },
  ];
}

/**
 * Putaran lanjutan (ditambahkan saat resume bila belum ada): inventaris daftar
 * tanggal lampau lengkap, kedalaman done-details, dan biaya /api/health
 * (health tidak mengirim header kuota → diapit dua panggilan berbiaya
 * diketahui).
 */
export function extensionSteps(): AuditStep[] {
  const c = SAMPLE_CODE;
  return [
    ...Array.from({ length: 18 }, (_, i) => ({
      id: `market-cap:date-2025-01-02:p${i + 2}`,
      path: "/api/market-cap",
      params: { page: String(i + 2), per_page: "50", date: "2025-01-02" },
      purpose: "daftar lengkap 2025-01-02 untuk mencari kode yang kini hilang",
    })),
    { id: "market-cap:date-2020-01-02", path: "/api/market-cap", params: { page: "1", per_page: "50", date: "2020-01-02" }, purpose: "ukuran daftar pada awal data 2020" },
    { id: "done-details:2026-09-01", path: "/api/done-details", params: { code: c, date: "2026-09-01", page: "1", per_page: "100" }, purpose: "kedalaman done details" },
    { id: "done-details:2026-06-02", path: "/api/done-details", params: { code: c, date: "2026-06-02", page: "1", per_page: "100" }, purpose: "kedalaman done details" },
    { id: "done-details:2026-03-02", path: "/api/done-details", params: { code: c, date: "2026-03-02", page: "1", per_page: "100" }, purpose: "kedalaman done details" },
    { id: "market-cap:date-2025-01-02:p1", path: "/api/market-cap", params: { page: "1", per_page: "50", date: "2025-01-02" }, purpose: "kode halaman 1 daftar 2025 (putaran pertama tidak menyimpan kode)" },
    { id: "history:FREN-delisted-20", path: "/api/history/FREN", params: { limit: "20", frame: "daily" }, purpose: "apakah histori kode yang hilang dari daftar kini masih dapat diambil" },
    { id: "cost:before-health", path: "/api/search", params: { q: "BBCA" }, purpose: "biaya diketahui (1) sebelum health" },
    { id: "health:2", path: "/api/health", params: {}, purpose: "apakah health memotong kuota" },
    { id: "cost:after-health", path: "/api/search", params: { q: "BBRI" }, purpose: "biaya diketahui (1) sesudah health: selisih 2 → health 1 unit" },
  ];
}

export function marketCapPageStep(page: number): AuditStep {
  return { id: `market-cap:p${page}`, path: "/api/market-cap", params: { page: String(page), per_page: "50" }, purpose: "daftar instrumen" };
}

export function pagesFor(total: number, perPage: number): number {
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(perPage) || perPage <= 0) throw new Error("total/perPage tidak valid");
  return Math.ceil(total / perPage);
}

/** Kode unik (huruf besar, trim) + jumlah duplikat. */
export function dedupeCodes(codes: readonly string[]): { unique: string[]; duplicates: string[] } {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const raw of codes) {
    const c = raw.trim().toUpperCase();
    if (!c) continue;
    if (seen.has(c)) dup.add(c);
    seen.add(c);
  }
  return { unique: [...seen].sort(), duplicates: [...dup].sort() };
}

/** Konsistensi pagination: jumlah baris yang terkumpul vs metadata total. */
export function checkPagination(meta: { total: number; perPage: number; totalPages: number }, rowsSeen: number, pagesSeen: number) {
  const expectedPages = pagesFor(meta.total, meta.perPage);
  return {
    expectedPages,
    totalPagesMatches: expectedPages === meta.totalPages,
    allPagesSeen: pagesSeen >= meta.totalPages,
    rowsMatchTotal: rowsSeen === meta.total,
  };
}

/** Biaya kuota satu panggilan dari header remaining pada key yang sama, bila ada. */
export function quotaCost(prevRemaining: number | null, remaining: number | null): number | null {
  if (prevRemaining === null || remaining === null) return null;
  return prevRemaining - remaining;
}

export function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Daftar array pertama yang ditemukan pada key umum (rows/data/items/...). */
function firstArray(body: Record<string, unknown>): { key: string; rows: unknown[] } | null {
  for (const key of ["rows", "data", "items", "results", "brokers", "insiders", "transactions"]) {
    if (Array.isArray(body[key])) return { key, rows: body[key] as unknown[] };
  }
  for (const [key, v] of Object.entries(body)) if (Array.isArray(v)) return { key, rows: v };
  return null;
}

function dateRange(rows: unknown[]): { first: string | null; last: string | null } {
  const dates = rows
    .map((r) => (isObj(r) ? (r.date ?? r.market_date ?? r.transaction_date ?? r.tanggal) : null))
    .filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d))
    .map((d) => d.slice(0, 10))
    .sort();
  return { first: dates[0] ?? null, last: dates.at(-1) ?? null };
}

const SCALAR_META = /^(date|total|count|page|per_page|total_pages|frame|period|report_type|stock_code|code|source|cached_for_seconds|broker_start_date|broker_end_date|broker_date_min|broker_date_max|market_state|market_label|source_date|no_trade_today|data_ts|served_ts|quote_age_ms|status|ok|has_more|next|cursor|updated_at|last_updated)$/;

/**
 * Ringkasan fakta dari satu respons: TANPA menyimpan isi baris. Metadata
 * skalar yang relevan disalin; nilai harga/nama tidak.
 */
export function extractFacts(body: unknown): Record<string, unknown> {
  if (Array.isArray(body)) {
    return { topLevel: "array", rowCount: body.length, rowKeys: isObj(body[0]) ? Object.keys(body[0]).sort() : [], ...dateRange(body) };
  }
  if (!isObj(body)) return { topLevel: typeof body };
  const facts: Record<string, unknown> = { topKeys: Object.keys(body).sort() };
  for (const [k, v] of Object.entries(body)) {
    if (SCALAR_META.test(k) && (v === null || ["string", "number", "boolean"].includes(typeof v))) facts[k] = v;
  }
  if (isObj(body.data_available)) facts.data_available = body.data_available;
  const arr = firstArray(body);
  if (arr) {
    facts.arrayKey = arr.key;
    facts.rowCount = arr.rows.length;
    facts.rowKeys = isObj(arr.rows[0]) ? Object.keys(arr.rows[0]).sort() : [];
    Object.assign(facts, dateRange(arr.rows));
    // Periode laporan keuangan (year/quarter), tanpa isi angka.
    const periods = arr.rows
      .filter(isObj)
      .map((r) => (r.year !== undefined ? `${r.year}${r.quarter !== undefined && r.quarter !== null ? `Q${r.quarter}` : ""}` : null))
      .filter((p): p is string => p !== null);
    if (periods.length) facts.periods = { count: periods.length, first: [...periods].sort()[0], last: [...periods].sort().at(-1) };
  }
  return facts;
}

/** Kode dari satu halaman market-cap (hanya kode — publik, dibutuhkan untuk dedupe). */
export function marketCapCodes(body: unknown): string[] {
  if (!isObj(body) || !Array.isArray(body.data)) return [];
  return body.data.filter(isObj).map((r) => String(r.code ?? "")).filter(Boolean);
}

export interface ManifestEntry {
  at: string;
  stepId: string;
  path: string;
  params: Params;
  httpStatus: number | null;
  outcome: "ok" | "error";
  error?: string;
  attempts: number;
  durationMs: number | null;
  rowCount: number | null;
  pagination: { total: number | null; page: number | null; perPage: number | null; totalPages: number | null } | null;
  rateLimit: { limit: number | null; remaining: number | null };
  quotaCost: number | null;
}

export interface AuditCheckpoint {
  version: 1;
  startedAt: string;
  sessionDate: string;
  keyLabel: string;
  httpCallsUsed: number;
  done: Record<string, { facts: Record<string, unknown>; manifestIndex: number }>;
  pending: AuditStep[];
  marketCapCodes: Record<string, string[]>;
  lastRemaining: number | null;
}

export function newCheckpoint(sessionDate: string, keyLabel: string, now = new Date()): AuditCheckpoint {
  return {
    version: 1,
    startedAt: now.toISOString(),
    sessionDate,
    keyLabel,
    httpCallsUsed: 0,
    done: {},
    pending: fixedSteps(sessionDate),
    marketCapCodes: {},
    lastRemaining: null,
  };
}

/** Langkah berikutnya yang belum selesai (resume melewati yang sudah). */
export function nextStep(cp: AuditCheckpoint): AuditStep | null {
  return cp.pending.find((s) => !cp.done[s.id]) ?? null;
}

/** Setelah halaman 1 market-cap: jadwalkan halaman 2..N (sekali, tanpa duplikat). */
export function scheduleMarketCapPages(cp: AuditCheckpoint, totalPages: number): void {
  const insertAt = cp.pending.findIndex((s) => s.id === "market-cap:p1") + 1;
  const extra: AuditStep[] = [];
  for (let p = 2; p <= totalPages; p++) {
    const step = marketCapPageStep(p);
    if (!cp.pending.some((s) => s.id === step.id)) extra.push(step);
  }
  cp.pending.splice(insertAt, 0, ...extra);
}

/** Rangkuman instrumen dari halaman-halaman market-cap yang terkumpul. */
export function summarizeInstruments(cp: AuditCheckpoint) {
  const pages = Object.keys(cp.marketCapCodes).filter((k) => /^market-cap:p\d+$/.test(k));
  const all = pages.flatMap((k) => cp.marketCapCodes[k]!);
  const { unique, duplicates } = dedupeCodes(all);
  const p1 = cp.done["market-cap:p1"]?.facts;
  const total = toNum(p1?.total);
  const perPage = toNum(p1?.per_page);
  const totalPages = toNum(p1?.total_pages);
  return {
    pagesFetched: pages.length,
    rows: all.length,
    unique: unique.length,
    duplicates,
    metadataTotal: total,
    pagination:
      total !== null && perPage !== null && totalPages !== null
        ? checkPagination({ total, perPage, totalPages }, all.length, pages.length)
        : null,
    codes: unique,
    datasetDate: (p1?.date as string | undefined) ?? null,
  };
}
