import "@/server/load-env";

import { mkdirSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { ArjumProvider, type Parsed } from "@/server/providers/arjum/adapter";
import type { ArjumAttemptLog } from "@/server/providers/arjum/client";
import { ARJUM_PROVIDER, arjumApiKey, arjumDailyBudget, assertStockCode } from "@/server/providers/arjum/config";
import { ArjumMissingKeyError } from "@/server/providers/arjum/errors";
import { describeShape } from "@/server/providers/arjum/schemas";
import { getQuotaUsage, reserveQuota } from "@/server/quota/budget";

/**
 * Probe read-only Arjum, OPT-IN (dijalankan manual: `pnpm arjum:probe`).
 * Budget probe default 10 percobaan HTTP — retry ikut dihitung — terpisah dari
 * budget ingestion harian, tetapi tetap memesan kuota bersama di DB.
 * Hasil ringkas (tanpa key, tanpa header request) ditulis ke docs/probes/.
 */

class ProbeBudgetExceeded extends Error {}

interface ProbeResult {
  step: string;
  ok: boolean;
  httpStatus?: number;
  contentType?: string | null;
  durationMs?: number;
  attempts?: number;
  responseHeaders?: Record<string, string>;
  shape?: unknown;
  summary?: Record<string, unknown>;
  error?: string;
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const a of argv) {
    const m = a.match(/^--([a-z-]+)=(.+)$/);
    if (m) args.set(m[1]!, m[2]!);
  }
  return {
    code: assertStockCode(args.get("code") ?? "BBCA"),
    maxCalls: Math.min(Number(args.get("max-calls") ?? "10"), 10),
  };
}

async function main() {
  const { code, maxCalls } = parseArgs(process.argv.slice(2));
  const apiKey = arjumApiKey();
  if (!apiKey) throw new ArjumMissingKeyError();
  console.log(`Satu API key; budget harian aplikasi ${arjumDailyBudget()} (tidak melebihi kuota akun).`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL belum diset.");
  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  const dailyLimit = arjumDailyBudget();
  const attemptLog: ArjumAttemptLog[] = [];
  let callsUsed = 0;
  const batchId = `arjum-probe-${Date.now()}`;
  const quotaBefore = await getQuotaUsage(db, ARJUM_PROVIDER);

  const provider = new ArjumProvider({
    apiKey,
    maxAttempts: 2,
    onAttempt: (log) => attemptLog.push(log),
    reserve: async () => {
      if (callsUsed >= maxCalls) throw new ProbeBudgetExceeded(`Budget probe ${maxCalls} panggilan habis.`);
      await reserveQuota(db, ARJUM_PROVIDER, dailyLimit, 1);
      callsUsed += 1;
    },
  });

  const [run] = await db
    .insert(schema.ingestionRuns)
    .values({ provider: ARJUM_PROVIDER, capability: "probe", status: "running", batchId })
    .returning();

  const results: ProbeResult[] = [];

  async function step<T>(name: string, fn: () => Promise<Parsed<T>>, summarize: (data: T) => Record<string, unknown>) {
    try {
      const parsed = await fn();
      const { response } = parsed;
      await db.insert(schema.providerRawSnapshots).values({
        provider: ARJUM_PROVIDER,
        capability: `probe:${name}`,
        requestParams: { step: name, code },
        httpStatus: response.httpStatus,
        contentType: response.contentType,
        rowCount: null,
        rawBody: response.body as object,
        batchId,
      });
      results.push({
        step: name,
        ok: true,
        httpStatus: response.httpStatus,
        contentType: response.contentType,
        durationMs: response.durationMs,
        attempts: response.attempts,
        responseHeaders: response.responseHeaders,
        shape: describeShape(response.body),
        summary: summarize(parsed.data),
      });
      console.log(`[${name}] OK HTTP ${response.httpStatus} ${response.durationMs}ms`, JSON.stringify(summarize(parsed.data)));
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      results.push({ step: name, ok: false, error: message });
      console.log(`[${name}] GAGAL — ${message}`);
      if (error instanceof ProbeBudgetExceeded) throw error;
    }
  }

  const rowDates = (rows: Array<{ date: string }>) => {
    const dates = rows.map((r) => r.date).sort();
    return { rows: rows.length, firstDate: dates[0] ?? null, lastDate: dates[dates.length - 1] ?? null };
  };

  try {
    await step("market-cap", () => provider.marketCap({ page: 1, perPage: 50 }), (d) => ({
      date: d.date,
      total: d.total,
      total_pages: d.total_pages,
      rows: d.data.length,
      sampleCodes: d.data.slice(0, 5).map((r) => r.code),
    }));
    await step("history-daily", () => provider.history(code, { limit: 60, frame: "daily" }), (d) => ({
      stock_code: d.stock_code,
      frame: d.frame,
      ...rowDates(d.rows),
      extraTopLevelKeys: Object.keys(d).filter((k) => !["stock_code", "frame", "rows"].includes(k)),
      lastRow: d.rows.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null,
    }));
    await step(
      "financial-statements",
      () => provider.financialStatements(code, { reportType: "INCOME_STATEMENT", period: "quarterly", limit: 4 }),
      (d) => ({
        report_type: d.report_type,
        period: d.period,
        count: d.count,
        periods: d.items.map((i) => `${i.year}Q${i.quarter} (${i.label ?? "-"}, fetched_at ${i.fetched_at ?? "-"})`),
        dataKeysSample: Object.keys(d.items[0]?.data ?? {}).slice(0, 12),
      }),
    );
    await step("broker-summary", () => provider.brokerSummary(code), (d) => ({
      broker_start_date: d.broker_start_date,
      broker_end_date: d.broker_end_date,
      brokers: d.brokers?.length ?? null,
    }));
    await step("price", () => provider.price(code), (d) => ({
      data_ts: d.data_ts,
      served_ts: d.served_ts,
      source_date: d.source_date,
      no_trade_today: d.no_trade_today,
      market_state: d.market_state,
      market_label: d.market_label,
      quote_age_ms: d.quote_age_ms,
      keys: Object.keys(d),
    }));
    // Kedalaman histori & indikasi penyesuaian split (audit G.4 #3) — 1 panggilan.
    await step("history-monthly-500", () => provider.history(code, { limit: 500, frame: "monthly" }), (d) => ({
      frame: d.frame,
      ...rowDates(d.rows),
    }));
  } catch (error) {
    if (!(error instanceof ProbeBudgetExceeded)) throw error;
    console.log("Budget probe habis — langkah sisanya dilewati.");
  }

  const quotaAfter = await getQuotaUsage(db, ARJUM_PROVIDER);
  const okCount = results.filter((r) => r.ok).length;

  await db
    .update(schema.ingestionRuns)
    .set({
      status: okCount === results.length ? "success" : okCount > 0 ? "partial" : "failed",
      finishedAt: new Date(),
      error: results.filter((r) => !r.ok).map((r) => `${r.step}: ${r.error}`).join(" | ") || null,
    })
    .where(eq(schema.ingestionRuns.id, run!.id));

  const report = {
    provider: ARJUM_PROVIDER,
    probedAt: new Date().toISOString(),
    code,
    httpAttempts: callsUsed,
    probeBudget: maxCalls,
    localQuotaCounter: { before: quotaBefore?.used ?? 0, after: quotaAfter?.used ?? 0, dailyBudget: dailyLimit },
    batchId,
    results,
    attempts: attemptLog,
  };

  mkdirSync("docs/probes", { recursive: true });
  const file = `docs/probes/arjum-probe-${report.probedAt.slice(0, 10)}-${code}.json`;
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\nRingkasan: ${okCount}/${results.length} langkah OK, ${callsUsed} percobaan HTTP. Laporan: ${file}`);

  await client.end();
}

main().catch((error) => {
  console.error("Probe gagal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
