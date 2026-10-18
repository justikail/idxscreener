import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "@/server/db/schema";
import { assessBrokerCoverage, brokerParamsKey, normalizeBrokerSummary } from "@/server/ingestion/arjum-broker";
import { normalizeListQuote, normalizeQuote } from "@/server/ingestion/arjum-price";
import { normalizeInsiders } from "@/server/ingestion/arjum-insiders";
import { normalizeAccumulation, normalizeSeasonal } from "@/server/ingestion/arjum-derived";
import { ingestFinancialsForCode, FINANCIAL_REQUESTS } from "@/server/ingestion/financials-store";
import { ArjumAuthError, ArjumNonJsonError } from "@/server/providers/arjum/errors";
import type { ArjumProvider } from "@/server/providers/arjum/adapter";
import { ARJUM_PROVIDER, arjumDailyBudget, assertStockCode } from "@/server/providers/arjum/config";
import { QuotaExhaustedError, effectiveRemaining, getQuotaUsage, quotaDateWib } from "@/server/quota/budget";
import { datasetEnabledByFeature } from "@/lib/features";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Dataset tambahan di luar OHLCV harian. Semua NONAKTIF secara bawaan kecuali
 * health (interval 3 jam). OHLCV ±957 saham sudah memakai hampir seluruh
 * kuota 1.000/hari, jadi admin mengaktifkan dataset lain untuk daftar kode
 * terbatas dengan anggaran kecil. Lihat docs/data-sources.md §jadwal.
 */
/** Halaman insider maksimum per kode per putaran (10 baris/halaman). */
export const INSIDER_PAGES_PER_RUN = 3;

export const DATASETS = ["health", "price", "financials", "broker_summary", "insiders", "broker_accumulation", "seasonal"] as const;
export type Dataset = (typeof DATASETS)[number];

export interface DatasetDefault {
  enabled: boolean;
  intervalMinutes: number;
  dailyBudget: number;
  priority: number;
  /** Perkiraan request per kode (untuk cek anggaran sebelum mulai). */
  costPerCode: number;
  /** Boleh berjalan sebelum pembaruan OHLCV harian selesai (dengan cadangan). */
  intraday: boolean;
  label: string;
}

export const DATASET_DEFAULTS: Record<Dataset, DatasetDefault> = {
  health: { enabled: true, intervalMinutes: 180, dailyBudget: 8, priority: 1, costPerCode: 1, intraday: true, label: "Status API penyedia" },
  price: { enabled: false, intervalMinutes: 60, dailyBudget: 0, priority: 10, costPerCode: 1, intraday: true, label: "Harga terbaru (batch, bisa semua saham)" },
  financials: { enabled: false, intervalMinutes: 7 * 24 * 60, dailyBudget: 0, priority: 20, costPerCode: FINANCIAL_REQUESTS.length, intraday: false, label: "Laporan keuangan" },
  broker_summary: { enabled: false, intervalMinutes: 24 * 60, dailyBudget: 0, priority: 30, costPerCode: 1, intraday: false, label: "Ringkasan broker (sesi terakhir)" },
  insiders: { enabled: false, intervalMinutes: 7 * 24 * 60, dailyBudget: 0, priority: 40, costPerCode: INSIDER_PAGES_PER_RUN, intraday: false, label: "Transaksi insider" },
  broker_accumulation: { enabled: false, intervalMinutes: 7 * 24 * 60, dailyBudget: 0, priority: 50, costPerCode: 1, intraday: false, label: "Akumulasi broker (olahan penyedia)" },
  seasonal: { enabled: false, intervalMinutes: 30 * 24 * 60, dailyBudget: 0, priority: 60, costPerCode: 1, intraday: false, label: "Seasonality (olahan penyedia)" },
};

export async function ensureDefaultSchedules(db: Db): Promise<void> {
  await db
    .insert(schema.datasetSchedules)
    .values(
      DATASETS.map((d) => ({
        dataset: d,
        enabled: DATASET_DEFAULTS[d].enabled,
        intervalMinutes: DATASET_DEFAULTS[d].intervalMinutes,
        dailyBudget: DATASET_DEFAULTS[d].dailyBudget,
        priority: DATASET_DEFAULTS[d].priority,
        scope: "list",
      })),
    )
    .onConflictDoNothing();
}

export type DatasetHandler = (ctx: { db: Db; provider: ArjumProvider; code: string; instrumentId: string; batchId: string; now: Date }) => Promise<string>;

/** Kode yang jatuh tempo: belum pernah sukses atau sukses terakhir lebih lama dari interval. Urut tertua dulu (checkpoint). */
export async function dueCodes(db: Db, schedule: typeof schema.datasetSchedules.$inferSelect, now: Date, limit: number): Promise<Array<{ code: string; instrumentId: string }>> {
  let candidates: Array<{ code: string; instrumentId: string }>;
  if (schedule.scope === "priced") {
    candidates = await db.execute<{ code: string; instrument_id: string; [k: string]: unknown }>(sql`
      select i.code, i.id as instrument_id from ${schema.instruments} i
      where i.data_mode = 'live' and i.status = 'active'
        and exists (select 1 from ${schema.dailyBars} d where d.instrument_id = i.id and d.source = 'arjum')
      order by i.code
    `).then((rows) => rows.map((r) => ({ code: r.code, instrumentId: r.instrument_id })));
  } else {
    const codes = [...new Set(schedule.codes.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z0-9]{1,8}$/.test(c)))];
    if (codes.length === 0) return [];
    const rows = await db
      .select({ code: schema.instruments.code, instrumentId: schema.instruments.id })
      .from(schema.instruments)
      // Hanya instrumen LIVE: kode demo yang kebetulan sama tidak menerima data real.
      .where(and(inArray(schema.instruments.code, codes), eq(schema.instruments.dataMode, "live")));
    candidates = rows;
  }
  if (candidates.length === 0) return [];
  const state = await db
    .select({
      code: schema.datasetFetchState.code,
      lastSuccessAt: schema.datasetFetchState.lastSuccessAt,
      lastAttemptAt: schema.datasetFetchState.lastAttemptAt,
      checkpoint: schema.datasetFetchState.checkpoint,
    })
    .from(schema.datasetFetchState)
    .where(eq(schema.datasetFetchState.dataset, schedule.dataset));
  const byCode = new Map(state.map((s) => [s.code, s]));
  const cutoff = now.getTime() - schedule.intervalMinutes * 60_000;
  // Kegagalan dicoba lagi paling cepat setelah 1 jam, agar error berulang tidak membakar kuota.
  const retryCutoff = now.getTime() - 60 * 60_000;
  return candidates
    .filter((c) => {
      const s = byCode.get(c.code);
      if (!s) return true;
      // Checkpoint belum selesai (mis. halaman insider lama) → lanjutkan tanpa menunggu interval.
      const unfinished = (s.checkpoint as { complete?: boolean } | null)?.complete === false;
      if (!unfinished && s.lastSuccessAt && s.lastSuccessAt.getTime() > cutoff) return false;
      if (s.lastAttemptAt && s.lastAttemptAt.getTime() > retryCutoff && (!s.lastSuccessAt || s.lastAttemptAt > s.lastSuccessAt)) return false;
      return true;
    })
    // Tertua dulu (checkpoint); seri → urut kode agar deterministik.
    .sort((a, b) => (byCode.get(a.code)?.lastSuccessAt?.getTime() ?? 0) - (byCode.get(b.code)?.lastSuccessAt?.getTime() ?? 0) || a.code.localeCompare(b.code))
    .slice(0, limit);
}

export async function markState(db: Db, dataset: string, code: string, ok: boolean, note: string | null, now: Date) {
  await db
    .insert(schema.datasetFetchState)
    .values({ dataset, code, lastAttemptAt: now, lastSuccessAt: ok ? now : null, lastStatus: ok ? "success" : "failed", lastError: ok ? null : note?.slice(0, 1000) ?? null })
    .onConflictDoUpdate({
      target: [schema.datasetFetchState.dataset, schema.datasetFetchState.code],
      set: ok
        ? { lastAttemptAt: now, lastSuccessAt: now, lastStatus: "success", lastError: null }
        : { lastAttemptAt: now, lastStatus: "failed", lastError: note?.slice(0, 1000) ?? null },
    });
}

export interface DatasetRunSummary {
  dataset: string;
  codesDone: number;
  codesFailed: number;
  requests: number;
  stopped: string | null;
}

/**
 * Sisa kuota yang harus dipertahankan untuk pembaruan OHLCV harian bila
 * pembaruan hari itu belum final: satu request per saham berharga + 2.
 */
export async function dailyReserve(db: Db): Promise<number> {
  const [row] = await db.execute<{ n: number; [k: string]: unknown }>(sql`
    select count(*)::int as n from ${schema.instruments} i
    where i.data_mode = 'live' and i.status = 'active'
      and exists (select 1 from ${schema.dailyBars} d where d.instrument_id = i.id and d.source = 'arjum')
  `);
  return (row?.n ?? 0) + 2;
}

/**
 * Jalankan dataset yang aktif dan jatuh tempo, urut prioritas. Pemanggil
 * memegang lock ingest. `dailyDone` = pembaruan OHLCV hari ini sudah final
 * (atau akhir pekan); bila belum, hanya dataset intraday yang boleh jalan dan
 * kuota untuk OHLCV tetap dicadangkan.
 */
export async function runDatasetJobs(
  db: Db,
  provider: ArjumProvider,
  handlers: Partial<Record<Dataset, DatasetHandler>>,
  opts: { dailyDone: boolean; log: (line: string) => void; now?: Date; only?: Dataset[] },
): Promise<DatasetRunSummary[]> {
  await ensureDefaultSchedules(db);
  const now = opts.now ?? new Date();
  const today = quotaDateWib(now);
  const dailyLimit = arjumDailyBudget();
  const reserve = opts.dailyDone ? 0 : await dailyReserve(db);
  const schedules = await db.select().from(schema.datasetSchedules).where(eq(schema.datasetSchedules.enabled, true)).orderBy(asc(schema.datasetSchedules.priority));
  const results: DatasetRunSummary[] = [];

  for (const schedule of schedules) {
    const dataset = schedule.dataset as Dataset;
    const def = DATASET_DEFAULTS[dataset];
    const handler = handlers[dataset];
    if (!def || !handler) continue;
    // Fitur pemakainya dinonaktifkan (src/lib/features.ts) → datanya tidak diambil.
    if (!datasetEnabledByFeature(dataset)) continue;
    if (opts.only && !opts.only.includes(dataset)) continue;
    if (!opts.dailyDone && !def.intraday) continue;

    const usedToday = schedule.usedDate === today ? schedule.usedToday : 0;
    const budgetLeft = schedule.dailyBudget - usedToday;
    if (budgetLeft < def.costPerCode) continue;

    let targets: Array<{ code: string; instrumentId: string }>;
    if (dataset === "health") {
      const due = !schedule.lastRunAt || now.getTime() - schedule.lastRunAt.getTime() >= schedule.intervalMinutes * 60_000;
      targets = due ? [{ code: "-", instrumentId: "-" }] : [];
    } else if (dataset === "price" && schedule.lastRunAt && now.getTime() - schedule.lastRunAt.getTime() < schedule.intervalMinutes * 60_000) {
      // Harga = potret pasar per putaran: interval berlaku untuk seluruh putaran,
      // sehingga canary "pasar tutup" tidak diulang tiap tick worker.
      targets = [];
    } else {
      targets = await dueCodes(db, schedule, now, Math.floor(budgetLeft / def.costPerCode));
    }
    if (targets.length === 0) continue;

    const summary: DatasetRunSummary = { dataset, codesDone: 0, codesFailed: 0, requests: 0, stopped: null };
    const batchId = `${dataset}-${now.getTime()}`;
    if (dataset === "price") {
      // Harga memakai /api/price/list: banyak kode per request, 1 kuota per kode.
      await runPriceBatches(db, provider, { targets, summary, now, dailyLimit, reserve, budgetLeft, log: opts.log });
    }
    for (const target of dataset === "price" ? [] : targets) {
      const quota = await getQuotaUsage(db, ARJUM_PROVIDER, now);
      if (effectiveRemaining(quota, dailyLimit) - reserve < def.costPerCode) {
        summary.stopped = "Sisa kuota dicadangkan untuk pembaruan harian / habis; dilanjutkan pada kesempatan berikutnya.";
        break;
      }
      if (schedule.dailyBudget - usedToday - summary.requests < def.costPerCode) {
        summary.stopped = "Anggaran harian dataset habis.";
        break;
      }
      const usedBefore = quota?.used ?? 0;
      let ok = false;
      let note: string | null = null;
      try {
        note = await handler({ db, provider, code: target.code, instrumentId: target.instrumentId, batchId, now });
        ok = true;
        summary.codesDone += 1;
      } catch (error) {
        note = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        summary.codesFailed += 1;
        if (error instanceof QuotaExhaustedError || error instanceof ArjumAuthError || error instanceof ArjumNonJsonError) {
          summary.stopped = note;
        }
      }
      const usedAfter = (await getQuotaUsage(db, ARJUM_PROVIDER, now))?.used ?? usedBefore;
      summary.requests += Math.max(0, usedAfter - usedBefore);
      if (target.code !== "-") await markState(db, dataset, target.code, ok, note, now);
      if (summary.stopped) break;
    }

    await db
      .update(schema.datasetSchedules)
      .set({
        usedDate: today,
        usedToday: usedToday + summary.requests,
        // Tidak ada yang dikerjakan (mis. kuota ditahan) → jangan geser jadwal interval.
        ...(summary.codesDone + summary.codesFailed > 0 ? { lastRunAt: now } : {}),
        lastNote: `${summary.codesDone} sukses, ${summary.codesFailed} gagal, ${summary.requests} request${summary.stopped ? ` · berhenti: ${summary.stopped}` : ""}`.slice(0, 1000),
        updatedAt: now,
      })
      .where(eq(schema.datasetSchedules.dataset, dataset));
    opts.log(`[${dataset}] ${summary.codesDone} sukses, ${summary.codesFailed} gagal, ${summary.requests} request${summary.stopped ? ` — ${summary.stopped}` : ""}`);
    results.push(summary);
    if (summary.stopped && /QuotaExhausted|ArjumAuth|NonJson/.test(summary.stopped)) break;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Harga batch (/api/price/list)
// ---------------------------------------------------------------------------

/** Kode per request. Lebih kecil dari batas penyedia (1.000) agar satu kegagalan tidak membuang ratusan kuota. */
export const PRICE_LIST_CHUNK = 200;

/**
 * Jendela pengambilan harga: Senin–Jumat 08:45–17:00 WIB. Di luar itu harga
 * tidak berubah, jadi tidak ada kuota yang dipakai. Hari libur bursa tidak
 * diketahui dari jam saja; untuk itu request pertama tiap putaran hanya
 * SATU kode (canary): bila belum ada transaksi hari ini, putaran berhenti
 * dengan biaya 1 kuota, bukan ±957.
 */
export function inPriceWindow(now: Date): boolean {
  const wib = new Date(now.getTime() + 7 * 3600_000);
  const day = wib.getUTCDay();
  const minutes = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  return day >= 1 && day <= 5 && minutes >= 8 * 60 + 45 && minutes <= 17 * 60;
}

async function runPriceBatches(
  db: Db,
  provider: ArjumProvider,
  ctx: {
    targets: Array<{ code: string; instrumentId: string }>;
    summary: DatasetRunSummary;
    now: Date;
    dailyLimit: number;
    reserve: number;
    budgetLeft: number;
    log: (line: string) => void;
  },
): Promise<void> {
  const { targets, summary, now } = ctx;
  if (!inPriceWindow(now)) {
    summary.stopped = "Di luar jam bursa (Senin–Jumat 08:45–17:00 WIB); tidak ada request.";
    return;
  }
  const today = quotaDateWib(now);
  let i = 0;
  let first = true;
  while (i < targets.length) {
    const quota = await getQuotaUsage(db, ARJUM_PROVIDER, now);
    const room = Math.min(effectiveRemaining(quota, ctx.dailyLimit) - ctx.reserve, ctx.budgetLeft - summary.requests);
    if (room < 1) {
      summary.stopped = "Sisa kuota/anggaran dataset habis atau dicadangkan untuk pembaruan harian; dilanjutkan pada kesempatan berikutnya.";
      break;
    }
    const chunk = targets.slice(i, i + Math.min(first ? 1 : PRICE_LIST_CHUNK, room));
    i += chunk.length;
    const usedBefore = quota?.used ?? 0;
    const okCodes: string[] = [];
    const failed: Array<{ code: string; note: string }> = [];
    let canaryStale = false;
    try {
      const res = await provider.priceList(chunk.map((t) => t.code));
      const rows: Array<typeof schema.latestQuotes.$inferInsert> = [];
      const issues: Array<typeof schema.dataQualityIssues.$inferInsert> = [];
      for (const t of chunk) {
        const entry = res.data.stocks[t.code];
        if (!entry) {
          failed.push({ code: t.code, note: "Tidak ada di respons (kode dilewati penyedia)." });
          continue;
        }
        const { quote, issue } = normalizeListQuote(entry, t.code, today, res.data.market);
        if (issue) issues.push({ instrumentId: t.instrumentId, severity: quote ? "warning" : "error", message: `[${t.code}] harga batch: ${issue}`.slice(0, 2000) });
        if (!quote) {
          failed.push({ code: t.code, note: issue ?? "Entri ditolak." });
          continue;
        }
        if (first && quote.isFallbackClose) canaryStale = true;
        rows.push({
          instrumentId: t.instrumentId,
          provider: ARJUM_PROVIDER,
          lastPrice: quote.lastPrice?.toString() ?? null,
          freq: quote.freq !== null ? Math.trunc(quote.freq) : null,
          lot: quote.lot?.toString() ?? null,
          value: quote.value?.toString() ?? null,
          sourceDate: quote.sourceDate,
          dataTs: quote.dataTs,
          servedTs: quote.servedTs,
          marketState: quote.marketState,
          marketLabel: quote.marketLabel,
          noTradeToday: quote.noTradeToday,
          quoteAgeMs: quote.quoteAgeMs,
          isFallbackClose: quote.isFallbackClose,
          change: quote.change?.toString() ?? null,
          prevClose: quote.prevClose?.toString() ?? null,
          vwap: quote.vwap?.toString() ?? null,
          fetchedAt: now,
        });
        okCodes.push(t.code);
      }
      if (rows.length > 0) {
        const ex = (col: string) => sql.raw(`excluded.${col}`);
        await db
          .insert(schema.latestQuotes)
          .values(rows)
          .onConflictDoUpdate({
            target: schema.latestQuotes.instrumentId,
            set: {
              provider: ex("provider"), lastPrice: ex("last_price"), freq: ex("freq"), lot: ex("lot"), value: ex("value"),
              sourceDate: ex("source_date"), dataTs: ex("data_ts"), servedTs: ex("served_ts"), marketState: ex("market_state"),
              marketLabel: ex("market_label"), noTradeToday: ex("no_trade_today"), quoteAgeMs: ex("quote_age_ms"),
              isFallbackClose: ex("is_fallback_close"), change: ex("change"), prevClose: ex("prev_close"), vwap: ex("vwap"), fetchedAt: ex("fetched_at"),
            },
          });
      }
      if (issues.length > 0) await db.insert(schema.dataQualityIssues).values(issues.slice(0, 50));
      if (res.quotaCost !== null && res.quotaCost !== chunk.length) {
        ctx.log(`  [price] X-Quota-Cost ${res.quotaCost} ≠ ${chunk.length} kode yang dikirim.`);
      }
    } catch (error) {
      const note = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      for (const t of chunk) failed.push({ code: t.code, note });
      // Batch gagal → berhenti: mencoba batch berikutnya bisa membakar ratusan kuota untuk kegagalan yang sama.
      summary.stopped = note;
    }
    await markStates(db, "price", okCodes, failed, now);
    summary.codesDone += okCodes.length;
    summary.codesFailed += failed.length;
    const usedAfter = (await getQuotaUsage(db, ARJUM_PROVIDER, now))?.used ?? usedBefore;
    summary.requests += Math.max(0, usedAfter - usedBefore);
    if (summary.stopped) break;
    if (canaryStale) {
      summary.stopped = "Belum ada transaksi hari ini (pasar tutup/libur); hanya 1 kode diambil.";
      break;
    }
    first = false;
  }
}

/** markState untuk banyak kode sekaligus (dua query, bukan satu per kode). */
async function markStates(db: Db, dataset: string, okCodes: string[], failed: Array<{ code: string; note: string }>, now: Date) {
  if (okCodes.length > 0) {
    await db
      .insert(schema.datasetFetchState)
      .values(okCodes.map((code) => ({ dataset, code, lastAttemptAt: now, lastSuccessAt: now, lastStatus: "success", lastError: null })))
      .onConflictDoUpdate({
        target: [schema.datasetFetchState.dataset, schema.datasetFetchState.code],
        set: { lastAttemptAt: now, lastSuccessAt: now, lastStatus: "success", lastError: null },
      });
  }
  if (failed.length > 0) {
    await db
      .insert(schema.datasetFetchState)
      .values(failed.map((f) => ({ dataset, code: f.code, lastAttemptAt: now, lastSuccessAt: null, lastStatus: "failed", lastError: f.note.slice(0, 1000) })))
      .onConflictDoUpdate({
        target: [schema.datasetFetchState.dataset, schema.datasetFetchState.code],
        set: { lastAttemptAt: now, lastStatus: "failed", lastError: sql.raw("excluded.last_error") },
      });
  }
}

// ---------------------------------------------------------------------------
// Handler per dataset
// ---------------------------------------------------------------------------

export const healthHandler: DatasetHandler = async ({ db, provider }) => {
  const started = Date.now();
  try {
    const res = await provider.health();
    const body = res.data as Record<string, unknown>;
    const status = typeof body.status === "string" ? body.status : typeof body.ok === "boolean" ? `ok=${body.ok}` : null;
    await db.insert(schema.providerHealthChecks).values({ provider: ARJUM_PROVIDER, reachable: true, httpStatus: res.response.httpStatus, durationMs: res.response.durationMs, status: status?.slice(0, 64) ?? null });
    return `HTTP ${res.response.httpStatus}`;
  } catch (error) {
    if (error instanceof QuotaExhaustedError) throw error;
    const httpStatus = (error as { httpStatus?: number }).httpStatus ?? null;
    await db.insert(schema.providerHealthChecks).values({
      provider: ARJUM_PROVIDER,
      reachable: false,
      httpStatus,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    });
    throw error;
  }
};

export const priceHandler: DatasetHandler = async ({ db, provider, code, instrumentId, now }) => {
  const res = await provider.price(code);
  const { quote, issue } = normalizeQuote(res.data, code, quotaDateWib(now));
  if (!quote) throw new Error(issue ?? "Respons harga ditolak.");
  const row = {
    provider: ARJUM_PROVIDER,
    lastPrice: quote.lastPrice?.toString() ?? null,
    freq: quote.freq !== null ? Math.trunc(quote.freq) : null,
    lot: quote.lot?.toString() ?? null,
    value: quote.value?.toString() ?? null,
    sourceDate: quote.sourceDate,
    dataTs: quote.dataTs,
    servedTs: quote.servedTs,
    marketState: quote.marketState,
    marketLabel: quote.marketLabel,
    noTradeToday: quote.noTradeToday,
    quoteAgeMs: quote.quoteAgeMs,
    isFallbackClose: quote.isFallbackClose,
    fetchedAt: now,
  };
  await db.insert(schema.latestQuotes).values({ instrumentId, ...row }).onConflictDoUpdate({ target: schema.latestQuotes.instrumentId, set: row });
  return `${quote.lastPrice ?? "-"} (${quote.isFallbackClose ? `penutupan ${quote.sourceDate ?? "?"}` : "transaksi hari ini"})`;
};

export const financialsHandler: DatasetHandler = async ({ db, provider, code, instrumentId, batchId }) => {
  const r = await ingestFinancialsForCode(db, provider, instrumentId, code, batchId);
  if (r.issues.length > 0) {
    await db.insert(schema.dataQualityIssues).values(r.issues.slice(0, 20).map((i) => ({ instrumentId, severity: i.severity, message: `[${code}] laporan keuangan: ${i.message}`.slice(0, 2000) })));
  }
  return `laporan +${r.reportsInserted}/rev ${r.reportsRevised}, fakta +${r.factsInserted}/rev ${r.factsRevised}, basis kuartal ${r.basis.basis}`;
};

/** Volume pasar (lembar) per sesi dalam rentang; null bila ada hari bursa yang belum tersimpan. */
async function marketVolume(db: Db, instrumentId: string, start: string, end: string, expectedSessions: number | null): Promise<number | null> {
  const rows = await db
    .select({ volume: schema.dailyBars.volume })
    .from(schema.dailyBars)
    .where(
      and(
        eq(schema.dailyBars.instrumentId, instrumentId),
        eq(schema.dailyBars.source, ARJUM_PROVIDER),
        sql`${schema.dailyBars.tradingDate} between ${start} and ${end}`,
      ),
    );
  if (rows.length === 0 || rows.some((r) => r.volume === null)) return null;
  if (expectedSessions !== null && rows.length !== expectedSessions) return null;
  return rows.reduce((s, r) => s + Number(r.volume), 0);
}

export async function storeBrokerSummary(
  db: Db,
  instrumentId: string,
  code: string,
  response: Parameters<typeof normalizeBrokerSummary>[0],
  params: { brokerLimit?: number; allData?: boolean },
  batchId: string,
): Promise<string> {
  const { summary, issues } = normalizeBrokerSummary(response, code);
  if (!summary) throw new Error(issues.join("; "));
  // Satu hari: volume sesi itu. Rentang: hanya bila setiap tanggal di rentang tersimpan
  // (jumlah sesi tidak diketahui tanpa kalender bursa → hanya rentang satu hari yang diuji).
  const volume = summary.startDate === summary.endDate ? await marketVolume(db, instrumentId, summary.startDate, summary.endDate, 1) : null;
  const coverage = assessBrokerCoverage(summary.rows, volume);
  const paramsKey = brokerParamsKey(params);

  await db.transaction(async (tx) => {
    const values = {
      instrumentId,
      provider: ARJUM_PROVIDER,
      startDate: summary.startDate,
      endDate: summary.endDate,
      paramsKey,
      brokerCount: summary.rows.length,
      coverage: coverage.coverage,
      coverageNote: `${coverage.note} Satuan volume: ${coverage.volumeUnit}.`,
      flow: summary.flow,
      brokerNet: summary.brokerNet,
      meta: { ...summary.meta, volumeUnit: coverage.volumeUnit, issues },
      batchId,
      fetchedAt: new Date(),
    };
    const [row] = await tx
      .insert(schema.brokerSummaries)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.brokerSummaries.instrumentId, schema.brokerSummaries.provider, schema.brokerSummaries.startDate, schema.brokerSummaries.endDate, schema.brokerSummaries.paramsKey],
        set: { brokerCount: values.brokerCount, coverage: values.coverage, coverageNote: values.coverageNote, flow: values.flow, brokerNet: values.brokerNet, meta: values.meta, batchId, fetchedAt: values.fetchedAt },
      })
      .returning({ id: schema.brokerSummaries.id });
    // Snapshot rentang yang sama diganti utuh (bukan ditambah) — idempotent.
    await tx.delete(schema.brokerSummaryRows).where(eq(schema.brokerSummaryRows.summaryId, row!.id));
    if (summary.rows.length > 0) {
      const s = (v: number | null) => (v === null ? null : v.toString());
      await tx.insert(schema.brokerSummaryRows).values(
        summary.rows.map((r) => ({
          summaryId: row!.id,
          brokerCode: r.brokerCode,
          brokerName: r.brokerName,
          buyValue: s(r.buyValue),
          buyVolume: r.buyVolume === null ? null : Math.round(r.buyVolume).toString(),
          buyFreq: r.buyFreq === null ? null : Math.trunc(r.buyFreq),
          sellValue: s(r.sellValue),
          sellVolume: r.sellVolume === null ? null : Math.round(r.sellVolume).toString(),
          sellFreq: r.sellFreq === null ? null : Math.trunc(r.sellFreq),
          netValue: s(r.netValue),
          netVolume: r.netVolume === null ? null : Math.round(r.netVolume).toString(),
        })),
      );
    }
  });
  return `${summary.startDate}..${summary.endDate}: ${summary.rows.length} broker, cakupan ${coverage.coverage}`;
}

export const brokerSummaryHandler: DatasetHandler = async ({ db, provider, code, instrumentId, batchId }) => {
  const params = brokerFetchParams();
  const res = await provider.brokerSummary(code, params);
  return storeBrokerSummary(db, instrumentId, code, res.data, params, batchId);
};

/**
 * Parameter permintaan broker summary terjadwal. Hanya parameter yang terbukti
 * lewat probe yang dikirim (docs/arjum-integration-status.md §broker).
 */
// all_data=true: probe 6 Okt — 63 broker BBCA, Σ beli = Σ jual = volume pasar
// sesi itu (89.905.700 lembar). Tanpa parameter hanya 20 broker teratas.
export const BROKER_FETCH_PARAMS: { brokerLimit?: number; allData?: boolean } = { allData: true };
function brokerFetchParams() {
  return BROKER_FETCH_PARAMS;
}

/** Simpan baris insider; duplikat (kunci komposit) diabaikan. Mengembalikan jumlah baris baru. */
export async function storeInsiderRows(db: Db, instrumentId: string, rows: ReturnType<typeof normalizeInsiders>["rows"]): Promise<number> {
  if (rows.length === 0) return 0;
  const s = (v: number | null) => (v === null ? null : v.toString());
  const written = await db
    .insert(schema.insiderTransactions)
    .values(
      rows.map((r) => ({
        instrumentId,
        provider: ARJUM_PROVIDER,
        dedupKey: r.dedupKey,
        holderName: r.holderName,
        txDate: r.txDate,
        actionType: r.actionType,
        nationality: r.nationality,
        badges: r.badges,
        previousShares: s(r.previousShares),
        previousPct: s(r.previousPct),
        currentShares: s(r.currentShares),
        currentPct: s(r.currentPct),
        changeShares: s(r.changeShares),
        changePct: s(r.changePct),
        price: s(r.price),
        brokerCode: r.brokerCode,
        raw: r.raw,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: schema.insiderTransactions.id });
  return written.length;
}

type InsiderCheckpoint = { nextPage?: number; totalPages?: number; complete?: boolean };

/**
 * Insider: halaman 1 selalu diambil (transaksi terbaru), lalu riwayat lama
 * dilanjutkan dari checkpoint halaman sampai INSIDER_PAGES_PER_RUN request.
 * Dedup kunci komposit membuat halaman yang bergeser aman diambil ulang.
 */
export const insidersHandler: DatasetHandler = async ({ db, provider, code, instrumentId }) => {
  const [state] = await db
    .select({ checkpoint: schema.datasetFetchState.checkpoint })
    .from(schema.datasetFetchState)
    .where(and(eq(schema.datasetFetchState.dataset, "insiders"), eq(schema.datasetFetchState.code, code)));
  const cp = (state?.checkpoint ?? {}) as InsiderCheckpoint;
  const pages = [1];
  if (!cp.complete) {
    for (let p = Math.max(2, cp.nextPage ?? 2); pages.length < INSIDER_PAGES_PER_RUN && (cp.totalPages === undefined || p <= cp.totalPages); p++) pages.push(p);
  }
  let inserted = 0;
  let totalPages = cp.totalPages;
  let lastFetched = 1;
  for (const page of pages) {
    if (totalPages !== undefined && page > totalPages) break;
    const res = await provider.insiders(code, { page });
    const parsed = normalizeInsiders(res.data as Record<string, unknown>, code);
    if (parsed.totalPages !== null) totalPages = parsed.totalPages;
    if (parsed.page !== null && parsed.page !== page) throw new Error(`Halaman insider ${page} dikembalikan sebagai ${parsed.page}.`);
    inserted += await storeInsiderRows(db, instrumentId, parsed.rows);
    lastFetched = page;
  }
  const complete = cp.complete || (totalPages !== undefined && lastFetched >= totalPages) || totalPages === 0;
  const checkpoint: InsiderCheckpoint = { totalPages, nextPage: lastFetched + 1, complete };
  await db
    .insert(schema.datasetFetchState)
    .values({ dataset: "insiders", code, checkpoint })
    .onConflictDoUpdate({ target: [schema.datasetFetchState.dataset, schema.datasetFetchState.code], set: { checkpoint } });
  return `${inserted} transaksi baru; halaman ${pages.join(",")} dari ${totalPages ?? "?"}${complete ? " (riwayat lengkap)" : ""}`;
};

export async function storeDerived(db: Db, instrumentId: string, dataset: string, paramsKey: string, rangeStart: string | null, rangeEnd: string | null, payload: object, batchId: string) {
  const values = { instrumentId, provider: ARJUM_PROVIDER, dataset, paramsKey, rangeStart, rangeEnd, payload, batchId, fetchedAt: new Date() };
  await db
    .insert(schema.providerDerivedSnapshots)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.providerDerivedSnapshots.instrumentId, schema.providerDerivedSnapshots.provider, schema.providerDerivedSnapshots.dataset, schema.providerDerivedSnapshots.paramsKey],
      set: { rangeStart, rangeEnd, payload, batchId, fetchedAt: values.fetchedAt },
    });
}

/** Akumulasi broker: rentang bawaan penyedia (±80 sesi), top 5 per sisi. */
export const ACCUMULATION_TOP = 5;
export const accumulationHandler: DatasetHandler = async ({ db, provider, code, instrumentId, batchId }) => {
  const res = await provider.brokerAccumulation(code, { top: ACCUMULATION_TOP });
  const { payload, issues } = normalizeAccumulation(res.data as Record<string, unknown>, code, ACCUMULATION_TOP);
  if (!payload) throw new Error(issues.join("; "));
  await storeDerived(db, instrumentId, "broker_accumulation", `top=${ACCUMULATION_TOP}`, payload.startDate, payload.endDate, payload, batchId);
  return `${payload.series.length} broker, ${payload.startDate}..${payload.endDate}${payload.checks.cumulativeConsistent ? "" : " (kumulatif tidak konsisten)"}`;
};

export const seasonalHandler: DatasetHandler = async ({ db, provider, code, instrumentId, batchId }) => {
  const res = await provider.seasonal(code);
  const { payload, issues } = normalizeSeasonal(res.data as Record<string, unknown>, code);
  if (!payload) throw new Error(issues.join("; "));
  await storeDerived(db, instrumentId, "seasonal", "", null, null, payload, batchId);
  return `${payload.years.length} tahun`;
};

export const DEFAULT_HANDLERS: Partial<Record<Dataset, DatasetHandler>> = {
  health: healthHandler,
  price: priceHandler,
  financials: financialsHandler,
  broker_summary: brokerSummaryHandler,
  insiders: insidersHandler,
  broker_accumulation: accumulationHandler,
  seasonal: seasonalHandler,
};

/** Untuk panel admin: jadwal + ringkasan checkpoint per dataset. */
export async function getDatasetOverview(db: Db) {
  await ensureDefaultSchedules(db);
  const schedules = await db.select().from(schema.datasetSchedules).orderBy(asc(schema.datasetSchedules.priority));
  const states = await db.execute<{ dataset: string; ok: number; failed: number; last: Date | null; [k: string]: unknown }>(sql`
    select dataset, count(*) filter (where last_status = 'success')::int as ok,
           count(*) filter (where last_status = 'failed')::int as failed, max(last_success_at) as last
    from ${schema.datasetFetchState} group by dataset
  `);
  const health = await db.select().from(schema.providerHealthChecks).orderBy(desc(schema.providerHealthChecks.checkedAt)).limit(1);
  return { schedules, states: new Map(states.map((s) => [s.dataset, s])), lastHealth: health[0] ?? null };
}

/** Validasi input admin untuk daftar kode. */
export function parseCodesInput(input: string): string[] {
  const codes: string[] = [];
  for (const raw of input.split(/[\s,;]+/)) {
    const c = raw.trim().toUpperCase();
    if (!c) continue;
    codes.push(assertStockCode(c));
  }
  return [...new Set(codes)].slice(0, 200);
}
