import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "@/server/db/schema";
import type { ArjumProvider } from "@/server/providers/arjum/adapter";
import { ARJUM_PROVIDER } from "@/server/providers/arjum/config";
import {
  BASIS_TEST_CONCEPT,
  FINANCIAL_CONCEPT_MAP,
  detectQuarterBasis,
  normalizeFacts,
  parseReportItems,
  valueAt,
  type NormalizedFact,
  type ProviderReportItem,
  type QuarterBasisResult,
  type ReportIssue,
  type ReportPeriod,
  type ReportType,
} from "./arjum-financials";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Permintaan per saham (4 request): laba rugi kuartalan 12 + tahunan 3 untuk
 * uji basis kuartal, neraca kuartalan 8 (ROE/ROA butuh posisi 4 kuartal
 * sebelumnya), arus kas kuartalan 8 (ditampilkan apa adanya).
 */
export const FINANCIAL_REQUESTS: ReadonlyArray<{ reportType: ReportType; period: ReportPeriod; limit: number }> = [
  // 12 periode: emiten yang melewatkan satu kuartal (mis. TLKM 2025Q4) tetap
  // punya minimal satu tahun lengkap untuk uji basis.
  { reportType: "INCOME_STATEMENT", period: "quarterly", limit: 12 },
  { reportType: "INCOME_STATEMENT", period: "annually", limit: 3 },
  { reportType: "BALANCE_SHEET", period: "quarterly", limit: 8 },
  { reportType: "CASH_FLOW_REPORT", period: "quarterly", limit: 8 },
];

export interface FinancialsIngestResult {
  reportsInserted: number;
  reportsRevised: number;
  factsInserted: number;
  factsRevised: number;
  basis: QuarterBasisResult;
  issues: ReportIssue[];
}

/** Simpan laporan mentah; versi baru hanya bila isi berubah. */
export async function upsertReports(db: Db, instrumentId: string, items: readonly ProviderReportItem[], batchId: string) {
  let inserted = 0;
  let revised = 0;
  for (const item of items) {
    const [latest] = await db
      .select({ version: schema.financialReports.version, dataHash: schema.financialReports.dataHash })
      .from(schema.financialReports)
      .where(
        and(
          eq(schema.financialReports.instrumentId, instrumentId),
          eq(schema.financialReports.provider, ARJUM_PROVIDER),
          eq(schema.financialReports.reportType, item.reportType),
          eq(schema.financialReports.period, item.period),
          eq(schema.financialReports.fiscalYear, item.fiscalYear),
          eq(schema.financialReports.fiscalQuarter, item.fiscalQuarter),
        ),
      )
      .orderBy(desc(schema.financialReports.version))
      .limit(1);
    if (latest?.dataHash === item.dataHash) continue;
    await db
      .insert(schema.financialReports)
      .values({
        instrumentId,
        provider: ARJUM_PROVIDER,
        reportType: item.reportType,
        period: item.period,
        fiscalYear: item.fiscalYear,
        fiscalQuarter: item.fiscalQuarter,
        label: item.label,
        providerFetchedAt: item.providerFetchedAt,
        data: item.data,
        dataHash: item.dataHash,
        version: (latest?.version ?? 0) + 1,
        batchId,
      })
      .onConflictDoNothing();
    if (latest) revised += 1;
    else inserted += 1;
  }
  return { inserted, revised };
}

/** Kolom value numeric(24,2): bandingkan & simpan pada presisi yang sama agar run ulang tidak dianggap revisi. */
const atStoredPrecision = (v: number | null) => (v === null ? null : Number(v.toFixed(2)));
const sameValue = (a: string | null, b: number | null) => (a === null ? b === null : b !== null && Number(a) === atStoredPrecision(b));

/** Upsert fakta: versi baru bila nilai berubah, tidak ada perubahan bila sama. */
export async function upsertFacts(db: Db, instrumentId: string, facts: readonly NormalizedFact[]) {
  let inserted = 0;
  let revised = 0;
  for (const f of facts) {
    const [latest] = await db
      .select({ version: schema.financialFacts.version, value: schema.financialFacts.value, validation: schema.financialFacts.validation })
      .from(schema.financialFacts)
      .where(
        and(
          eq(schema.financialFacts.instrumentId, instrumentId),
          eq(schema.financialFacts.fiscalYear, f.fiscalYear),
          eq(schema.financialFacts.fiscalQuarter, f.fiscalQuarter),
          eq(schema.financialFacts.periodBasis, f.periodBasis),
          eq(schema.financialFacts.consolidation, "consolidated"),
          eq(schema.financialFacts.concept, f.concept),
          eq(schema.financialFacts.source, ARJUM_PROVIDER),
        ),
      )
      .orderBy(desc(schema.financialFacts.version))
      .limit(1);
    if (latest && sameValue(latest.value, f.value) && latest.validation === f.validation) continue;
    await db
      .insert(schema.financialFacts)
      .values({
        instrumentId,
        fiscalYear: f.fiscalYear,
        fiscalQuarter: f.fiscalQuarter,
        periodType: f.periodType,
        periodBasis: f.periodBasis,
        isYtd: f.isYtd,
        // Konsolidasi: penyedia tidak menyatakannya; laporan memuat pos
        // "kepentingan non pengendali" (ciri laporan konsolidasian). Dicatat
        // sebagai konsolidasian + asumsi di docs/methodology.md.
        consolidation: "consolidated",
        currency: "IDR",
        concept: f.concept,
        value: f.value === null ? null : atStoredPrecision(f.value)!.toFixed(2),
        unit: f.unit,
        rawPath: f.rawPath,
        providerFetchedAt: f.providerFetchedAt,
        validation: f.validation,
        periodStart: f.periodStart,
        periodEnd: f.periodEnd,
        publishedAt: null,
        sourceDocHash: `${f.concept}:${f.fiscalYear}Q${f.fiscalQuarter}:${f.periodBasis}`,
        version: (latest?.version ?? 0) + 1,
        source: ARJUM_PROVIDER,
      })
      .onConflictDoNothing();
    if (latest) revised += 1;
    else inserted += 1;
  }
  return { inserted, revised };
}

/**
 * Ambil + simpan laporan keuangan satu saham (4 request, lihat FINANCIAL_REQUESTS).
 * Basis kuartal diuji dari laba rugi; uji yang gagal tidak menghentikan
 * penyimpanan laporan mentah.
 */
export async function ingestFinancialsForCode(
  db: Db,
  provider: Pick<ArjumProvider, "financialStatements">,
  instrumentId: string,
  code: string,
  batchId: string,
  requests = FINANCIAL_REQUESTS,
): Promise<FinancialsIngestResult> {
  const all: ProviderReportItem[] = [];
  const issues: ReportIssue[] = [];
  for (const req of requests) {
    const parsed = await provider.financialStatements(code, { reportType: req.reportType, period: req.period, limit: req.limit });
    const { items, issues: itemIssues } = parseReportItems(parsed.data, { code, ...req });
    all.push(...items);
    issues.push(...itemIssues.map((i) => ({ ...i, message: `${req.reportType}/${req.period}: ${i.message}` })));
  }

  const reports = await upsertReports(db, instrumentId, all, batchId);

  const isItems = all.filter((i) => i.reportType === "INCOME_STATEMENT");
  const testPath = FINANCIAL_CONCEPT_MAP.find((m) => m.concept === BASIS_TEST_CONCEPT)!.paths[0]!;
  const basis = detectQuarterBasis(
    isItems.filter((i) => i.period === "quarterly").map((i) => ({ fiscalYear: i.fiscalYear, fiscalQuarter: i.fiscalQuarter, value: valueAt(i.data, testPath) })),
    isItems.filter((i) => i.period === "annually").map((i) => ({ fiscalYear: i.fiscalYear, value: valueAt(i.data, testPath) })),
  );
  if (basis.basis === "inconsistent") {
    issues.push({ severity: "warning", message: `Basis kuartal laba rugi tidak konsisten terhadap tahunan: ${JSON.stringify(basis.checks)}` });
  }

  const facts = normalizeFacts(all, basis.basis);
  const factResult = await upsertFacts(db, instrumentId, facts);
  return {
    reportsInserted: reports.inserted,
    reportsRevised: reports.revised,
    factsInserted: factResult.inserted,
    factsRevised: factResult.revised,
    basis,
    issues,
  };
}
