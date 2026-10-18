import "@/server/load-env";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { runSchedulerTick } from "./tick";
import { WORKER_LOCK } from "@/server/jobs/daily-schedule";
import { acquireRenewableJobLock, JobLockedError } from "@/server/jobs/lock";

/**
 * Worker proses panjang (`pnpm worker`) untuk lapis 1 — pembaruan data
 * penutupan harian. Setiap menit:
 *   1. kerjakan permintaan "Jalankan sekarang" dari panel admin, lalu
 *   2. jalankan pembaruan terjadwal bila decideDailyRun() mengizinkan
 *      (hari kerja, mulai 17.00 WIB, ulang tiap jam, maks. 5 percobaan);
 *   3. setelah pembaruan hari itu selesai (atau akhir pekan): perbarui daftar
 *      saham mingguan dan isi riwayat saham baru dengan sisa kuota.
 *
 * Hanya satu worker boleh hidup: lock "worker" diperpanjang tiap menit dan
 * sekaligus menjadi tanda hidup di panel admin. Di hosting, jalankan proses
 * ini dengan process manager (systemd, pm2, container) — atau penjadwal yang
 * memanggil `pnpm jobs:tick` (siklus yang sama persis, lihat src/jobs/tick.ts).
 */
const TICK_MS = 60_000;
const LEASE_MS = 3 * 60_000;
const MAINTENANCE_EVERY_MS = 30 * 60_000;
const DATASETS_EVERY_MS = 5 * 60_000;

const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`);

/** Error koneksi (mis. AggregateError ETIMEDOUT) sering tanpa message — tampilkan kodenya. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as { code?: string }).code;
  return [code ?? error.name, error.message].filter(Boolean).join(": ");
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL belum diset.");
  const client = postgres(connectionString, { max: 2, prepare: false, idle_timeout: 20, max_lifetime: 60 * 30 });
  const db = drizzle(client, { schema });

  let lease: Awaited<ReturnType<typeof acquireRenewableJobLock>>;
  try {
    lease = await acquireRenewableJobLock(db, WORKER_LOCK, LEASE_MS);
  } catch (error) {
    if (error instanceof JobLockedError) {
      console.error("Worker lain sudah berjalan. Proses ini berhenti.");
      await client.end();
      process.exit(1);
    }
    throw error;
  }

  let busy = false;
  let stopping = false;
  let lastWaitReason = "";
  let lastMaintenance = 0;
  let lastDatasets = 0;

  const shutdown = async (code = 0) => {
    if (stopping) return;
    stopping = true;
    clearInterval(heartbeat);
    clearInterval(ticker);
    // Koneksi database bisa tersangkut (mis. socket FIN-WAIT saat paket hilang):
    // jangan menunggu lebih dari 5 detik untuk membereskannya.
    // Lepas lock DULU, baru tutup koneksi: menutup koneksi bersamaan membatalkan
    // query pelepasan, sehingga worker pengganti tertolak sampai lease habis.
    const cleanup = lease
      .release()
      .catch(() => {})
      .then(() => client.end({ timeout: 2 }).catch(() => {}));
    await Promise.race([cleanup, new Promise((r) => setTimeout(r, 5_000))]);
    log("Worker berhenti.");
    process.exit(code);
  };

  // Lease diperpanjang terpisah dari tick, supaya tetap hidup selama pembaruan berjalan.
  // Watchdog: bila lease tidak berhasil diperpanjang selama 2× masa lease
  // (query database menggantung tanpa error), keluar dengan kode 1 agar
  // supervisor (`pnpm worker:loop`, systemd, pm2) menjalankan ulang — lebih
  // baik daripada proses hidup tetapi diam tanpa memperbarui data.
  let lastRenewOk = Date.now();
  const heartbeat = setInterval(() => {
    if (Date.now() - lastRenewOk > 2 * LEASE_MS) {
      console.error(`${new Date().toISOString()} Watchdog: lease tidak diperpanjang > ${(2 * LEASE_MS) / 60_000} menit (database menggantung) — keluar.`);
      process.exit(1);
    }
    lease
      .renew()
      .then((ok) => {
        if (ok) lastRenewOk = Date.now();
        if (!ok) {
          console.error("Lock worker diambil proses lain — berhenti.");
          void shutdown(1);
        }
      })
      .catch((error) => console.error(`${new Date().toISOString()} Gagal memperpanjang lock worker: ${describeError(error)}`));
  }, TICK_MS);

  const tick = async () => {
    if (busy || stopping) return;
    busy = true;
    try {
      // Perawatan cakupan dicek paling sering tiap 30 menit.
      const now = Date.now();
      const allowMaintenance = now - lastMaintenance > MAINTENANCE_EVERY_MS;
      const allowDatasets = now - lastDatasets > DATASETS_EVERY_MS;
      const result = await runSchedulerTick(db, log, { maintenance: allowMaintenance, datasets: allowDatasets });
      if (result.maintenance !== "skipped") lastMaintenance = now;
      if (result.datasets !== "skipped") lastDatasets = now;
      if (result.waitReason && result.waitReason !== lastWaitReason) log(`Menunggu: ${result.waitReason}`);
      lastWaitReason = result.waitReason ?? "";
    } catch (error) {
      console.error(`${new Date().toISOString()} Iterasi worker gagal: ${describeError(error)}`);
    } finally {
      busy = false;
    }
  };

  const ticker = setInterval(() => void tick(), TICK_MS);
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  log("Worker dimulai: pembaruan harian hari kerja mulai 17.00 WIB, cek tiap menit.");
  await tick();
}

main().catch((error) => {
  console.error("Worker gagal start:", error);
  process.exit(1);
});
