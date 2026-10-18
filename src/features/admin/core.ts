import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { clearMarketCache } from "@/server/db/queries";
import { dailyBars, dataQualityIssues, datasetSchedules, ingestionRuns, instruments } from "@/server/db/schema";
import { DATASETS, ensureDefaultSchedules, getDatasetOverview, parseCodesInput, type Dataset } from "@/server/jobs/datasets";
import { ForbiddenError } from "@/server/auth/errors";
import { runComputeJob } from "@/jobs/run";
import { DAILY_CAPABILITY, dailyBatchId, decideDailyRun, WORKER_LOCK, wibClock } from "@/server/jobs/daily-schedule";
import { isLockActive } from "@/server/jobs/lock";
import { ARJUM_PROVIDER, arjumBudgetClamped, arjumConfiguredKeyCount, arjumDailyBudget } from "@/server/providers/arjum/config";
import { effectiveRemaining, getQuotaUsage } from "@/server/quota/budget";

/** Dipanggil di AWAL setiap fungsi admin di file ini — pengecekan eksplisit,
 * bukan diasumsikan dari UI yang menyembunyikan tombol (AGENTS.md §11). */
export function assertAdminRole(role: string): void {
  if (role !== "admin") throw new ForbiddenError();
}

export async function getIngestionRunsCore(currentUserRole: string) {
  assertAdminRole(currentUserRole);
  return db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(200);
}

export async function getDataQualityIssuesCore(currentUserRole: string) {
  assertAdminRole(currentUserRole);
  return db.select().from(dataQualityIssues).orderBy(desc(dataQualityIssues.createdAt)).limit(200);
}

export async function retryComputeJobCore(currentUserRole: string): Promise<{ ok: boolean; error?: string }> {
  assertAdminRole(currentUserRole);
  try {
    await runComputeJob();
    clearMarketCache();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Job gagal." };
  }
  return { ok: true };
}

/**
 * Status pembaruan harian untuk panel admin: worker hidup atau tidak, run
 * terakhir, kuota hari ini, dan apa yang akan dilakukan jadwal sekarang.
 */
export async function getDailyStatusCore(currentUserRole: string) {
  assertAdminRole(currentUserRole);
  const now = new Date();
  const today = wibClock(now).date;
  const [worker, recentRuns, todaysScheduled, quota, [coverage]] = await Promise.all([
    isLockActive(db, WORKER_LOCK),
    db
      .select()
      .from(ingestionRuns)
      .where(eq(ingestionRuns.capability, DAILY_CAPABILITY))
      .orderBy(desc(ingestionRuns.id))
      .limit(10),
    db
      .select({ status: ingestionRuns.status, startedAt: ingestionRuns.startedAt })
      .from(ingestionRuns)
      .where(and(eq(ingestionRuns.capability, DAILY_CAPABILITY), eq(ingestionRuns.batchId, dailyBatchId(today)))),
    getQuotaUsage(db, ARJUM_PROVIDER, now),
    db.execute<{ total: number; priced: number; last_session: string | null }>(sql`
      select count(*)::int as total,
             count(*) filter (where exists (
               select 1 from ${dailyBars} d where d.instrument_id = i.id and d.source = 'arjum'
             ))::int as priced,
             (select max(trading_date)::text from ${dailyBars} where source = 'arjum') as last_session
      from ${instruments} i
      where i.data_mode = 'live' and i.status = 'active'
    `),
  ]);
  return {
    worker,
    recentRuns,
    decision: decideDailyRun(now, todaysScheduled),
    quota: { used: quota?.used ?? 0, limit: arjumDailyBudget() },
    coverage: {
      total: coverage?.total ?? 0,
      priced: coverage?.priced ?? 0,
      lastSession: coverage?.last_session ?? null,
    },
  };
}

/**
 * Minta pembaruan sekarang. Tidak menjalankan ingest di dalam request web
 * (bisa lebih dari satu menit dan memakai kuota): hanya mencatat permintaan,
 * lalu worker mengerjakannya dalam ±1 menit.
 */
export async function requestDailyUpdateCore(
  currentUserRole: string,
): Promise<{ ok: boolean; error?: string; workerActive?: boolean }> {
  assertAdminRole(currentUserRole);
  const [pending] = await db
    .select({ id: ingestionRuns.id, status: ingestionRuns.status })
    .from(ingestionRuns)
    .where(and(eq(ingestionRuns.capability, DAILY_CAPABILITY), inArray(ingestionRuns.status, ["requested", "running"])))
    .limit(1);
  if (pending) {
    return { ok: false, error: pending.status === "running" ? "Pembaruan sedang berjalan." : "Sudah ada permintaan yang menunggu worker." };
  }
  await db.insert(ingestionRuns).values({
    provider: ARJUM_PROVIDER,
    capability: DAILY_CAPABILITY,
    status: "requested",
    batchId: `${dailyBatchId(wibClock(new Date()).date)}-manual`,
  });
  const worker = await isLockActive(db, WORKER_LOCK);
  return { ok: true, workerActive: worker.active };
}

// ---------------------------------------------------------------------------
// Jadwal dataset tambahan (src/server/jobs/datasets.ts)
// ---------------------------------------------------------------------------

/** Batas input admin per dataset — mencegah polling seluruh pasar tanpa kendali. */
const DATASET_LIMITS: Record<Dataset, { minInterval: number; maxBudget: number; allowPriced: boolean; maxCodes: number }> = {
  health: { minInterval: 60, maxBudget: 24, allowPriced: false, maxCodes: 0 },
  // Batch /api/price/list: boleh semua saham; anggaran tetap dibatasi budget aplikasi.
  price: { minInterval: 15, maxBudget: 5000, allowPriced: true, maxCodes: 1000 },
  financials: { minInterval: 24 * 60, maxBudget: 400, allowPriced: true, maxCodes: 200 },
  broker_summary: { minInterval: 6 * 60, maxBudget: 300, allowPriced: true, maxCodes: 200 },
  insiders: { minInterval: 24 * 60, maxBudget: 200, allowPriced: true, maxCodes: 200 },
  broker_accumulation: { minInterval: 24 * 60, maxBudget: 100, allowPriced: false, maxCodes: 100 },
  seasonal: { minInterval: 7 * 24 * 60, maxBudget: 100, allowPriced: false, maxCodes: 100 },
};

export interface DatasetScheduleInput {
  dataset: string;
  enabled: boolean;
  scope: string;
  codes: string;
  intervalMinutes: number;
  dailyBudget: number;
  priority: number;
}

export async function updateDatasetScheduleCore(currentUserRole: string, input: DatasetScheduleInput): Promise<{ ok: boolean; error?: string }> {
  assertAdminRole(currentUserRole);
  if (!(DATASETS as readonly string[]).includes(input.dataset)) return { ok: false, error: "Dataset tidak dikenal." };
  const dataset = input.dataset as Dataset;
  const limits = DATASET_LIMITS[dataset];
  const scope = input.scope === "priced" ? "priced" : "list";
  if (scope === "priced" && !limits.allowPriced) return { ok: false, error: "Dataset ini hanya boleh untuk daftar kode terpilih." };
  if (!Number.isInteger(input.intervalMinutes) || input.intervalMinutes < limits.minInterval) {
    return { ok: false, error: `Interval minimal ${limits.minInterval} menit.` };
  }
  if (!Number.isInteger(input.dailyBudget) || input.dailyBudget < 0 || input.dailyBudget > Math.min(limits.maxBudget, arjumDailyBudget())) {
    return { ok: false, error: `Anggaran harian 0–${Math.min(limits.maxBudget, arjumDailyBudget())}.` };
  }
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 1000) return { ok: false, error: "Prioritas 0–1000." };
  let codes: string[];
  try {
    codes = parseCodesInput(input.codes);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Kode tidak valid." };
  }
  if (codes.length > limits.maxCodes) return { ok: false, error: `Maksimal ${limits.maxCodes} kode untuk dataset ini.` };
  if (codes.length > 0) {
    const demo = await db.select({ code: instruments.code }).from(instruments).where(and(inArray(instruments.code, codes), eq(instruments.dataMode, "demo")));
    if (demo.length > 0) return { ok: false, error: `Kode instrumen demo tidak menerima data real: ${demo.map((d) => d.code).join(", ")}.` };
  }
  await ensureDefaultSchedules(db);
  await db
    .update(datasetSchedules)
    .set({ enabled: input.enabled, scope, codes, intervalMinutes: input.intervalMinutes, dailyBudget: input.dailyBudget, priority: input.priority, updatedAt: new Date() })
    .where(eq(datasetSchedules.dataset, dataset));
  return { ok: true };
}

/**
 * Pemantauan terpisah (AGENTS.md §7): API penyedia dapat dihubungi, database
 * aplikasi sehat, worker aktif, dan data mutakhir adalah empat status
 * berbeda. HTTP 200 /api/health tidak membuktikan dataset terbaru tersedia.
 */
export async function getMonitoringCore(currentUserRole: string) {
  assertAdminRole(currentUserRole);
  const started = Date.now();
  let dbOk = true;
  try {
    await db.execute(sql`select 1`);
  } catch {
    dbOk = false;
  }
  const dbLatencyMs = Date.now() - started;
  const overview = await getDatasetOverview(db);
  const quota = await getQuotaUsage(db, ARJUM_PROVIDER);
  return {
    dbOk,
    dbLatencyMs,
    overview,
    quota: {
      used: quota?.used ?? 0,
      limit: arjumDailyBudget(),
      providerRemaining: quota?.providerRemaining ?? null,
      providerLimit: quota?.providerLimit ?? null,
      providerObservedAt: quota?.providerObservedAt ?? null,
      effectiveRemaining: effectiveRemaining(quota, arjumDailyBudget()),
    },
    budgetClamped: arjumBudgetClamped(),
    keyCount: arjumConfiguredKeyCount(),
    limits: DATASET_LIMITS,
  };
}

/**
 * "Jadwalkan permanen": tambahkan satu kode ke daftar jadwal dataset (dari
 * daftar paling banyak diminta). Validasi sama dengan formulir jadwal; status
 * aktif/nonaktif jadwal TIDAK diubah.
 */
export async function addCodeToScheduleCore(currentUserRole: string, dataset: string, code: string): Promise<{ ok: boolean; error?: string; message?: string }> {
  assertAdminRole(currentUserRole);
  if (!(DATASETS as readonly string[]).includes(dataset)) return { ok: false, error: "Dataset tidak dikenal." };
  await ensureDefaultSchedules(db);
  const [sch] = await db.select().from(datasetSchedules).where(eq(datasetSchedules.dataset, dataset));
  if (!sch) return { ok: false, error: "Jadwal tidak ditemukan." };
  const c = code.trim().toUpperCase();
  if (sch.scope === "priced") return { ok: true, message: "Jadwal ini sudah mencakup semua saham berharga." };
  if (sch.codes.includes(c)) return { ok: true, message: `${c} sudah ada di jadwal.` };
  const r = await updateDatasetScheduleCore(currentUserRole, {
    dataset,
    enabled: sch.enabled,
    scope: sch.scope,
    codes: [...sch.codes, c].join(","),
    intervalMinutes: sch.intervalMinutes,
    dailyBudget: sch.dailyBudget,
    priority: sch.priority,
  });
  return r.ok ? { ok: true, message: `${c} ditambahkan ke jadwal${sch.enabled ? "" : " (jadwal masih nonaktif)"}.` } : r;
}
