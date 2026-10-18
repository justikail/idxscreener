import "@/server/load-env";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { IdxDailyBarsProvider, type IdxAdapterFetchResult } from "@/server/providers/idx/adapter";
import { IdxBlockedError, IdxSchemaError, IdxTransientError } from "@/server/providers/idx/errors";
import { validateAndNormalizeDailyBars } from "@/server/ingestion/validate-daily-bars";

/** Longgar dari class konkret agar bisa disuntik mock di test integrasi. */
export interface IdxAdapterLike {
  fetchDailyBars(dateYmd: string): Promise<IdxAdapterFetchResult>;
}

/**
 * Ingest manual daily bars dari IDX untuk SATU ATAU BEBERAPA tanggal eksplisit
 * (bukan backfill otomatis sejak 2020 — AGENTS.md §5, instruksi M3 §9).
 * Dipanggil via CLI (`pnpm ingest:idx -- --date=20260814`), TIDAK dipicu
 * otomatis oleh worker terjadwal kecuali IDX_INGEST_ENABLED=1 diset eksplisit
 * (lihat src/jobs/worker.ts).
 *
 * Batch gagal TIDAK menggantikan batch valid: setiap tanggal ditulis dalam
 * transaksi terpisah; kegagalan validasi/HTTP pada satu tanggal tidak
 * menyentuh data tanggal lain yang sudah tersimpan valid.
 */

const MARKET_SCOPE = "regular";

interface DateRangeOptions {
  dates: string[]; // YYYYMMDD
  maxRequests: number;
}

function parseArgs(argv: string[]): DateRangeOptions {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const match = arg.match(/^--([a-z-]+)=(.+)$/);
    if (match) args.set(match[1]!, match[2]!);
  }

  const maxRequests = Math.min(Number(args.get("max-requests") ?? "5"), 30); // hard ceiling — cegah backfill tak terkendali

  const single = args.get("date");
  if (single) return { dates: [single], maxRequests };

  const from = args.get("from");
  const to = args.get("to");
  if (from && to) {
    const dates = enumerateYmd(from, to).filter(isWeekdayYmd);
    if (dates.length > maxRequests) {
      throw new Error(
        `Rentang ${from}..${to} menghasilkan ${dates.length} hari kerja, melebihi --max-requests=${maxRequests}. ` +
          `Perkecil rentang atau naikkan --max-requests secara eksplisit (maks 30 per invokasi).`,
      );
    }
    return { dates, maxRequests };
  }

  throw new Error("Wajib isi --date=YYYYMMDD ATAU --from=YYYYMMDD --to=YYYYMMDD.");
}

function enumerateYmd(fromYmd: string, toYmd: string): string[] {
  const parse = (s: string) => new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))));
  const from = parse(fromYmd);
  const to = parse(toYmd);
  if (from > to) throw new Error("--from harus <= --to.");

  const dates: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    dates.push(
      `${cursor.getUTCFullYear()}${String(cursor.getUTCMonth() + 1).padStart(2, "0")}${String(cursor.getUTCDate()).padStart(2, "0")}`,
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function isWeekdayYmd(ymd: string): boolean {
  const d = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))));
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * Diekspor (bukan hanya dipanggil dari main()) agar bisa diuji langsung di
 * tests/integration/idx-ingest.test.ts dengan provider yang di-mock — lihat
 * test "batch gagal tidak menggantikan batch valid".
 */
export async function ingestOneDate(
  db: ReturnType<typeof drizzle<typeof schema>>,
  dateParam: string,
  provider: IdxAdapterLike = new IdxDailyBarsProvider(),
): Promise<void> {
  const batchId = `idx-${dateParam}-${Date.now()}`;

  const [ingestionRun] = await db
    .insert(schema.ingestionRuns)
    .values({ provider: "idx", capability: "daily_bars", status: "running", batchId })
    .returning();

  try {
    const result = await provider.fetchDailyBars(dateParam);

    await db.insert(schema.providerRawSnapshots).values({
      provider: "idx",
      capability: "daily_bars",
      requestParams: { date: dateParam },
      httpStatus: result.httpStatus,
      contentType: result.contentType,
      rowCount: result.rows.length,
      rawBody: result.rawBody as object,
      batchId,
    });

    if (result.unknownFieldKeys.length > 0) {
      await db.insert(schema.dataQualityIssues).values({
        ingestionRunId: ingestionRun!.id,
        severity: "info",
        message: `Field tak dikenal pada respons ${dateParam}: ${result.unknownFieldKeys.join(", ")}`,
      });
    }

    const { validRows, issues } = validateAndNormalizeDailyBars(result.rows, dateParam);

    if (issues.length > 0) {
      await db.insert(schema.dataQualityIssues).values(
        issues.map((issue) => ({
          ingestionRunId: ingestionRun!.id,
          severity: issue.severity,
          message: issue.stockCode ? `[${issue.stockCode}] ${issue.message}` : issue.message,
        })),
      );
    }

    if (validRows.length === 0) {
      await db
        .update(schema.ingestionRuns)
        .set({ status: "success", finishedAt: new Date() })
        .where(eq(schema.ingestionRuns.id, ingestionRun!.id));
      console.log(`[${dateParam}] 0 baris valid untuk disimpan (lihat data_quality_issues untuk detail).`);
      return;
    }

    // Transaksi tunggal per tanggal: batch gagal tidak menyentuh data tanggal
    // lain yang sudah tersimpan valid (AGENTS.md §11).
    await db.transaction(async (tx) => {
      const codeToId = new Map<string, string>();
      for (const row of validRows) {
        const [existing] = await tx
          .select({ id: schema.instruments.id })
          .from(schema.instruments)
          .where(eq(schema.instruments.code, row.instrumentCode))
          .limit(1);

        if (existing) {
          codeToId.set(row.instrumentCode, existing.id);
        } else {
          const [inserted] = await tx
            .insert(schema.instruments)
            .values({
              code: row.instrumentCode,
              name: row.instrumentName ?? row.instrumentCode,
              dataMode: "live",
              status: "active",
            })
            .returning();
          codeToId.set(row.instrumentCode, inserted!.id);
        }
      }

      await tx
        .insert(schema.dailyBars)
        .values(
          validRows.map((row) => ({
            instrumentId: codeToId.get(row.instrumentCode)!,
            tradingDate: row.tradingDate,
            marketScope: MARKET_SCOPE,
            open: row.open?.toString() ?? null,
            high: row.high?.toString() ?? null,
            low: row.low?.toString() ?? null,
            close: row.close?.toString() ?? null,
            volume: row.volume !== null ? BigInt(Math.trunc(row.volume)) : null,
            value: row.value?.toString() ?? null,
            frequency: row.frequency !== null ? Math.trunc(row.frequency) : null,
            source: "idx",
            batchId,
          })),
        )
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
            source: sql`excluded.source`,
            batchId: sql`excluded.batch_id`,
            revision: sql`${schema.dailyBars.revision} + 1`,
            fetchedAt: sql`now()`,
          },
        });
    });

    await db
      .update(schema.ingestionRuns)
      .set({ status: "success", finishedAt: new Date() })
      .where(eq(schema.ingestionRuns.id, ingestionRun!.id));

    console.log(`[${dateParam}] ${validRows.length} baris valid disimpan (source=idx, dataMode=live).`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(schema.ingestionRuns)
      .set({ status: "failed", finishedAt: new Date(), error: message })
      .where(eq(schema.ingestionRuns.id, ingestionRun!.id));

    if (error instanceof IdxBlockedError) {
      console.error(`[${dateParam}] DIBLOKIR provider (HTTP ${error.httpStatus}). Tidak mengulang. ${message}`);
    } else if (error instanceof IdxSchemaError) {
      console.error(`[${dateParam}] Schema respons tidak sesuai: ${message}`);
    } else if (error instanceof IdxTransientError) {
      console.error(`[${dateParam}] Gagal transien setelah retry terbatas: ${message}`);
    } else {
      console.error(`[${dateParam}] Gagal: ${message}`);
    }
    // Sengaja TIDAK re-throw: satu tanggal gagal tidak menghentikan tanggal
    // lain dalam batch yang sama (lanjut ke tanggal berikutnya di main()).
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL belum diset.");

  const { dates, maxRequests } = parseArgs(process.argv.slice(2));
  console.log(`Ingest IDX daily bars: ${dates.length} tanggal (maxRequests=${maxRequests}): ${dates.join(", ")}`);

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  try {
    for (const dateParam of dates) {
      await ingestOneDate(db, dateParam);
    }
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Ingest gagal:", error);
    process.exit(1);
  });
}
