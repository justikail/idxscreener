import "@/server/load-env";

import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { evaluateAlerts } from "@/jobs/evaluate-alerts";
import { FEATURES } from "@/lib/features";
import { ingestArjumDailyBars, LOCK_NAME, MAX_CODES_PER_RUN, type IngestArjumSummary } from "@/jobs/ingest-arjum";
import { runComputeJob } from "@/jobs/run";
import {
  DAILY_CAPABILITY,
  dailyBatchId,
  decideDailyRun,
  historyLimitForGap,
  wibClock,
  type DailyRunStatus,
} from "@/server/jobs/daily-schedule";
import { JobLockedError, withRenewingLock } from "@/server/jobs/lock";
import { validateArjumHistory } from "@/server/ingestion/validate-arjum-history";
import { createArjumProvider, type ArjumProvider } from "@/server/providers/arjum/adapter";
import { ARJUM_PROVIDER, arjumApiKey, arjumDailyBudget } from "@/server/providers/arjum/config";
import { ArjumMissingKeyError } from "@/server/providers/arjum/errors";
import { getQuotaUsage, quotaDateWib } from "@/server/quota/budget";

type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * scheduled: dari jadwal (dihitung sebagai percobaan hari itu).
 * check: dijalankan tangan dari CLI, dengan cek saham patokan; tidak dihitung jadwal.
 * manual: "Jalankan sekarang" — tanpa cek patokan; tidak dihitung jadwal.
 */
export type DailyTrigger = "scheduled" | "check" | "manual";

export interface DailyUpdateOptions {
  trigger: DailyTrigger;
  /** Percobaan terjadwal terakhir hari ini: "belum ada sesi" menjadi final. */
  finalAttempt?: boolean;
  /** Pakai baris run yang sudah ada (permintaan manual dari panel admin). */
  runId?: number;
  /** Override cakupan (test). Default: semua instrumen live aktif di database. */
  codes?: string[];
  /** Dijalankan setelah ada data baru: hitung indikator + evaluasi alert. */
  afterIngest?: () => Promise<void>;
  now?: Date;
  log?: (line: string) => void;
}

export interface DailyUpdateResult {
  runId: number;
  status: DailyRunStatus;
  note: string;
  sessionDate: string | null;
  ingest: IngestArjumSummary[];
}

interface UniverseRow {
  code: string;
  last_date: string | null;
  [key: string]: unknown;
}

/**
 * Cakupan pembaruan = instrumen live aktif yang sudah ada (bukan peringkat
 * market-cap harian, supaya cakupan tidak bergeser diam-diam). Urutan:
 * tanggal data terbaru, lalu nilai transaksi — yang teratas menjadi "saham
 * patokan" (saham yang sedang disuspensi tidak terpilih sebagai patokan).
 */
async function loadUniverse(db: Db, codes?: string[]): Promise<UniverseRow[]> {
  const filter = codes?.length ? sql`and i.code in ${codes}` : sql``;
  const result = await db.execute<UniverseRow & { value: string | null }>(sql`
    select i.code, b.trading_date::text as last_date, b.value::text as value
    from ${schema.instruments} i
    left join lateral (
      select d.trading_date, d.value from ${schema.dailyBars} d
      where d.instrument_id = i.id and d.close is not null and d.source = 'arjum'
      order by d.trading_date desc limit 1
    ) b on true
    where i.data_mode = 'live' and i.status = 'active' ${filter}
    order by b.trading_date desc nulls last, b.value desc nulls last, i.code
  `);
  return [...result];
}

async function finishRun(db: Db, runId: number, status: DailyRunStatus, note: string, error: string | null = null) {
  await db
    .update(schema.ingestionRuns)
    .set({ status, note, error, finishedAt: new Date() })
    .where(eq(schema.ingestionRuns.id, runId));
}

/**
 * Pembaruan harian lapis 1: cek saham patokan (1 request) → bila penyedia
 * punya sesi lebih baru dari yang tersimpan, ambil semua saham dalam cakupan
 * secara inkremental → hitung indikator → evaluasi alert.
 *
 * Status terjadwal "success" hanya bila sesi HARI INI (WIB) sudah tersimpan;
 * bila baru menyusul sesi lama, status "waiting" agar dicoba lagi. Pemanggil
 * wajib memegang lock ingest (lihat runDailyUpdateWithLock).
 */
export async function runDailyUpdate(
  db: Db,
  provider: Pick<ArjumProvider, "history">,
  options: DailyUpdateOptions,
): Promise<DailyUpdateResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? (() => {});
  const today = wibClock(now).date;
  const batchId = options.trigger === "scheduled" ? dailyBatchId(today) : `${dailyBatchId(today)}-manual`;
  const ingest: IngestArjumSummary[] = [];

  let runId = options.runId;
  if (runId) {
    await db.update(schema.ingestionRuns).set({ status: "running", startedAt: now, batchId }).where(eq(schema.ingestionRuns.id, runId));
  } else {
    const [run] = await db
      .insert(schema.ingestionRuns)
      .values({ provider: ARJUM_PROVIDER, capability: DAILY_CAPABILITY, status: "running", batchId, startedAt: now })
      .returning({ id: schema.ingestionRuns.id });
    runId = run!.id;
  }

  const done = async (status: DailyRunStatus, note: string, sessionDate: string | null, error: string | null = null) => {
    await finishRun(db, runId!, status, note, error);
    log(`[${status}] ${note}`);
    return { runId: runId!, status, note, sessionDate, ingest };
  };
  const notYet = options.finalAttempt ? "no_session" : "waiting";

  try {
    // Saham yang belum punya riwayat sama sekali diurus backfill, bukan di sini.
    const universe = (await loadUniverse(db, options.codes)).filter((u) => u.last_date !== null);
    if (universe.length === 0) {
      return await done("failed", "Belum ada saham live dengan riwayat harga. Jalankan: pnpm jobs:universe --backfill.", null);
    }
    const sentinel = universe[0]!;
    let target: string | null = null; // sesi terbaru penyedia menurut patokan

    // 1) Saham patokan: apakah penyedia punya sesi lebih baru dari yang tersimpan?
    if (options.trigger !== "manual") {
      const probe = await provider.history(sentinel.code, { limit: 20, frame: "daily" });
      const providerLast = validateArjumHistory(probe.data, sentinel.code, today).lastDate;
      log(`Patokan ${sentinel.code}: penyedia ${providerLast ?? "-"}, tersimpan ${sentinel.last_date ?? "-"}.`);
      // Sesi hari ini dari penyedia selalu diambil (jadwal berjalan setelah
      // bursa tutup); selain itu hanya bila lebih baru dari yang tersimpan.
      const nothingNew = !providerLast || (providerLast < today && sentinel.last_date !== null && providerLast <= sentinel.last_date);
      target = providerLast;
      if (nothingNew) {
        return await done(
          notYet,
          `Belum ada sesi baru dari penyedia (patokan ${sentinel.code}: data terakhir ${providerLast ?? "-"}). ` +
            (notYet === "no_session" ? "Hari ini dicatat tanpa sesi: libur bursa atau data penyedia terlambat." : "Dicoba lagi pada jadwal berikutnya."),
          providerLast,
        );
      }
    }

    // 2) Run terjadwal/cek hanya mengambil saham yang tertinggal dari sesi
    //    patokan (percobaan ulang jadi murah); manual mengambil ulang semua.
    //    Jendela candle dihitung per saham lalu dikelompokkan, supaya satu
    //    saham yang lama disuspensi tidak membesarkan permintaan semua saham.
    const toFetch = target ? universe.filter((u) => u.last_date! < target!) : universe;
    const groups = new Map<number, string[]>();
    for (const u of toFetch) {
      const limit = historyLimitForGap(u.last_date, today);
      groups.set(limit, [...(groups.get(limit) ?? []), u.code]);
    }
    log(
      `${toFetch.length} dari ${universe.length} saham diambil` +
        ` (${[...groups].map(([limit, c]) => `${c.length}×${limit} candle`).join(", ") || "-"}).`,
    );
    for (const [historyLimit, group] of [...groups].sort((a, b) => a[0] - b[0])) {
      for (let i = 0; i < group.length; i += MAX_CODES_PER_RUN) {
        const summary = await ingestArjumDailyBars(db, provider, { codes: group.slice(i, i + MAX_CODES_PER_RUN), historyLimit, now: options.now });
        ingest.push(summary);
        if (summary.stoppedEarly) break;
      }
      if (ingest.at(-1)?.stoppedEarly) break;
    }

    const stored = ingest.reduce((n, s) => n + s.codesStored, 0);
    const rows = ingest.reduce((n, s) => n + s.rowsUpserted, 0);
    const quarantined = ingest.reduce((n, s) => n + s.rowsQuarantined, 0);
    const failed = ingest.flatMap((s) => s.codesFailed);
    const stoppedEarly = ingest.find((s) => s.stoppedEarly)?.stoppedEarly ?? null;

    // 3) Sesi terbaru yang benar-benar tersimpan, dan saham yang tertinggal darinya.
    const codes = universe.map((u) => u.code);
    const after = await loadUniverse(db, codes);
    const sessionDate = after.map((u) => u.last_date).reduce<string | null>((a, d) => (d && (!a || d > a) ? d : a), null);
    const lagging = after.filter((u) => u.last_date !== sessionDate).map((u) => u.code);

    if (stored > 0 && options.afterIngest) await options.afterIngest();

    const usage = await getQuotaUsage(db, ARJUM_PROVIDER, now);
    const note = [
      `Sesi terbaru ${sessionDate ?? "-"}`,
      `${stored}/${toFetch.length} saham diambil (cakupan ${codes.length})`,
      `${rows.toLocaleString("id-ID")} baris`,
      quarantined ? `${quarantined} baris dikarantina` : null,
      ingest.some((x) => x.rowsSkippedUnfinished) ? `candle ${today} belum final (bursa belum tutup), tidak disimpan` : null,
      lagging.length ? `${lagging.length} saham tanpa sesi ${sessionDate} (mis. suspensi): ${lagging.slice(0, 10).join(", ")}${lagging.length > 10 ? ", …" : ""}` : null,
      usage ? `kuota terpakai hari ini ${usage.used}/${arjumDailyBudget()}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const error = [stoppedEarly, ...failed.map((f) => `${f.code}: ${f.error}`)].filter(Boolean).join(" | ").slice(0, 2000) || null;

    if (stored === 0 && toFetch.length > 0) return await done("failed", note, sessionDate, error ?? "Tidak ada saham yang tersimpan.");
    if (failed.length > 0 || stoppedEarly) return await done("partial", note, sessionDate, error);
    if (options.trigger !== "manual" && (!sessionDate || sessionDate < today)) {
      return await done(notYet, `${note} · sesi ${today} belum tersedia`, sessionDate);
    }
    return await done("success", note, sessionDate);
  } catch (error) {
    const code = error instanceof Error ? (error as { code?: string }).code : undefined;
    const message = error instanceof Error ? [code ?? error.name, error.message].filter(Boolean).join(": ") : String(error);
    return await done("failed", "Pembaruan gagal sebelum selesai.", null, message.slice(0, 2000));
  }
}

/** Ringkasan run pembaruan harian terjadwal untuk tanggal WIB tertentu. */
export async function scheduledRunsFor(db: Db, dateWib: string) {
  return db
    .select({ status: schema.ingestionRuns.status, startedAt: schema.ingestionRuns.startedAt })
    .from(schema.ingestionRuns)
    .where(and(eq(schema.ingestionRuns.capability, DAILY_CAPABILITY), eq(schema.ingestionRuns.batchId, dailyBatchId(dateWib))));
}

/** Permintaan manual dari panel admin yang belum dikerjakan worker. */
export async function pendingManualRequests(db: Db) {
  return db
    .select({ id: schema.ingestionRuns.id })
    .from(schema.ingestionRuns)
    .where(and(eq(schema.ingestionRuns.capability, DAILY_CAPABILITY), eq(schema.ingestionRuns.status, "requested")))
    .orderBy(schema.ingestionRuns.id);
}

/**
 * Dipanggil SETELAH lock ingest didapat: selama lock dipegang tidak ada ingest
 * lain yang berjalan, jadi setiap run ingest berstatus "running" pasti sisa
 * proses yang terputus (mis. koneksi direset, proses dimatikan).
 */
export async function failInterruptedIngestRuns(db: Db) {
  await db
    .update(schema.ingestionRuns)
    .set({ status: "failed", finishedAt: new Date(), error: "Terputus sebelum selesai (proses berhenti atau koneksi database terputus)." })
    .where(
      and(
        eq(schema.ingestionRuns.provider, ARJUM_PROVIDER),
        eq(schema.ingestionRuns.status, "running"),
        sql`${schema.ingestionRuns.capability} in ('daily_bars', 'backfill', 'universe', ${DAILY_CAPABILITY})`,
      ),
    );
}

/** Run "running" yang tertinggal karena proses mati di tengah jalan → failed. */
export async function failAbandonedRuns(db: Db, olderThanMinutes = 60) {
  await db
    .update(schema.ingestionRuns)
    .set({ status: "failed", finishedAt: new Date(), error: "Proses berhenti sebelum selesai (worker mati/di-restart)." })
    .where(
      and(
        eq(schema.ingestionRuns.capability, DAILY_CAPABILITY),
        eq(schema.ingestionRuns.status, "running"),
        sql`${schema.ingestionRuns.startedAt} < now() - (${olderThanMinutes} * interval '1 minute')`,
      ),
    );
}

export function createLiveArjumProvider(db: Db, log: (line: string) => void = console.log) {
  const apiKey = arjumApiKey();
  if (!apiKey) throw new ArjumMissingKeyError();
  return createArjumProvider(db, {
    apiKey,
    dailyLimit: arjumDailyBudget(),
    onAttempt: (a) => {
      if (a.outcome !== "ok") log(`  ${a.path} #${a.attempt} [${a.keyLabel}] → ${a.httpStatus ?? "-"} ${a.outcome}${a.error ? ` (${a.error})` : ""}`);
    },
  });
}

/** Hitung indikator data live lalu evaluasi alert — langkah setelah data baru masuk. */
export async function computeAfterIngest(): Promise<void> {
  await runComputeJob(["live"]);
  // Pengingat dinonaktifkan sementara (src/lib/features.ts).
  if (FEATURES.pengingat) await evaluateAlerts();
}

/**
 * Pembungkus dengan lock ingest bersama (`pnpm ingest:arjum` memakai lock yang
 * sama), sehingga pembaruan harian tidak pernah tumpang tindih dengan ingest
 * manual atau worker lain.
 */
export async function runDailyUpdateWithLock(db: Db, options: DailyUpdateOptions): Promise<DailyUpdateResult | { locked: true }> {
  try {
    return await withRenewingLock(db, LOCK_NAME, async () => {
      await failInterruptedIngestRuns(db);
      return runDailyUpdate(db, createLiveArjumProvider(db, options.log), { afterIngest: computeAfterIngest, ...options });
    });
  } catch (error) {
    if (error instanceof JobLockedError) return { locked: true };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// CLI: pnpm jobs:daily [--scheduled] [--manual]
//   (tanpa flag)  jalankan sekarang dengan cek saham patokan; tidak dihitung jadwal
//   --scheduled   patuhi jadwal (17.00 WIB hari kerja, ulang tiap jam) — untuk cron
//   --manual      lewati cek patokan, ambil ulang semua saham sekarang
// ---------------------------------------------------------------------------
async function main() {
  const args = new Set(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL belum diset.");
  const client = postgres(connectionString, { max: 2, prepare: false });
  const db = drizzle(client, { schema });
  const log = (line: string) => console.log(line);

  try {
    await failAbandonedRuns(db);
    let finalAttempt = false;
    if (args.has("--scheduled")) {
      const now = new Date();
      const decision = decideDailyRun(now, await scheduledRunsFor(db, quotaDateWib(now)));
      if (decision.action === "wait") {
        log(`Tidak dijalankan: ${decision.reason}`);
        return;
      }
      finalAttempt = decision.finalAttempt;
      log(`Percobaan terjadwal ke-${decision.attempt}${finalAttempt ? " (terakhir)" : ""}.`);
    }
    const trigger = args.has("--scheduled") ? "scheduled" : args.has("--manual") ? "manual" : "check";
    const result = await runDailyUpdateWithLock(db, { trigger, finalAttempt, log });
    if ("locked" in result) log("Tidak dijalankan: ingest lain sedang berjalan (lock aktif).");
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Pembaruan harian gagal:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
