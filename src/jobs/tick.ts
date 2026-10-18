import "@/server/load-env";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { createLiveArjumProvider, failAbandonedRuns, pendingManualRequests, runDailyUpdateWithLock, scheduledRunsFor } from "./daily-update";
import { LOCK_NAME } from "./ingest-arjum";
import { runMaintenanceWithLock } from "./universe";
import { decideDailyRun, FINAL_STATUSES, wibClock } from "@/server/jobs/daily-schedule";
import { quotaDateWib } from "@/server/quota/budget";
import { DEFAULT_HANDLERS, runDatasetJobs } from "@/server/jobs/datasets";
import { processRequestQueue } from "@/server/requests/core";
import { FEATURES } from "@/lib/features";
import { JobLockedError, withRenewingLock } from "@/server/jobs/lock";
import { ArjumMissingKeyError } from "@/server/providers/arjum/errors";

type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface TickResult {
  manualRuns: number;
  scheduled: "ran" | "locked" | "wait";
  waitReason?: string;
  maintenance: "done" | "idle" | "locked" | "skipped";
  datasets: "ran" | "locked" | "skipped" | "no_key";
}

/**
 * Satu siklus penjadwal — dipakai worker (`pnpm worker`, tiap menit) dan
 * penjadwal eksternal (`pnpm jobs:tick`, mis. GitHub Actions):
 *   1. permintaan "Jalankan sekarang" dari panel admin;
 *   2. pembaruan terjadwal bila decideDailyRun() mengizinkan;
 *   3. perawatan cakupan (daftar saham mingguan + backfill dengan sisa kuota)
 *      hanya bila pembaruan hari itu sudah final atau akhir pekan, agar tidak
 *      memakan kuota yang dibutuhkan jadwal sore.
 * Aman dijalankan bersamaan dari beberapa tempat: lock ingest + reservasi
 * kuota di database mencegah tumpang tindih dan kelebihan kuota.
 */
export async function runSchedulerTick(
  db: Db,
  log: (line: string) => void,
  options: { maintenance?: boolean; datasets?: boolean } = {},
): Promise<TickResult> {
  await failAbandonedRuns(db);
  const result: TickResult = { manualRuns: 0, scheduled: "wait", maintenance: "skipped", datasets: "skipped" };

  for (const request of await pendingManualRequests(db)) {
    log(`Permintaan manual #${request.id} dari panel admin.`);
    const outcome = await runDailyUpdateWithLock(db, { trigger: "manual", runId: request.id, log });
    if ("locked" in outcome) {
      log("Ingest lain sedang berjalan; permintaan dicoba lagi pada siklus berikutnya.");
      return { ...result, scheduled: "locked" };
    }
    result.manualRuns += 1;
  }

  let now = new Date();
  const decision = decideDailyRun(now, await scheduledRunsFor(db, quotaDateWib(now)));
  if (decision.action === "run") {
    log(`Pembaruan terjadwal, percobaan ke-${decision.attempt}${decision.finalAttempt ? " (terakhir)" : ""}.`);
    const outcome = await runDailyUpdateWithLock(db, { trigger: "scheduled", finalAttempt: decision.finalAttempt, log });
    result.scheduled = "locked" in outcome ? "locked" : "ran";
  } else {
    result.waitReason = decision.reason;
  }

  now = new Date();
  const weekday = wibClock(now).weekday;
  const dayDone =
    (await scheduledRunsFor(db, quotaDateWib(now))).some((r) => FINAL_STATUSES.includes(r.status)) || weekday === 0 || weekday === 6;
  if (options.maintenance !== false && dayDone) {
    result.maintenance = await runMaintenanceWithLock(db, log);
    if (result.maintenance === "done") log("Perawatan cakupan selesai.");
  }

  // Dataset tambahan (laporan keuangan, broker, harga terpilih, health) —
  // setelah OHLCV & perawatan, dengan anggaran per dataset. Sebelum pembaruan
  // harian final hanya dataset intraday yang jalan dan kuota OHLCV dicadangkan.
  if (options.datasets !== false) {
    try {
      await withRenewingLock(db, LOCK_NAME, async () => {
        const provider = createLiveArjumProvider(db, log);
        await runDatasetJobs(db, provider, DEFAULT_HANDLERS, { dailyDone: dayDone, log });
        // Antrean permintaan pengguna: SETELAH jadwal admin, anggaran tersendiri.
        if (FEATURES.permintaanData) await processRequestQueue(db, provider, DEFAULT_HANDLERS, { dailyDone: dayDone, log });
      });
      result.datasets = "ran";
    } catch (error) {
      if (error instanceof JobLockedError) result.datasets = "locked";
      else if (error instanceof ArjumMissingKeyError) result.datasets = "no_key";
      else throw error;
    }
  }
  return result;
}

// CLI: pnpm jobs:tick — satu siklus lalu keluar (untuk cron/GitHub Actions).
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL belum diset.");
  const client = postgres(connectionString, { max: 2, prepare: false });
  const db = drizzle(client, { schema });
  const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`);
  try {
    const result = await runSchedulerTick(db, log);
    log(`Siklus selesai: ${JSON.stringify(result)}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Siklus penjadwal gagal:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
