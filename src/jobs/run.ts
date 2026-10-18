import "@/server/load-env";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, desc, eq, sql } from "drizzle-orm";

import * as schema from "@/server/db/schema";
import { computeInstrumentSnapshots, FORMULA_VERSION } from "@/server/services/metrics";
import { evaluateFilter } from "@/domain/filter-ast";
import { SCREENING_PRESETS } from "@/domain/presets";
import { DEMO_BATCH_ID } from "@/server/providers/demo/generate";

type Db = ReturnType<typeof drizzle<typeof schema>>;
type DataMode = "demo" | "live";

/** Label batch input per mode — dipakai metric_snapshots & screening_runs untuk provenance. */
export const LIVE_INPUT_BATCH_ID = "live";
const SNAPSHOT_BATCH = 2000; // × 8 kolom = 16.000 parameter per statement
const INPUT_BATCH_BY_MODE: Record<DataMode, string> = { demo: DEMO_BATCH_ID, live: LIVE_INPUT_BATCH_ID };

async function latestTradingDate(db: Db, mode: DataMode): Promise<string | null> {
  const [row] = await db
    .select({ tradingDate: schema.dailyBars.tradingDate })
    .from(schema.dailyBars)
    .innerJoin(schema.instruments, eq(schema.dailyBars.instrumentId, schema.instruments.id))
    .where(and(eq(schema.instruments.dataMode, mode), sql`${schema.dailyBars.close} is not null`))
    .orderBy(desc(schema.dailyBars.tradingDate))
    .limit(1);
  return row?.tradingDate ?? null;
}

async function computeForMode(db: Db, mode: DataMode): Promise<void> {
  const runAsOf = await latestTradingDate(db, mode);
  if (!runAsOf) {
    console.log(`[${mode}] Tidak ada daily_bars — dilewati.`);
    return;
  }

  console.log(`[${mode}] Menghitung metric_snapshots untuk as_of=${runAsOf}...`);
  const computed = await computeInstrumentSnapshots(db, runAsOf, mode);
  const inputBatchId = INPUT_BATCH_BY_MODE[mode];

  // Upsert dalam SATU statement batch (bukan satu INSERT per metrik) —
  // `excluded.*` memakai nilai baris baru per-baris.
  const snapshotRows = computed.flatMap((instrument) =>
    instrument.snapshots.map((snapshot) => ({
      instrumentId: instrument.instrumentId,
      asOf: runAsOf,
      metric: snapshot.metric,
      value: snapshot.value === null ? null : snapshot.value.toString(),
      unit: snapshot.unit,
      status: snapshot.status,
      formulaVersion: FORMULA_VERSION,
      inputBatchId,
    })),
  );

  // Dipecah per batch: satu INSERT untuk ratusan saham × belasan metrik
  // melewati batas 65.535 parameter PostgreSQL.
  for (let i = 0; i < snapshotRows.length; i += SNAPSHOT_BATCH) {
    await db
      .insert(schema.metricSnapshots)
      .values(snapshotRows.slice(i, i + SNAPSHOT_BATCH))
      .onConflictDoUpdate({
        target: [
          schema.metricSnapshots.instrumentId,
          schema.metricSnapshots.asOf,
          schema.metricSnapshots.metric,
          schema.metricSnapshots.formulaVersion,
        ],
        set: {
          value: sql`excluded.value`,
          status: sql`excluded.status`,
          unit: sql`excluded.unit`,
          inputBatchId: sql`excluded.input_batch_id`,
        },
      });
  }

  console.log(`[${mode}] Metrik tersimpan untuk ${computed.length} instrumen.`);

  for (const preset of SCREENING_PRESETS) {
    const [run] = await db
      .insert(schema.screeningRuns)
      .values({ presetCode: preset.code, asOf: runAsOf, filterVersion: FORMULA_VERSION, inputBatchId })
      .returning();
    if (!run) throw new Error("Gagal membuat screening_runs.");

    const evaluations = computed.map((instrument) => ({
      instrument,
      evaluation: evaluateFilter(preset.filter, instrument.candidate),
    }));
    const passedCount = evaluations.filter((e) => e.evaluation.passed).length;

    if (evaluations.length > 0) {
      await db.insert(schema.screeningResults).values(
        evaluations.map(({ instrument, evaluation }) => ({
          runId: run.id,
          instrumentId: instrument.instrumentId,
          passed: evaluation.passed,
          reasons: evaluation.reasons,
          missingFields: evaluation.missingFields,
        })),
      );
    }

    console.log(`[${mode}] Preset "${preset.code}": ${passedCount}/${computed.length} lolos.`);
  }
}

/**
 * Job kalkulasi: daily_bars + financial_facts -> metric_snapshots ->
 * screening_runs, dihitung TERPISAH per mode data (demo dan live) dengan as_of
 * masing-masing. Idempotent untuk metric_snapshots (upsert); screening_runs
 * sengaja bertambah sebagai riwayat bertimestamp.
 */
export async function runComputeJob(modes: DataMode[] = ["demo", "live"]): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL belum diset. Salin .env.example menjadi .env.local.");
  }

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  try {
    for (const mode of modes) await computeForMode(db, mode);
  } finally {
    await client.end();
  }
}

async function main() {
  const modeArg = process.argv.slice(2).find((a) => a.startsWith("--mode="))?.slice("--mode=".length);
  const modes: DataMode[] = modeArg === "demo" || modeArg === "live" ? [modeArg] : ["demo", "live"];
  await runComputeJob(modes);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Job gagal:", error);
    process.exit(1);
  });
}
