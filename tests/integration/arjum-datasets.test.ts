import "@/server/load-env";

import { readFileSync } from "node:fs";

import { and, eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// File ini menguji MEKANISME jadwal dataset (termasuk dataset harga terpilih),
// jadi semua saklar fitur diaktifkan di sini. Pemblokiran oleh saklar diuji
// terpisah di tests/domain/features.test.ts.
vi.mock("@/lib/features", async (orig) => {
  const real = await orig<typeof import("@/lib/features")>();
  const all = Object.fromEntries(Object.keys(real.FEATURES).map((k) => [k, true]));
  return { ...real, FEATURES: all, datasetEnabledByFeature: () => true };
});

import * as schema from "@/server/db/schema";
import { ForbiddenError } from "@/server/auth/errors";
import { updateDatasetScheduleCore } from "@/features/admin/core";
import { ingestFinancialsForCode } from "@/server/ingestion/financials-store";
import { DEFAULT_HANDLERS, insidersHandler, runDatasetJobs, storeBrokerSummary } from "@/server/jobs/datasets";
import { computeInstrumentSnapshots } from "@/server/services/metrics";
import type { ArjumProvider } from "@/server/providers/arjum/adapter";
import { ArjumAuthError } from "@/server/providers/arjum/errors";
import {
  arjumBrokerSummaryResponseSchema,
  arjumFinancialStatementsResponseSchema,
  arjumPriceListResponseSchema,
  arjumPriceResponseSchema,
} from "@/server/providers/arjum/schemas";
import { reserveQuota } from "@/server/quota/budget";

// Tanpa request ke Arjum: provider palsu memakai fixture respons nyata yang
// disanitasi dan memesan kuota di DB seperti provider asli. Tanggal "now"
// lampau agar kuota hari ini milik worker sungguhan tidak tersentuh.

const connectionString = process.env.DATABASE_URL;
const NOW = new Date("2026-09-12T19:00:00+07:00"); // Sabtu → pembaruan harian dianggap selesai
const CODES = ["ZFINA", "ZFINB", "ZFINC"];
const fixture = (name: string) => JSON.parse(readFileSync(`fixtures/arjum/${name}`, "utf8"));

/** Laba rugi kuartalan 2025Q1–Q4 + 2026Q1 mandiri, tahunan 2025 = jumlahnya, neraca sederhana. */
function financialBody(code: string, reportType: string, period: string, laba = 100) {
  const isItem = (year: number, quarter: number, value: number, eps: number) => ({
    year: String(year),
    quarter: String(quarter),
    label: `Q${quarter} ${year}`,
    fetched_at: "2026-09-01 10:00:00",
    data: {
      laba_rugi: value,
      laba_rugi_yang_dapat_diatribusikan: { laba_rugi_yang_dapat_diatribusikan_ke_entitas_induk: value },
      laba_rugi_per_saham: { total: 0, laba_per_saham_dasar_diatribusikan_kepada_pemilik_entitas_induk: { total: eps } },
    },
  });
  if (reportType === "INCOME_STATEMENT" && period === "quarterly") {
    return { stock_code: code, report_type: reportType, period, count: 5, items: [isItem(2026, 1, laba, 10), isItem(2025, 4, 100, 10), isItem(2025, 3, 100, 10), isItem(2025, 2, 100, 10), isItem(2025, 1, 100, 10)] };
  }
  if (reportType === "INCOME_STATEMENT") {
    return { stock_code: code, report_type: reportType, period, count: 1, items: [{ ...isItem(2025, 4, 400, 40), quarter: null }] };
  }
  return { stock_code: code, report_type: reportType, period, count: 0, items: [] };
}

function fakeProvider(
  db: ReturnType<typeof drizzle<typeof schema>>,
  calls: string[],
  opts: { laba?: number; failAuth?: boolean; now?: Date; today?: boolean; skip?: string[] } = {},
) {
  const res = <T>(body: unknown, parsed: T) => ({ data: parsed, response: { body, httpStatus: 200, contentType: "application/json", durationMs: 1, attempts: 1, responseHeaders: {} } });
  const reserve = () => reserveQuota(db, "arjum", 990, 1, NOW);
  return {
    async financialStatements(code: string, o: { reportType: string; period: string }) {
      await reserve();
      calls.push(`fin:${code}:${o.reportType}:${o.period}`);
      if (opts.failAuth) throw new ArjumAuthError(401, null);
      const body = financialBody(code, o.reportType, o.period, opts.laba);
      return res(body, arjumFinancialStatementsResponseSchema.parse(body));
    },
    async price(code: string) {
      await reserve();
      calls.push(`price:${code}`);
      const body = { ...fixture("price-BBCA.json"), code };
      return res(body, arjumPriceResponseSchema.parse(body));
    },
    async priceList(codes: string[]) {
      // Seperti penyedia: 1 kuota per kode yang DIKIRIM (termasuk yang dilewati).
      await reserveQuota(db, "arjum", 990, codes.length, opts.now ?? NOW);
      calls.push(`list:${codes.join(",")}`);
      const base = fixture("price-list-weekend.json").stocks.BBCA;
      const stocks = Object.fromEntries(
        codes.filter((c) => !opts.skip?.includes(c)).map((c) => [c, { ...base, code: c, ...(opts.today ? { source_date: undefined, data_ts: "10:00:00", quote_age_ms: 500 } : { source_date: "2026-09-11" }) }]),
      );
      const body = { count: Object.keys(stocks).length, stocks, market: { status: opts.today ? "open" : "closed", label: "uji" } };
      return { ...res(body, arjumPriceListResponseSchema.parse(body)), requested: codes, quotaCost: codes.length };
    },
    async health() {
      await reserve();
      calls.push("health");
      return res({ ok: true }, { ok: true });
    },
  } as unknown as ArjumProvider;
}

describe.skipIf(!connectionString)("dataset Arjum tambahan: simpan, revisi, budget, resume, otorisasi", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const ids: string[] = [];

  beforeAll(async () => {
    client = postgres(connectionString!, { max: 1, prepare: false });
    db = drizzle(client, { schema });
    for (const code of CODES) {
      const [row] = await db.insert(schema.instruments).values({ code, name: `Uji ${code}`, dataMode: "live" }).onConflictDoNothing().returning();
      ids.push(row?.id ?? (await db.select().from(schema.instruments).where(eq(schema.instruments.code, code)))[0]!.id);
    }
    await db.insert(schema.dailyBars).values(
      ids.map((instrumentId) => ({ instrumentId, tradingDate: "2026-09-11", open: "1000", high: "1000", low: "1000", close: "1000", volume: 1_000n, value: "1000000", source: "arjum", batchId: "test-datasets" })),
    ).onConflictDoNothing();
    await db.insert(schema.marketCapSnapshots).values({ instrumentId: ids[0]!, snapshotDate: "2026-09-11", listedShares: "100", source: "arjum", batchId: "test-datasets" }).onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(schema.financialFacts).where(inArray(schema.financialFacts.instrumentId, ids));
    await db.delete(schema.financialReports).where(inArray(schema.financialReports.instrumentId, ids));
    await db.delete(schema.latestQuotes).where(inArray(schema.latestQuotes.instrumentId, ids));
    await db.delete(schema.insiderTransactions).where(inArray(schema.insiderTransactions.instrumentId, ids));
    const summaries = await db.select({ id: schema.brokerSummaries.id }).from(schema.brokerSummaries).where(inArray(schema.brokerSummaries.instrumentId, ids));
    if (summaries.length) await db.delete(schema.brokerSummaries).where(inArray(schema.brokerSummaries.id, summaries.map((s) => s.id)));
    await db.delete(schema.marketCapSnapshots).where(inArray(schema.marketCapSnapshots.instrumentId, ids));
    await db.delete(schema.dailyBars).where(inArray(schema.dailyBars.instrumentId, ids));
    await db.delete(schema.dataQualityIssues).where(inArray(schema.dataQualityIssues.instrumentId, ids));
    await db.delete(schema.instruments).where(inArray(schema.instruments.id, ids));
    await db.delete(schema.datasetFetchState).where(inArray(schema.datasetFetchState.code, CODES));
    await db.delete(schema.providerHealthChecks).where(like(schema.providerHealthChecks.provider, "arjum"));
    await db.delete(schema.providerQuotaUsage).where(and(eq(schema.providerQuotaUsage.provider, "arjum"), eq(schema.providerQuotaUsage.quotaDate, "2026-09-12")));
    await client.end();
  });

  it("laporan keuangan: idempotent, revisi = versi baru (lama disimpan), fakta masuk rasio", async () => {
    const calls: string[] = [];
    const first = await ingestFinancialsForCode(db, fakeProvider(db, calls), ids[0]!, CODES[0]!, "t1");
    expect(first.basis.basis).toBe("standalone");
    expect(first.reportsInserted).toBe(6);
    expect(first.factsInserted).toBeGreaterThan(0);

    const again = await ingestFinancialsForCode(db, fakeProvider(db, calls), ids[0]!, CODES[0]!, "t2");
    expect(again).toMatchObject({ reportsInserted: 0, reportsRevised: 0, factsInserted: 0, factsRevised: 0 });

    const revised = await ingestFinancialsForCode(db, fakeProvider(db, calls, { laba: 120 }), ids[0]!, CODES[0]!, "t3");
    expect(revised.reportsRevised).toBe(1);
    const versions = await db
      .select({ version: schema.financialFacts.version, value: schema.financialFacts.value })
      .from(schema.financialFacts)
      .where(and(eq(schema.financialFacts.instrumentId, ids[0]!), eq(schema.financialFacts.concept, "net_income_total"), eq(schema.financialFacts.fiscalYear, 2026)));
    expect(versions.map((v) => [v.version, Number(v.value)]).sort()).toEqual([[1, 100], [2, 120]]);
    // Tahunan tidak masuk sebagai kuartal; published_at kosong (sumber tidak menyediakannya).
    const annual = await db.select().from(schema.financialFacts).where(and(eq(schema.financialFacts.instrumentId, ids[0]!), eq(schema.financialFacts.periodBasis, "annual")));
    expect(annual.length).toBeGreaterThan(0);
    expect(annual.every((f) => f.publishedAt === null && f.isYtd === false)).toBe(true);

    // PER = kapitalisasi (1000 × 100 saham) ÷ laba TTM versi terbaru (100+100+100+120 = 420). PBV tanpa neraca → belum tersedia.
    const computed = await computeInstrumentSnapshots(db, "2026-09-11", "live");
    const mine = computed.find((c) => c.instrumentId === ids[0]);
    const snap = (m: string) => mine!.snapshots.find((s) => s.metric === m)!;
    expect(snap("per").status).toBe("ok");
    expect(snap("per").value).toBeCloseTo(100_000 / 420, 6);
    expect(snap("pbv").status).toBe("null_missing");
    expect(snap("market_cap")).toMatchObject({ value: 100_000, status: "ok" });
  });

  it("basis kuartal belum terverifikasi tersimpan sebagai quarter_unverified dan tidak masuk TTM", async () => {
    const body = (rt: string, period: string) => {
      if (rt !== "INCOME_STATEMENT" || period !== "quarterly") return { stock_code: CODES[1], report_type: rt, period, count: 0, items: [] };
      const items = [1, 2, 3].map((q) => ({ year: "2026", quarter: String(q), data: { laba_rugi: 100 } }));
      return { stock_code: CODES[1], report_type: rt, period, count: 3, items };
    };
    const provider = { async financialStatements(_c: string, o: { reportType: string; period: string }) {
      const b = body(o.reportType, o.period);
      return { data: arjumFinancialStatementsResponseSchema.parse(b), response: {} };
    } } as unknown as ArjumProvider;
    const r = await ingestFinancialsForCode(db, provider, ids[1]!, CODES[1]!, "unv");
    expect(r.basis.basis).toBe("unverified");
    const facts = await db.select().from(schema.financialFacts).where(eq(schema.financialFacts.instrumentId, ids[1]!));
    expect(new Set(facts.map((f) => f.periodBasis))).toEqual(new Set(["quarter_unverified"]));
  });

  it("broker summary: rentang sama diganti utuh, rentang lain disimpan terpisah", async () => {
    const body = { ...fixture("broker-summary-BBCA.json"), stock_code: CODES[1] };
    const parsed = arjumBrokerSummaryResponseSchema.parse(body);
    await storeBrokerSummary(db, ids[1]!, CODES[1]!, parsed, {}, "b1");
    await storeBrokerSummary(db, ids[1]!, CODES[1]!, parsed, {}, "b2");
    await storeBrokerSummary(db, ids[1]!, CODES[1]!, { ...parsed, broker_start_date: "2026-09-28" }, {}, "b3");
    const summaries = await db.select().from(schema.brokerSummaries).where(eq(schema.brokerSummaries.instrumentId, ids[1]!));
    expect(summaries).toHaveLength(2);
    const rows = await db.select().from(schema.brokerSummaryRows).where(inArray(schema.brokerSummaryRows.summaryId, summaries.map((s) => s.id)));
    expect(rows).toHaveLength(40);
    // Volume harian tidak tersimpan untuk kode uji; 20 broker teratas: Σ beli ≠ Σ jual → parsial.
    expect(summaries.every((s) => s.coverage === "partial")).toBe(true);
  });

  it("jadwal: anggaran per dataset, resume dari checkpoint, cadangan OHLCV, otorisasi admin", async () => {
    await expect(updateDatasetScheduleCore("user", { dataset: "price", enabled: true, scope: "list", codes: "ZFINA", intervalMinutes: 30, dailyBudget: 2, priority: 10 })).rejects.toBeInstanceOf(ForbiddenError);
    // Harga batch boleh untuk semua saham (scope "priced"); pengaman biaya = anggaran harian dataset.
    expect((await updateDatasetScheduleCore("admin", { dataset: "price", enabled: true, scope: "priced", codes: "", intervalMinutes: 30, dailyBudget: 2, priority: 10 })).ok).toBe(true);
    expect((await updateDatasetScheduleCore("admin", { dataset: "price", enabled: true, scope: "list", codes: "ZFINA", intervalMinutes: 5, dailyBudget: 2, priority: 10 })).ok).toBe(false);
    expect((await updateDatasetScheduleCore("admin", { dataset: "price", enabled: true, scope: "list", codes: "zfina, ZFINB ZFINC", intervalMinutes: 30, dailyBudget: 2, priority: 10 })).ok).toBe(true);
    await db.update(schema.datasetSchedules).set({ enabled: false }).where(inArray(schema.datasetSchedules.dataset, ["health", "financials", "broker_summary"]));

    const calls: string[] = [];
    const log = () => {};
    // Senin 10:00 WIB (jam bursa). Kuota tanggal lampau, tidak menyentuh kuota worker sungguhan.
    const MON = new Date("2026-09-14T10:00:00+07:00");
    const qDate = "2026-09-14";
    const setUsed = (used: number) =>
      db.insert(schema.providerQuotaUsage).values({ provider: "arjum", quotaDate: qDate, used, dailyLimit: 990 }).onConflictDoUpdate({
        target: [schema.providerQuotaUsage.provider, schema.providerQuotaUsage.quotaDate],
        set: { used },
      });
    const resetPrice = () => db.update(schema.datasetSchedules).set({ usedToday: 0, usedDate: null, lastRunAt: null }).where(eq(schema.datasetSchedules.dataset, "price"));

    await resetPrice();
    await db.delete(schema.datasetFetchState).where(eq(schema.datasetFetchState.dataset, "price"));
    // Di luar jam bursa (Sabtu) → tidak ada request sama sekali.
    let r = await runDatasetJobs(db, fakeProvider(db, calls), DEFAULT_HANDLERS, { dailyDone: true, log, now: NOW, only: ["price"] });
    expect(calls).toEqual([]);
    expect(r[0]!.stopped).toContain("luar jam bursa");

    // Hari kerja belum final → cadangan OHLCV (semua saham berharga + 2) menahan dataset bila kuota tipis.
    await setUsed(985);
    r = await runDatasetJobs(db, fakeProvider(db, calls, { now: MON, today: true }), DEFAULT_HANDLERS, { dailyDone: false, log, now: MON, only: ["price"] });
    expect(calls).toEqual([]);
    expect(r[0]!.stopped).toContain("dicadangkan");

    // Anggaran dataset 2: canary 1 kode, lalu sisa anggaran (1 kode) dalam satu request batch.
    await setUsed(0);
    await resetPrice();
    r = await runDatasetJobs(db, fakeProvider(db, calls, { now: MON, today: true }), DEFAULT_HANDLERS, { dailyDone: true, log, now: MON, only: ["price"] });
    expect(calls).toEqual(["list:ZFINA", "list:ZFINB"]);
    expect(r[0]).toMatchObject({ codesDone: 2, requests: 2 });
    const [q] = await db.select().from(schema.latestQuotes).where(eq(schema.latestQuotes.instrumentId, ids[0]!));
    expect(q).toMatchObject({ isFallbackClose: false, sourceDate: qDate, change: "-900.0000", prevClose: "6075.0000", marketState: "open" });

    // Interval berlaku per putaran: tick berikutnya dalam interval tidak memanggil penyedia.
    calls.length = 0;
    await db.update(schema.datasetSchedules).set({ dailyBudget: 10, usedToday: 0 }).where(eq(schema.datasetSchedules.dataset, "price"));
    r = await runDatasetJobs(db, fakeProvider(db, calls, { now: MON, today: true }), DEFAULT_HANDLERS, { dailyDone: true, log, now: new Date(MON.getTime() + 10 * 60_000), only: ["price"] });
    expect(calls).toEqual([]);

    // Pasar libur: canary mendapati penutupan lama → berhenti setelah 1 kode (biaya 1, bukan semua).
    const later = new Date(MON.getTime() + 2 * 3600_000);
    await db.delete(schema.datasetFetchState).where(eq(schema.datasetFetchState.dataset, "price"));
    r = await runDatasetJobs(db, fakeProvider(db, calls, { now: later }), DEFAULT_HANDLERS, { dailyDone: true, log, now: later, only: ["price"] });
    expect(calls).toEqual(["list:ZFINA"]);
    expect(r[0]).toMatchObject({ codesDone: 1, requests: 1 });
    expect(r[0]!.stopped).toContain("Belum ada transaksi");

    // Kode yang dilewati penyedia tetap ditagih dan ditandai gagal; kode lain tersimpan.
    calls.length = 0;
    const later2 = new Date(MON.getTime() + 4 * 3600_000);
    await db.delete(schema.datasetFetchState).where(eq(schema.datasetFetchState.dataset, "price"));
    r = await runDatasetJobs(db, fakeProvider(db, calls, { now: later2, today: true, skip: ["ZFINC"] }), DEFAULT_HANDLERS, { dailyDone: true, log, now: later2, only: ["price"] });
    expect(calls).toEqual(["list:ZFINA", "list:ZFINB,ZFINC"]);
    expect(r[0]).toMatchObject({ codesDone: 2, codesFailed: 1, requests: 3 });
    const [st] = await db.select().from(schema.datasetFetchState).where(and(eq(schema.datasetFetchState.dataset, "price"), eq(schema.datasetFetchState.code, "ZFINC")));
    expect(st).toMatchObject({ lastStatus: "failed" });
    await db.delete(schema.providerQuotaUsage).where(and(eq(schema.providerQuotaUsage.provider, "arjum"), eq(schema.providerQuotaUsage.quotaDate, qDate)));
    await db.update(schema.datasetSchedules).set({ enabled: false, codes: [], usedToday: 0 }).where(eq(schema.datasetSchedules.dataset, "price"));
  });

  it("401 menghentikan seluruh dataset (tidak membakar kuota untuk kode lain)", async () => {
    await updateDatasetScheduleCore("admin", { dataset: "financials", enabled: true, scope: "list", codes: "ZFINB, ZFINC", intervalMinutes: 1440, dailyBudget: 40, priority: 20 });
    const calls: string[] = [];
    const r = await runDatasetJobs(db, fakeProvider(db, calls, { failAuth: true }), DEFAULT_HANDLERS, { dailyDone: true, log: () => {}, now: NOW, only: ["financials"] });
    expect(r[0]).toMatchObject({ codesDone: 0, codesFailed: 1 });
    expect(r[0]!.stopped).toContain("ArjumAuthError");
    expect(calls).toHaveLength(1);
    await db.update(schema.datasetSchedules).set({ enabled: false, codes: [], usedToday: 0 }).where(eq(schema.datasetSchedules.dataset, "financials"));
  });

  it("insider: halaman 1 + lanjut dari checkpoint, dedup lintas halaman, berhenti saat lengkap", async () => {
    const base = fixture("insiders-BBCA-p1.json");
    const calls: number[] = [];
    // 4 halaman; halaman 2 sengaja mengulang 2 baris halaman 1 (daftar bergeser).
    const itemsFor = (page: number) => base.items.map((it: Record<string, unknown>) => ({ ...it, date: `2025-0${page}-15` }));
    const pageBody = (page: number) => ({
      ...base,
      stock_code: CODES[2],
      page,
      total_pages: 4,
      total: 34,
      items:
        page === 2
          ? [...itemsFor(1).slice(0, 2), ...itemsFor(2).slice(2)]
          : itemsFor(page),
    });
    const provider = { async insiders(_code: string, o: { page: number }) {
      calls.push(o.page);
      return { data: pageBody(o.page), response: { body: {}, httpStatus: 200, contentType: "application/json", durationMs: 1, attempts: 1, responseHeaders: {} } };
    } } as unknown as ArjumProvider;
    const ctx = { db, provider, code: CODES[2]!, instrumentId: ids[2]!, batchId: "ins", now: NOW };
    expect(await insidersHandler(ctx)).toContain("halaman 1,2,3 dari 4");
    expect(calls).toEqual([1, 2, 3]);
    expect(await insidersHandler(ctx)).toContain("riwayat lengkap");
    expect(calls).toEqual([1, 2, 3, 1, 4]);
    // Halaman 1 diambil dua kali dan 2 baris halaman 2 identik dengan halaman 1 → tidak ada duplikat.
    const stored = await db.select().from(schema.insiderTransactions).where(eq(schema.insiderTransactions.instrumentId, ids[2]!));
    const unique = new Set(stored.map((r) => r.dedupKey));
    expect(unique.size).toBe(stored.length);
    expect(stored.length).toBe(38); // 10 + 10 + 10 + 10 − 2 baris identik dengan halaman 1
    await insidersHandler(ctx);
    expect(calls.slice(5)).toEqual([1]); // lengkap → hanya halaman terbaru
    await db.delete(schema.datasetFetchState).where(and(eq(schema.datasetFetchState.dataset, "insiders"), eq(schema.datasetFetchState.code, CODES[2]!)));
  });
});
