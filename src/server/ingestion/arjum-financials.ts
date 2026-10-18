import { createHash } from "node:crypto";

import type { ArjumFinancialStatementsResponse } from "@/server/providers/arjum/schemas";
import { coerceNumber } from "@/server/providers/arjum/schemas";

/**
 * Normalisasi /api/financial-statements Arjum ke fakta granular.
 *
 * Prinsip (AGENTS.md §8):
 * - Hanya path yang TERLIHAT pada respons nyata yang dipetakan (FINANCIAL_CONCEPT_MAP).
 *   Field lain tetap utuh di `financial_reports.data`, tidak diberi arti.
 * - Penyedia mengisi 0 untuk pos yang tidak dilaporkan (contoh nyata: grup
 *   `laba_rugi_per_saham.total` = 0 padahal anaknya 119). Untuk konsep yang
 *   mustahil 0 pada emiten aktif (aset, ekuitas, pendapatan, EPS…), 0 disimpan
 *   sebagai null dengan validation "zero_as_missing" — bukan dianggap nol.
 * - Basis kuartal (mandiri vs YTD) TIDAK diasumsikan: diverifikasi terhadap
 *   laporan tahunan (detectQuarterBasis). Tanpa bukti → "unverified" dan TTM
 *   tidak dihitung.
 * - published_at tidak diisi: penyedia hanya memberi `fetched_at` (waktu
 *   penyedia mengambil data), yang BUKAN waktu publikasi laporan.
 */

export type ReportType = "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW_REPORT";
export type ReportPeriod = "quarterly" | "annually";

export interface ConceptMapping {
  concept: string;
  reportType: ReportType;
  /** Path bertitik di `data`; yang pertama bernilai dipakai. */
  paths: string[];
  unit: "IDR" | "IDR_per_share";
  /** flow = arus selama periode (laba, pendapatan); stock = posisi akhir periode (neraca). */
  kind: "flow" | "stock";
  /** 0 berarti "tidak dilaporkan" untuk konsep ini. */
  zeroMeansMissing: boolean;
  /** Sumber bukti path (respons nyata yang memuatnya). */
  evidence: string;
}

/**
 * Pemetaan eksplisit konsep → path penyedia. Setiap entri harus punya bukti
 * respons nyata; konsep tanpa bukti (mis. pendapatan bank) sengaja tidak ada.
 */
export const FINANCIAL_CONCEPT_MAP: readonly ConceptMapping[] = [
  {
    concept: "net_income",
    reportType: "INCOME_STATEMENT",
    paths: ["laba_rugi_yang_dapat_diatribusikan.laba_rugi_yang_dapat_diatribusikan_ke_entitas_induk"],
    unit: "IDR",
    kind: "flow",
    zeroMeansMissing: false,
    evidence: "probe BBCA INCOME_STATEMENT quarterly 2026-10-04",
  },
  {
    concept: "net_income_total",
    reportType: "INCOME_STATEMENT",
    paths: ["laba_rugi"],
    unit: "IDR",
    kind: "flow",
    zeroMeansMissing: false,
    evidence: "probe BBCA INCOME_STATEMENT quarterly 2026-10-04",
  },
  {
    concept: "operating_income",
    reportType: "INCOME_STATEMENT",
    paths: ["laba_operasional"],
    unit: "IDR",
    kind: "flow",
    zeroMeansMissing: false,
    evidence: "probe BBCA INCOME_STATEMENT quarterly 2026-10-04",
  },
  {
    concept: "pretax_income",
    reportType: "INCOME_STATEMENT",
    paths: ["laba_rugi_sebelum_pajak_penghasilan"],
    unit: "IDR",
    kind: "flow",
    zeroMeansMissing: false,
    evidence: "probe BBCA INCOME_STATEMENT quarterly 2026-10-04",
  },
  {
    concept: "eps_basic",
    reportType: "INCOME_STATEMENT",
    paths: ["laba_rugi_per_saham.laba_per_saham_dasar_diatribusikan_kepada_pemilik_entitas_induk.total"],
    unit: "IDR_per_share",
    kind: "flow",
    zeroMeansMissing: true,
    evidence: "probe BBCA INCOME_STATEMENT quarterly 2026-10-04 (grup induk bernilai 0, anak 119); TLKM 2026-10-06 bernilai 0 → tidak dilaporkan",
  },
  {
    concept: "revenue",
    reportType: "INCOME_STATEMENT",
    // Format bank (BBCA) tidak punya pos pendapatan tunggal → sengaja tidak dipetakan.
    paths: ["penjualan_dan_pendapatan_usaha"],
    unit: "IDR",
    kind: "flow",
    zeroMeansMissing: true,
    evidence: "probe TLKM INCOME_STATEMENT quarterly 2026-10-06",
  },
  {
    concept: "total_assets",
    reportType: "BALANCE_SHEET",
    paths: ["aset.total"],
    unit: "IDR",
    kind: "stock",
    zeroMeansMissing: true,
    evidence: "probe BBCA & TLKM BALANCE_SHEET quarterly 2026-10-06",
  },
  {
    concept: "total_liabilities",
    reportType: "BALANCE_SHEET",
    paths: ["liabilitas_dan_ekuitas.liabilitas.total", "liabilitas_dana_syirkah_temporer_dan_ekuitas.liabilitas.total"],
    unit: "IDR",
    kind: "stock",
    zeroMeansMissing: true,
    evidence: "probe TLKM (nonbank) & BBCA (bank, grup memuat dana syirkah temporer) BALANCE_SHEET 2026-10-06",
  },
  {
    concept: "total_equity",
    reportType: "BALANCE_SHEET",
    paths: ["liabilitas_dan_ekuitas.ekuitas.total", "liabilitas_dana_syirkah_temporer_dan_ekuitas.ekuitas.total"],
    unit: "IDR",
    kind: "stock",
    zeroMeansMissing: true,
    evidence: "probe TLKM & BBCA BALANCE_SHEET 2026-10-06",
  },
  {
    concept: "equity_parent",
    reportType: "BALANCE_SHEET",
    paths: [
      "liabilitas_dan_ekuitas.ekuitas.ekuitas_yang_diatribusikan_kepada_pemilik_entitas_induk.total",
      "liabilitas_dana_syirkah_temporer_dan_ekuitas.ekuitas.ekuitas_yang_diatribusikan_kepada_pemilik_entitas_induk.total",
    ],
    unit: "IDR",
    kind: "stock",
    zeroMeansMissing: true,
    evidence: "probe TLKM & BBCA BALANCE_SHEET 2026-10-06",
  },
];

/** Konsep yang dipakai uji basis kuartal (laba bersih total selalu ada pada laba rugi). */
export const BASIS_TEST_CONCEPT = "net_income_total";
/** Toleransi relatif kecocokan jumlah kuartal vs tahunan (pembulatan penyedia). */
export const BASIS_TOLERANCE = 0.01;

export interface ProviderReportItem {
  reportType: ReportType;
  period: ReportPeriod;
  fiscalYear: number;
  fiscalQuarter: number; // tahunan = 4
  label: string | null;
  providerFetchedAt: string | null;
  data: Record<string, unknown>;
  dataHash: string;
}

export interface ReportIssue {
  severity: "warning" | "error";
  message: string;
}

/** Hash stabil isi laporan (urutan key tidak berpengaruh) — dasar deteksi revisi. */
export function stableHash(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

/** Validasi item respons → item laporan. Item dengan periode tidak jelas ditolak (dicatat), tidak ditebak. */
export function parseReportItems(
  response: ArjumFinancialStatementsResponse,
  requested: { code: string; reportType: ReportType; period: ReportPeriod },
): { items: ProviderReportItem[]; issues: ReportIssue[] } {
  const issues: ReportIssue[] = [];
  if (response.stock_code.toUpperCase() !== requested.code.toUpperCase()) {
    return { items: [], issues: [{ severity: "error", message: `stock_code "${response.stock_code}" ≠ ${requested.code}; respons ditolak.` }] };
  }
  if (response.report_type && response.report_type !== requested.reportType) {
    return { items: [], issues: [{ severity: "error", message: `report_type "${response.report_type}" ≠ ${requested.reportType}; respons ditolak.` }] };
  }
  if (response.period && response.period !== requested.period) {
    return { items: [], issues: [{ severity: "error", message: `period "${response.period}" ≠ ${requested.period}; respons ditolak.` }] };
  }

  const items: ProviderReportItem[] = [];
  const seen = new Set<string>();
  for (const raw of response.items) {
    const year = coerceNumber(raw.year as number | string | null | undefined);
    const quarterRaw = coerceNumber(raw.quarter as number | string | null | undefined);
    if (year === null || !Number.isInteger(year) || year < 1990 || year > 2100) {
      issues.push({ severity: "error", message: `Item tanpa tahun valid (${String(raw.year)}) dilewati.` });
      continue;
    }
    let quarter: number;
    if (requested.period === "annually") {
      // Tahunan: quarter dari penyedia bisa kosong/4; disimpan sebagai 4.
      if (quarterRaw !== null && quarterRaw !== 4 && quarterRaw !== 0) {
        issues.push({ severity: "error", message: `Item tahunan ${year} ber-quarter ${quarterRaw}; dilewati.` });
        continue;
      }
      quarter = 4;
    } else {
      if (quarterRaw === null || !Number.isInteger(quarterRaw) || quarterRaw < 1 || quarterRaw > 4) {
        issues.push({ severity: "error", message: `Item ${year} tanpa quarter 1–4 (${String(raw.quarter)}) dilewati.` });
        continue;
      }
      quarter = quarterRaw;
    }
    if (!raw.data || typeof raw.data !== "object") {
      issues.push({ severity: "warning", message: `Item ${year}Q${quarter} tanpa data dilewati.` });
      continue;
    }
    const key = `${year}Q${quarter}`;
    if (seen.has(key)) {
      issues.push({ severity: "error", message: `Periode ${key} muncul lebih dari sekali; duplikat dilewati.` });
      continue;
    }
    seen.add(key);
    items.push({
      reportType: requested.reportType,
      period: requested.period,
      fiscalYear: year,
      fiscalQuarter: quarter,
      label: typeof raw.label === "string" ? raw.label.slice(0, 64) : null,
      providerFetchedAt: typeof raw.fetched_at === "string" ? raw.fetched_at.slice(0, 32) : null,
      data: raw.data as Record<string, unknown>,
      dataHash: stableHash(raw.data),
    });
  }
  return { items, issues };
}

/** Ambil nilai numerik pada path bertitik. Non-angka → null. */
export function valueAt(data: Record<string, unknown>, path: string): number | null {
  let cur: unknown = data;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object" || !(part in (cur as object))) return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  if (typeof cur === "number") return Number.isFinite(cur) ? cur : null;
  if (typeof cur === "string") return coerceNumber(cur);
  return null;
}

export interface QuarterBasisResult {
  basis: "standalone" | "ytd" | "unverified" | "inconsistent";
  /** Tahun yang bisa diuji beserta hasilnya — untuk catatan admin. */
  checks: Array<{ year: number; sumQuarters: number; q4: number; annual: number; result: "standalone" | "ytd" | "mismatch" }>;
}

const near = (a: number, b: number) => Math.abs(a - b) <= BASIS_TOLERANCE * Math.max(Math.abs(b), 1);

/**
 * Basis angka kuartalan laba rugi satu emiten: bandingkan Q1..Q4 dengan
 * laporan tahunan tahun yang sama. Jumlah ≈ tahunan → kuartal mandiri;
 * Q4 ≈ tahunan → YTD. Tahun tanpa empat kuartal lengkap tidak diuji.
 */
export function detectQuarterBasis(
  quarterly: ReadonlyArray<{ fiscalYear: number; fiscalQuarter: number; value: number | null }>,
  annual: ReadonlyArray<{ fiscalYear: number; value: number | null }>,
): QuarterBasisResult {
  const checks: QuarterBasisResult["checks"] = [];
  for (const a of annual) {
    if (a.value === null) continue;
    const qs = [1, 2, 3, 4].map((q) => quarterly.find((x) => x.fiscalYear === a.fiscalYear && x.fiscalQuarter === q)?.value ?? null);
    if (qs.some((v) => v === null)) continue;
    const values = qs as number[];
    const sumQuarters = values.reduce((s, v) => s + v, 0);
    const q4 = values[3]!;
    // Bila Q1..Q3 semuanya 0, kedua uji sama-sama cocok — tidak dianggap bukti.
    const ambiguous = values.slice(0, 3).every((v) => v === 0);
    const result = ambiguous ? "mismatch" : near(sumQuarters, a.value) ? "standalone" : near(q4, a.value) ? "ytd" : "mismatch";
    checks.push({ year: a.fiscalYear, sumQuarters, q4, annual: a.value, result });
  }
  if (checks.length === 0) return { basis: "unverified", checks };
  const results = new Set(checks.map((c) => c.result));
  if (results.size === 1 && !results.has("mismatch")) return { basis: [...results][0] as "standalone" | "ytd", checks };
  return { basis: "inconsistent", checks };
}

export interface NormalizedFact {
  fiscalYear: number;
  fiscalQuarter: number;
  periodBasis: "quarter" | "ytd" | "annual" | "instant" | "quarter_unverified";
  periodType: "duration" | "instant";
  isYtd: boolean;
  concept: string;
  value: number | null;
  unit: string;
  rawPath: string | null;
  validation: string;
  periodStart: string;
  periodEnd: string;
  providerFetchedAt: string | null;
}

/** Batas kuartal kalender. Asumsi tahun buku = tahun kalender (dicatat di docs/methodology.md). */
export function quarterBounds(year: number, quarter: number): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = quarter * 3;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${year}-${pad(startMonth)}-01`, end: `${year}-${pad(endMonth)}-${pad(lastDay)}` };
}

/**
 * Item laporan → fakta terpetakan. `quarterBasis` menentukan cara fakta flow
 * kuartalan disimpan:
 * - standalone → period_basis "quarter";
 * - ytd → disimpan "ytd" (mentah) DAN kuartal mandiri hasil selisih
 *   (validation "derived_from_ytd") bila kuartal sebelumnya tersedia;
 * - unverified/inconsistent → disimpan "quarter_unverified": tampil di UI,
 *   tidak dipakai TTM.
 */
export function normalizeFacts(items: readonly ProviderReportItem[], quarterBasis: QuarterBasisResult["basis"]): NormalizedFact[] {
  const facts: NormalizedFact[] = [];
  const ytdValues = new Map<string, number | null>(); // `${concept}:${year}Q${q}` → nilai YTD

  const sorted = [...items].sort((a, b) => a.fiscalYear - b.fiscalYear || a.fiscalQuarter - b.fiscalQuarter);
  for (const item of sorted) {
    for (const m of FINANCIAL_CONCEPT_MAP) {
      if (m.reportType !== item.reportType) continue;
      let value: number | null = null;
      let rawPath: string | null = null;
      for (const path of m.paths) {
        const v = valueAt(item.data, path);
        if (v !== null) {
          value = v;
          rawPath = path;
          break;
        }
      }
      if (rawPath === null) continue; // konsep tidak ada pada laporan ini (mis. format industri lain)
      let validation = "ok";
      if (value === 0 && m.zeroMeansMissing) {
        value = null;
        validation = "zero_as_missing";
      }

      const q = quarterBounds(item.fiscalYear, item.fiscalQuarter);
      const base = { concept: m.concept, unit: m.unit, rawPath, providerFetchedAt: item.providerFetchedAt, fiscalYear: item.fiscalYear, fiscalQuarter: item.fiscalQuarter };

      if (m.kind === "stock") {
        facts.push({ ...base, value, validation, periodBasis: "instant", periodType: "instant", isYtd: false, periodStart: q.end, periodEnd: q.end });
        continue;
      }
      if (item.period === "annually") {
        facts.push({ ...base, value, validation, periodBasis: "annual", periodType: "duration", isYtd: false, periodStart: `${item.fiscalYear}-01-01`, periodEnd: q.end });
        continue;
      }
      if (quarterBasis === "standalone") {
        facts.push({ ...base, value, validation, periodBasis: "quarter", periodType: "duration", isYtd: false, periodStart: q.start, periodEnd: q.end });
      } else if (quarterBasis === "ytd") {
        facts.push({ ...base, value, validation, periodBasis: "ytd", periodType: "duration", isYtd: true, periodStart: `${item.fiscalYear}-01-01`, periodEnd: q.end });
        ytdValues.set(`${m.concept}:${item.fiscalYear}Q${item.fiscalQuarter}`, value);
        const prev = item.fiscalQuarter === 1 ? null : ytdValues.get(`${m.concept}:${item.fiscalYear}Q${item.fiscalQuarter - 1}`);
        if (item.fiscalQuarter === 1 || prev !== undefined) {
          const discrete = value === null ? null : item.fiscalQuarter === 1 ? value : prev === null || prev === undefined ? null : value - prev;
          // EPS per kuartal dari selisih YTD tidak tepat (jumlah saham tertimbang berubah) — tidak diturunkan.
          if (m.unit !== "IDR_per_share") {
            facts.push({ ...base, value: discrete, validation: "derived_from_ytd", periodBasis: "quarter", periodType: "duration", isYtd: false, periodStart: q.start, periodEnd: q.end });
          }
        }
      } else {
        // Basis belum terbukti: tetap disimpan untuk tampilan, tidak untuk TTM.
        facts.push({ ...base, value, validation, periodBasis: "quarter_unverified", periodType: "duration", isYtd: false, periodStart: q.start, periodEnd: q.end });
      }
    }
  }
  // Q4 yang tidak diterbitkan sumber (contoh nyata: TLKM 2025Q4) diturunkan dari
  // tahunan − (Q1+Q2+Q3) HANYA bila basis kuartal mandiri sudah terverifikasi.
  // EPS tidak diturunkan (saham tertimbang tiap kuartal berbeda).
  if (quarterBasis === "standalone") {
    const quarterly = facts.filter((f) => f.periodBasis === "quarter");
    for (const annual of facts.filter((f) => f.periodBasis === "annual" && f.unit === "IDR" && f.value !== null)) {
      const qs = [1, 2, 3, 4].map((q) => quarterly.find((f) => f.concept === annual.concept && f.fiscalYear === annual.fiscalYear && f.fiscalQuarter === q));
      if (qs[3] || qs.slice(0, 3).some((f) => !f || f.value === null)) continue;
      const q = quarterBounds(annual.fiscalYear, 4);
      facts.push({
        ...annual,
        fiscalQuarter: 4,
        value: annual.value! - qs.slice(0, 3).reduce((s, f) => s + f!.value!, 0),
        validation: "derived_from_annual",
        periodBasis: "quarter",
        periodStart: q.start,
        periodEnd: q.end,
      });
    }
  }
  // EPS sumber divalidasi terhadap laba induk periode yang sama: tanda berbeda,
  // atau |EPS| < 0,01 padahal laba ≠ 0, berarti angka tidak konsisten (contoh
  // nyata TLKM: 2025Q2 −58,65 dengan laba +5,2 T; 2026Q1 4,39e-8 ≈ salah skala
  // 10^9). Disimpan kosong dengan validation "eps_inconsistent", tidak diperbaiki.
  for (const f of facts) {
    if (f.concept !== "eps_basic" || f.value === null) continue;
    const ni = facts.find((x) => x.concept === "net_income" && x.fiscalYear === f.fiscalYear && x.fiscalQuarter === f.fiscalQuarter && x.periodBasis === f.periodBasis);
    if (!ni || ni.value === null || ni.value === 0) continue;
    if (Math.sign(ni.value) !== Math.sign(f.value) || Math.abs(f.value) < 0.01) {
      f.value = null;
      f.validation = "eps_inconsistent";
    }
  }
  return facts;
}
