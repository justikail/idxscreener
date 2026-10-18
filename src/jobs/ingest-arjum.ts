import "@/server/load-env";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { acquireJobLock } from "@/server/jobs/lock";
import { createArjumProvider, type ArjumProvider } from "@/server/providers/arjum/adapter";
import { ARJUM_PROVIDER, arjumApiKey, arjumDailyBudget, assertStockCode } from "@/server/providers/arjum/config";
import { ArjumAuthError, ArjumMissingKeyError, ArjumNonJsonError } from "@/server/providers/arjum/errors";
import { QuotaExhaustedError, quotaDateWib } from "@/server/quota/budget";
import { validateArjumHistory } from "@/server/ingestion/validate-arjum-history";
import { unfinishedSessionDate } from "@/server/jobs/daily-schedule";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const SOURCE = "arjum";
// Cakupan diperluas ke semua saham atas keputusan pengguna (2026-10-05). Satu
// run = satu baris ingestion_runs; kuota tetap dijaga reserveQuota per request.
export const MAX_CODES_PER_RUN = 1000;
const MAX_TOP = 50; // --top membaca satu halaman market-cap (per_page maks. 50)
const MAX_CONSECUTIVE_DB_ERRORS = 5;
export const LOCK_NAME = "ingest-arjum-daily-bars";

export interface IngestArjumOptions {
  codes: string[];
  historyLimit: number;
  /** Jam acuan untuk aturan candle belum final (default: sekarang). */
  now?: Date;
  /** Nama dari market-cap (bila tersedia) untuk instrumen baru. */
  names?: Map<string, string>;
}

export interface IngestArjumSummary {
  batchId: string;
  codesRequested: number;
  codesStored: number;
  rowsUpserted: number;
  rowsSkippedOtherSource: number;
  rowsQuarantined: number;
  /** Candle hari ini yang dilewati karena bursa belum tutup. */
  rowsSkippedUnfinished: number;
  codesFailed: Array<{ code: string; error: string }>;
  codesSkipped: Array<{ code: string; reason: string }>;
  dateRange: { first: string | null; last: string | null };
  stoppedEarly: string | null;
}

/**
 * Ingest OHLCV harian Arjum untuk daftar kode eksplisit. Satu transaksi per
 * kode: kegagalan satu kode tidak menyentuh kode lain. Upsert idempotent pada
 * unique (instrument, tanggal, scope, adjusted) — tetapi HANYA menimpa baris
 * bersumber "arjum"; baris dari sumber lain tidak ditimpa diam-diam.
 */
export async function ingestArjumDailyBars(
  db: Db,
  provider: Pick<ArjumProvider, "history">,
  options: IngestArjumOptions,
): Promise<IngestArjumSummary> {
  const codes = [...new Set(options.codes.map(assertStockCode))];
  if (codes.length > MAX_CODES_PER_RUN) {
    throw new Error(`Maksimal ${MAX_CODES_PER_RUN} kode per run (diberikan ${codes.length}).`);
  }

  const batchId = `arjum-history-${Date.now()}`;
  const now = options.now ?? new Date();
  const todayWib = quotaDateWib(now);
  // Candle hari ini belum final selama bursa masih buka → tidak disimpan.
  const unfinishedDate = unfinishedSessionDate(now);
  const summary: IngestArjumSummary = {
    batchId,
    codesRequested: codes.length,
    codesStored: 0,
    rowsUpserted: 0,
    rowsSkippedOtherSource: 0,
    rowsQuarantined: 0,
    rowsSkippedUnfinished: 0,
    codesFailed: [],
    codesSkipped: [],
    dateRange: { first: null, last: null },
    stoppedEarly: null,
  };

  const [run] = await db
    .insert(schema.ingestionRuns)
    .values({ provider: ARJUM_PROVIDER, capability: "daily_bars", status: "running", batchId })
    .returning();
  const runId = run!.id;

  let consecutiveDbErrors = 0;
  for (const code of codes) {
    // Kode demo yang kebetulan sama dengan ticker asli (mis. ENRG/BAJA) TIDAK
    // boleh menerima harga real — instrumen demo punya fundamental sintetis.
    const [existing] = await db
      .select({ id: schema.instruments.id, dataMode: schema.instruments.dataMode })
      .from(schema.instruments)
      .where(eq(schema.instruments.code, code))
      .limit(1);
    if (existing?.dataMode === "demo") {
      const reason = "Kode dipakai instrumen DEMO; data real tidak ditempelkan ke instrumen demo.";
      summary.codesSkipped.push({ code, reason });
      await db.insert(schema.dataQualityIssues).values({
        ingestionRunId: runId,
        instrumentId: existing.id,
        severity: "warning",
        message: `[${code}] ${reason}`,
      });
      continue;
    }

    let parsed: Awaited<ReturnType<ArjumProvider["history"]>>;
    try {
      parsed = await provider.history(code, { limit: options.historyLimit, frame: "daily" });
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      summary.codesFailed.push({ code, error: message });
      // Kegagalan yang pasti berulang untuk semua kode: hentikan run, jangan
      // terus membakar kuota (AGENTS.md §7).
      if (error instanceof QuotaExhaustedError || error instanceof ArjumAuthError || error instanceof ArjumNonJsonError) {
        summary.stoppedEarly = message;
        break;
      }
      continue;
    }

    // Kegagalan database untuk satu saham (mis. koneksi direset) tidak boleh
    // menghentikan seluruh run: dicatat sebagai gagal, lanjut ke saham berikutnya.
    // Bila berturut-turut gagal, database dianggap tidak terjangkau → berhenti.
    try {
      await db.insert(schema.providerRawSnapshots).values({
        provider: ARJUM_PROVIDER,
        capability: "daily_bars",
        requestParams: { code, limit: options.historyLimit, frame: "daily" },
        httpStatus: parsed.response.httpStatus,
        contentType: parsed.response.contentType,
        rowCount: parsed.data.rows.length,
        rawBody: parsed.response.body as object,
        batchId,
      });

      const validation = validateArjumHistory(parsed.data, code, todayWib);
      summary.rowsQuarantined += validation.issues.filter((i) => i.severity === "error").length;
      if (validation.issues.length > 0) {
        await db.insert(schema.dataQualityIssues).values(
          validation.issues.map((issue) => ({
            ingestionRunId: runId,
            instrumentId: existing?.id ?? null,
            severity: issue.severity,
            message: `[${code}] ${issue.message}`,
          })),
        );
      }
      const finalRows = validation.validRows.filter((row) => row.tradingDate !== unfinishedDate);
      if (finalRows.length < validation.validRows.length) summary.rowsSkippedUnfinished += 1;
      if (finalRows.length === 0) continue;

      const outcome = await db.transaction(async (tx) => {
        let instrumentId = existing?.id;
        if (!instrumentId) {
          const [inserted] = await tx
            .insert(schema.instruments)
            .values({
              code,
              name: options.names?.get(code) ?? code,
              dataMode: "live",
              status: "active",
            })
            .onConflictDoNothing()
            .returning({ id: schema.instruments.id });
          instrumentId =
            inserted?.id ??
            (await tx.select({ id: schema.instruments.id }).from(schema.instruments).where(eq(schema.instruments.code, code)))[0]!.id;
        }

        const rows = finalRows.map((row) => ({
          instrumentId: instrumentId!,
          tradingDate: row.tradingDate,
          marketScope: "regular",
          open: row.open?.toString() ?? null,
          high: row.high?.toString() ?? null,
          low: row.low?.toString() ?? null,
          close: row.close?.toString() ?? null,
          volume: row.volume !== null ? BigInt(row.volume) : null,
          value: row.value?.toString() ?? null,
          frequency: row.frequency !== null ? Math.trunc(row.frequency) : null,
          foreignBuy: row.foreign?.buy != null ? BigInt(row.foreign.buy) : null,
          foreignSell: row.foreign?.sell != null ? BigInt(row.foreign.sell) : null,
          foreignNet: row.foreign?.net != null ? BigInt(row.foreign.net) : null,
          isAdjusted: false,
          // Status penyesuaian corporate action Arjum BELUM diverifikasi
          // (audit D.2). Ditandai eksplisit, bukan diklaim mentah/adjusted.
          adjustmentMethod: "unverified",
          source: SOURCE,
          batchId,
        }));

        const written = await tx
          .insert(schema.dailyBars)
          .values(rows)
          .onConflictDoUpdate({
            target: [
              schema.dailyBars.instrumentId,
              schema.dailyBars.tradingDate,
              schema.dailyBars.marketScope,
              schema.dailyBars.isAdjusted,
            ],
            set: {
              open: sql`excluded.open`,
              high: sql`excluded.high`,
              low: sql`excluded.low`,
              close: sql`excluded.close`,
              volume: sql`excluded.volume`,
              value: sql`excluded.value`,
              frequency: sql`excluded.frequency`,
              foreignBuy: sql`excluded.foreign_buy`,
              foreignSell: sql`excluded.foreign_sell`,
              foreignNet: sql`excluded.foreign_net`,
              adjustmentMethod: sql`excluded.adjustment_method`,
              batchId: sql`excluded.batch_id`,
              revision: sql`${schema.dailyBars.revision} + 1`,
              fetchedAt: sql`now()`,
            },
            // Jangan timpa baris dari sumber lain secara diam-diam.
            setWhere: eq(schema.dailyBars.source, SOURCE),
          })
          .returning({ id: schema.dailyBars.id });

        return { instrumentId: instrumentId!, written: written.length, skipped: rows.length - written.length };
      });

      summary.codesStored += 1;
      summary.rowsUpserted += outcome.written;
      summary.rowsSkippedOtherSource += outcome.skipped;
      if (outcome.skipped > 0) {
        await db.insert(schema.dataQualityIssues).values({
          ingestionRunId: runId,
          instrumentId: outcome.instrumentId,
          severity: "warning",
          message: `[${code}] ${outcome.skipped} baris tidak ditimpa karena sudah ada dari sumber lain.`,
        });
      }
      if (validation.firstDate && (!summary.dateRange.first || validation.firstDate < summary.dateRange.first)) {
        summary.dateRange.first = validation.firstDate;
      }
      if (validation.lastDate && (!summary.dateRange.last || validation.lastDate > summary.dateRange.last)) {
        summary.dateRange.last = validation.lastDate;
      }
      consecutiveDbErrors = 0;
    } catch (error) {
      const message = error instanceof Error ? `${(error as { code?: string }).code ?? error.name}: ${error.message}` : String(error);
      summary.codesFailed.push({ code, error: `database: ${message}` });
      consecutiveDbErrors += 1;
      if (consecutiveDbErrors >= MAX_CONSECUTIVE_DB_ERRORS) {
        summary.stoppedEarly = `${consecutiveDbErrors} kegagalan database berturut-turut (terakhir: ${message})`;
        break;
      }
    }
  }

  const status =
    summary.codesStored === 0 ? "failed" : summary.codesFailed.length > 0 || summary.stoppedEarly ? "partial" : "success";
  await db
    .update(schema.ingestionRuns)
    .set({
      status,
      finishedAt: new Date(),
      error:
        [summary.stoppedEarly, ...summary.codesFailed.map((f) => `${f.code}: ${f.error}`)].filter(Boolean).join(" | ").slice(0, 2000) ||
        null,
    })
    .where(eq(schema.ingestionRuns.id, runId));

  return summary;
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const a of argv) {
    const m = a.match(/^--([a-z-]+)=(.+)$/);
    if (m) args.set(m[1]!, m[2]!);
  }
  const codes = (args.get("codes") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const top = args.get("top") ? Number(args.get("top")) : null;
  const historyLimit = Number(args.get("limit") ?? "120");
  if (codes.length === 0 && !top) throw new Error("Wajib --codes=BBCA,TLKM,... atau --top=N (maks 50, dari /api/market-cap halaman 1).");
  if (top !== null && (!Number.isInteger(top) || top < 1 || top > MAX_TOP)) throw new Error("--top harus 1–50.");
  return { codes, top, historyLimit };
}

async function main() {
  const { codes: argCodes, top, historyLimit } = parseArgs(process.argv.slice(2));
  const apiKey = arjumApiKey();
  if (!apiKey) throw new ArjumMissingKeyError();
  console.log(`Satu API key; budget harian aplikasi ${arjumDailyBudget()} (tidak melebihi kuota akun).`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL belum diset.");
  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  const release = await acquireJobLock(db, LOCK_NAME, 30 * 60_000);
  try {
    const provider = createArjumProvider(db, {
      apiKey,
      dailyLimit: arjumDailyBudget(),
      onAttempt: (log) =>
        console.log(`  ${log.path} #${log.attempt} [${log.keyLabel}] → ${log.httpStatus ?? "-"} ${log.durationMs}ms ${log.outcome}${log.error ? ` (${log.error})` : ""}`),
    });

    let codes = argCodes;
    const names = new Map<string, string>();
    if (top) {
      const mc = await provider.marketCap({ page: 1, perPage: 50 });
      // Urutan mengikuti respons penyedia (belum terbukti diurutkan menurut kapitalisasi).
      codes = mc.data.data.slice(0, top).map((r) => r.code);
      for (const r of mc.data.data) if (r.name) names.set(r.code.toUpperCase(), r.name);
      console.log(`market-cap date=${mc.data.date ?? "-"} → ${codes.length} kode: ${codes.join(", ")}`);
    }

    const summary = await ingestArjumDailyBars(db, provider, { codes, historyLimit, names });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await release();
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Ingest Arjum gagal:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
