import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "@/server/db/schema";
import { DATASET_DEFAULTS, markState, type DatasetHandler } from "@/server/jobs/datasets";
import type { ArjumProvider } from "@/server/providers/arjum/adapter";
import { ARJUM_PROVIDER, arjumDailyBudget, assertStockCode } from "@/server/providers/arjum/config";
import { ArjumAuthError, ArjumNonJsonError } from "@/server/providers/arjum/errors";
import { QuotaExhaustedError, effectiveRemaining, getQuotaUsage, quotaDateWib } from "@/server/quota/budget";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Permintaan data oleh pengguna — antrean BERSAMA.
 *
 *  1. Data yang masih segar tidak pernah diminta ulang ke penyedia.
 *  2. Satu dataset × saham hanya punya satu permintaan aktif; peminta
 *     berikutnya "ikut antre" tanpa memakai jatahnya.
 *  3. Jatah harian per pengguna hanya terpakai untuk permintaan BARU.
 *  4. Worker mengerjakan antrean SETELAH pembaruan harga harian dan jadwal
 *     admin, dengan anggaran harian tersendiri (lihat processRequestQueue).
 */

export const USER_DATASETS = ["financials", "broker_summary", "insiders", "broker_accumulation"] as const;
export type UserDataset = (typeof USER_DATASETS)[number];

export const USER_DATASET_INFO: Record<UserDataset, { label: string; what: string; ttlHours: number; freshText: string }> = {
  financials: {
    label: "Laporan keuangan",
    what: "Laba, pendapatan, aset, dan utang per kuartal. Dasar perhitungan PER, PBV, ROE.",
    ttlHours: 7 * 24,
    freshText: "dianggap baru selama 7 hari",
  },
  broker_summary: {
    label: "Ringkasan broker",
    what: "Broker mana yang paling banyak membeli dan menjual pada sesi terakhir.",
    ttlHours: 12,
    freshText: "dianggap baru selama 12 jam (satu sesi bursa)",
  },
  insiders: {
    label: "Transaksi insider",
    what: "Laporan direksi, komisaris, atau pemegang saham besar yang menambah/mengurangi sahamnya.",
    ttlHours: 7 * 24,
    freshText: "dianggap baru selama 7 hari",
  },
  broker_accumulation: {
    label: "Akumulasi broker",
    what: "Tren beli bersih broker teratas selama ±4 bulan terakhir.",
    ttlHours: 24,
    freshText: "dianggap baru selama 1 hari",
  },
};

export const isUserDataset = (d: string): d is UserDataset => (USER_DATASETS as readonly string[]).includes(d);
export const costOf = (d: UserDataset) => DATASET_DEFAULTS[d].costPerCode;
const MAX_ATTEMPTS = 3;
const RUNNING_STALE_MS = 30 * 60_000;

// ---------------------------------------------------------------------------
// Pengaturan
// ---------------------------------------------------------------------------

export interface RequestSettings {
  enabled: boolean;
  /** Request penyedia per hari yang boleh dipakai untuk antrean pengguna. */
  dailyBudget: number;
  /** Permintaan BARU per pengguna per hari (ikut antre tidak dihitung). */
  perUserDaily: number;
  /** Saham "Pantau lengkap" per pengguna. */
  maxFollows: number;
}

export const DEFAULT_REQUEST_SETTINGS: RequestSettings = { enabled: true, dailyBudget: 30, perUserDaily: 6, maxFollows: 5 };
const SETTINGS_KEY = "user_requests";
const USAGE_KEY = "user_requests_usage";

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

export function normalizeSettings(raw: Partial<RequestSettings> | null | undefined): RequestSettings {
  const d = DEFAULT_REQUEST_SETTINGS;
  return {
    enabled: typeof raw?.enabled === "boolean" ? raw.enabled : d.enabled,
    dailyBudget: clampInt(raw?.dailyBudget, 0, arjumDailyBudget(), d.dailyBudget),
    perUserDaily: clampInt(raw?.perUserDaily, 0, 50, d.perUserDaily),
    maxFollows: clampInt(raw?.maxFollows, 0, 50, d.maxFollows),
  };
}

export async function getRequestSettings(db: Db): Promise<RequestSettings> {
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, SETTINGS_KEY));
  return normalizeSettings(row?.value as Partial<RequestSettings> | undefined);
}

export async function saveRequestSettings(db: Db, input: Partial<RequestSettings>): Promise<RequestSettings> {
  const value = normalizeSettings({ ...(await getRequestSettings(db)), ...input });
  await db
    .insert(schema.appSettings)
    .values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
  return value;
}

export async function getUsageToday(db: Db, now: Date): Promise<number> {
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, USAGE_KEY));
  const v = row?.value as { date?: string; used?: number } | undefined;
  return v?.date === quotaDateWib(now) ? (v.used ?? 0) : 0;
}

async function addUsage(db: Db, n: number, now: Date) {
  if (n <= 0) return;
  const value = { date: quotaDateWib(now), used: (await getUsageToday(db, now)) + n };
  await db.insert(schema.appSettings).values({ key: USAGE_KEY, value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: now } });
}

/** Awal hari WIB sebagai Date (jatah harian di-reset 00.00 WIB, sama dengan kuota penyedia). */
export function startOfWibDay(now: Date): Date {
  return new Date(`${quotaDateWib(now)}T00:00:00+07:00`);
}

export function isFresh(dataset: UserDataset, lastSuccessAt: Date | null, now: Date): boolean {
  return lastSuccessAt !== null && now.getTime() - lastSuccessAt.getTime() < USER_DATASET_INFO[dataset].ttlHours * 3_600_000;
}

// ---------------------------------------------------------------------------
// Antrean & perkiraan waktu
// ---------------------------------------------------------------------------

export interface QueueItem {
  id: number;
  dataset: UserDataset;
  code: string;
  status: string;
  source: string;
  priority: number;
  requesters: number;
  createdAt: Date;
  position: number;
  /** 0 = hari ini, 1 = hari berikutnya, dst. — hari pemrosesan, bukan janji. */
  etaDay: number;
}

/** Antrean aktif, urutan sama persis dengan urutan kerja worker. */
export async function activeQueue(db: Db, now: Date, settings?: RequestSettings): Promise<QueueItem[]> {
  const s = settings ?? (await getRequestSettings(db));
  const rows = await db
    .select({
      id: schema.dataRequests.id,
      dataset: schema.dataRequests.dataset,
      code: schema.dataRequests.code,
      status: schema.dataRequests.status,
      source: schema.dataRequests.source,
      priority: schema.dataRequests.priority,
      createdAt: schema.dataRequests.createdAt,
      requesters: sql<number>`(select count(*)::int from ${schema.dataRequestSubscribers} s where s.request_id = ${schema.dataRequests.id})`,
    })
    .from(schema.dataRequests)
    .where(inArray(schema.dataRequests.status, ["queued", "running"]));
  rows.sort(
    (a, b) =>
      (a.status === "running" ? 0 : 1) - (b.status === "running" ? 0 : 1) ||
      b.priority - a.priority ||
      (a.source === "user" ? 0 : 1) - (b.source === "user" ? 0 : 1) ||
      b.requesters - a.requesters ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id - b.id,
  );
  const remainingToday = Math.max(0, s.dailyBudget - (await getUsageToday(db, now)));
  let cum = 0;
  return rows
    .filter((r) => isUserDataset(r.dataset))
    .map((r, i) => {
      cum += costOf(r.dataset as UserDataset);
      const etaDay = s.dailyBudget <= 0 ? Infinity : cum <= remainingToday ? 0 : 1 + Math.floor((cum - remainingToday - 1) / s.dailyBudget);
      return { ...r, dataset: r.dataset as UserDataset, position: i + 1, etaDay };
    });
}

export function etaText(etaDay: number): string {
  if (!Number.isFinite(etaDay)) return "menunggu admin membuka antrean";
  if (etaDay === 0) return "hari ini, setelah pembaruan harga sore";
  if (etaDay === 1) return "besok sore";
  return `±${etaDay} hari lagi`;
}

/** Status tiap dataset untuk satu saham: segar? sedang antre? */
export async function datasetStatusForCode(db: Db, code: string, now: Date, userId?: string | null) {
  const c = assertStockCode(code);
  const [states, queue] = await Promise.all([
    db
      .select({ dataset: schema.datasetFetchState.dataset, lastSuccessAt: schema.datasetFetchState.lastSuccessAt })
      .from(schema.datasetFetchState)
      .where(and(eq(schema.datasetFetchState.code, c), inArray(schema.datasetFetchState.dataset, [...USER_DATASETS]))),
    activeQueue(db, now),
  ]);
  const mine = userId
    ? new Set(
        (
          await db
            .select({ id: schema.dataRequestSubscribers.requestId })
            .from(schema.dataRequestSubscribers)
            .innerJoin(schema.dataRequests, eq(schema.dataRequests.id, schema.dataRequestSubscribers.requestId))
            .where(and(eq(schema.dataRequestSubscribers.userId, userId), eq(schema.dataRequests.code, c), inArray(schema.dataRequests.status, ["queued", "running"])))
        ).map((r) => r.id),
      )
    : new Set<number>();
  return USER_DATASETS.map((dataset) => {
    const last = states.find((x) => x.dataset === dataset)?.lastSuccessAt ?? null;
    const q = queue.find((x) => x.dataset === dataset && x.code === c) ?? null;
    return {
      dataset,
      label: USER_DATASET_INFO[dataset].label,
      what: USER_DATASET_INFO[dataset].what,
      lastSuccessAt: last,
      fresh: isFresh(dataset, last, now),
      queued: q ? { id: q.id, status: q.status, position: q.position, requesters: q.requesters, eta: etaText(q.etaDay), mine: mine.has(q.id) } : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Permintaan oleh pengguna
// ---------------------------------------------------------------------------

export type RequestOutcome = "fresh" | "queued" | "joined" | "already" | "limit";

export async function chargedToday(db: Db, userId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.dataRequestSubscribers)
    .where(and(eq(schema.dataRequestSubscribers.userId, userId), eq(schema.dataRequestSubscribers.charged, true), gte(schema.dataRequestSubscribers.createdAt, startOfWibDay(now))));
  return row?.n ?? 0;
}

export class RequestError extends Error {}

async function liveInstrument(db: Db, code: string) {
  const [inst] = await db
    .select({ id: schema.instruments.id, code: schema.instruments.code })
    .from(schema.instruments)
    .where(and(eq(schema.instruments.code, code), eq(schema.instruments.dataMode, "live")));
  return inst ?? null;
}

/**
 * Minta dataset untuk satu saham. Tidak pernah memanggil penyedia — hanya
 * mencatat ke antrean. Mengembalikan hasil per dataset dan sisa jatah.
 */
export async function requestData(db: Db, input: { userId: string; code: string; datasets: string[]; now?: Date }) {
  const now = input.now ?? new Date();
  const settings = await getRequestSettings(db);
  if (!settings.enabled) throw new RequestError("Permintaan data sedang ditutup oleh admin.");
  const code = assertStockCode(input.code);
  const datasets = [...new Set(input.datasets)].filter(isUserDataset);
  if (datasets.length === 0) throw new RequestError("Pilih minimal satu jenis data.");
  const inst = await liveInstrument(db, code);
  if (!inst) throw new RequestError("Saham ini tidak ada atau belum punya data real.");

  const results: Array<{ dataset: UserDataset; outcome: RequestOutcome }> = [];
  await db.transaction(async (tx) => {
    // Kunci per pengguna agar dua klik bersamaan tidak melampaui jatah.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`req-user:${input.userId}`}))`);
    let used = await chargedToday(tx as unknown as Db, input.userId, now);
    const states = await tx
      .select({ dataset: schema.datasetFetchState.dataset, lastSuccessAt: schema.datasetFetchState.lastSuccessAt })
      .from(schema.datasetFetchState)
      .where(and(eq(schema.datasetFetchState.code, code), inArray(schema.datasetFetchState.dataset, datasets)));
    for (const dataset of datasets) {
      if (isFresh(dataset, states.find((x) => x.dataset === dataset)?.lastSuccessAt ?? null, now)) {
        results.push({ dataset, outcome: "fresh" });
        continue;
      }
      const findActive = async () =>
        (
          await tx
            .select({ id: schema.dataRequests.id })
            .from(schema.dataRequests)
            .where(and(eq(schema.dataRequests.dataset, dataset), eq(schema.dataRequests.code, code), inArray(schema.dataRequests.status, ["queued", "running"])))
        )[0] ?? null;
      let active = await findActive();
      if (!active) {
        if (used >= settings.perUserDaily) {
          results.push({ dataset, outcome: "limit" });
          continue;
        }
        const inserted = await tx
          .insert(schema.dataRequests)
          .values({ dataset, code, instrumentId: inst.id, source: "user" })
          .onConflictDoNothing()
          .returning({ id: schema.dataRequests.id });
        if (inserted[0]) {
          await tx.insert(schema.dataRequestSubscribers).values({ requestId: inserted[0].id, userId: input.userId, charged: true });
          used += 1;
          results.push({ dataset, outcome: "queued" });
          continue;
        }
        active = await findActive(); // diminta orang lain di saat yang sama
        if (!active) throw new RequestError("Gagal mencatat permintaan, coba lagi.");
      }
      const joined = await tx
        .insert(schema.dataRequestSubscribers)
        .values({ requestId: active.id, userId: input.userId, charged: false })
        .onConflictDoNothing()
        .returning({ id: schema.dataRequestSubscribers.requestId });
      results.push({ dataset, outcome: joined.length ? "joined" : "already" });
    }
    return used;
  });
  const usedNow = await chargedToday(db, input.userId, now);
  return { results, remaining: Math.max(0, settings.perUserDaily - usedNow), perUserDaily: settings.perUserDaily };
}

/** Batalkan keikutsertaan. Permintaan yang tidak punya peminta lagi dibatalkan; jatah kembali. */
export async function leaveRequest(db: Db, userId: string, requestId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [req] = await tx.select().from(schema.dataRequests).where(eq(schema.dataRequests.id, requestId)).for("update");
    if (!req) throw new RequestError("Permintaan tidak ditemukan.");
    const removed = await tx
      .delete(schema.dataRequestSubscribers)
      .where(and(eq(schema.dataRequestSubscribers.requestId, requestId), eq(schema.dataRequestSubscribers.userId, userId)))
      .returning({ id: schema.dataRequestSubscribers.requestId });
    if (removed.length === 0) throw new RequestError("Anda tidak mengikuti permintaan ini.");
    if (req.status !== "queued") return;
    const [left] = await tx.select({ n: count() }).from(schema.dataRequestSubscribers).where(eq(schema.dataRequestSubscribers.requestId, requestId));
    if ((left?.n ?? 0) === 0) {
      await tx.update(schema.dataRequests).set({ status: "cancelled", note: "Dibatalkan peminta", updatedAt: new Date(), finishedAt: new Date() }).where(eq(schema.dataRequests.id, requestId));
    }
  });
}

/** Permintaan milik pengguna: yang aktif + riwayat 30 hari. */
export async function myRequests(db: Db, userId: string, now: Date) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const rows = await db
    .select({
      id: schema.dataRequests.id,
      dataset: schema.dataRequests.dataset,
      code: schema.dataRequests.code,
      status: schema.dataRequests.status,
      source: schema.dataRequests.source,
      note: schema.dataRequests.note,
      lastError: schema.dataRequests.lastError,
      createdAt: schema.dataRequests.createdAt,
      finishedAt: schema.dataRequests.finishedAt,
      charged: schema.dataRequestSubscribers.charged,
      joinedAt: schema.dataRequestSubscribers.createdAt,
    })
    .from(schema.dataRequestSubscribers)
    .innerJoin(schema.dataRequests, eq(schema.dataRequests.id, schema.dataRequestSubscribers.requestId))
    .where(and(eq(schema.dataRequestSubscribers.userId, userId), or(inArray(schema.dataRequests.status, ["queued", "running"]), gte(schema.dataRequests.updatedAt, since))))
    .orderBy(desc(schema.dataRequestSubscribers.createdAt))
    .limit(200);
  const queue = new Map((await activeQueue(db, now)).map((q) => [q.id, q]));
  return rows.filter((r) => isUserDataset(r.dataset)).map((r) => {
    const q = queue.get(r.id);
    return { ...r, dataset: r.dataset as UserDataset, label: USER_DATASET_INFO[r.dataset as UserDataset].label, position: q?.position ?? null, requesters: q?.requesters ?? null, eta: q ? etaText(q.etaDay) : null };
  });
}

/** Paling banyak diminta (jumlah peminta berbeda) dalam N hari. */
export async function popularRequests(db: Db, now: Date, days = 30, limit = 10) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await db
    .select({
      code: schema.dataRequests.code,
      dataset: schema.dataRequests.dataset,
      requesters: sql<number>`count(distinct ${schema.dataRequestSubscribers.userId})::int`,
    })
    .from(schema.dataRequests)
    .innerJoin(schema.dataRequestSubscribers, eq(schema.dataRequestSubscribers.requestId, schema.dataRequests.id))
    .where(gte(schema.dataRequestSubscribers.createdAt, since))
    .groupBy(schema.dataRequests.code, schema.dataRequests.dataset)
    .orderBy(desc(sql`count(distinct ${schema.dataRequestSubscribers.userId})`), asc(schema.dataRequests.code))
    .limit(limit);
  return rows.filter((r) => isUserDataset(r.dataset)).map((r) => ({ ...r, label: USER_DATASET_INFO[r.dataset as UserDataset].label }));
}

// ---------------------------------------------------------------------------
// "Pantau lengkap"
// ---------------------------------------------------------------------------

export async function myFollows(db: Db, userId: string) {
  return db
    .select({ instrumentId: schema.instruments.id, code: schema.instruments.code, name: schema.instruments.name, since: schema.userStockFollows.createdAt })
    .from(schema.userStockFollows)
    .innerJoin(schema.instruments, eq(schema.instruments.id, schema.userStockFollows.instrumentId))
    .where(eq(schema.userStockFollows.userId, userId))
    .orderBy(asc(schema.instruments.code));
}

export async function setFollow(db: Db, userId: string, code: string, on: boolean): Promise<{ following: boolean; count: number; max: number }> {
  const settings = await getRequestSettings(db);
  const c = assertStockCode(code);
  const inst = await liveInstrument(db, c);
  if (!inst) throw new RequestError("Saham ini tidak ada atau belum punya data real.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`follow-user:${userId}`}))`);
    if (on) {
      const [row] = await tx.select({ n: count() }).from(schema.userStockFollows).where(eq(schema.userStockFollows.userId, userId));
      const already = await tx.select().from(schema.userStockFollows).where(and(eq(schema.userStockFollows.userId, userId), eq(schema.userStockFollows.instrumentId, inst.id)));
      if (already.length === 0) {
        if (!settings.enabled) throw new RequestError("Permintaan data sedang ditutup oleh admin.");
        if ((row?.n ?? 0) >= settings.maxFollows) throw new RequestError(`Maksimal ${settings.maxFollows} saham bisa dipantau lengkap. Lepas salah satu dulu.`);
        await tx.insert(schema.userStockFollows).values({ userId, instrumentId: inst.id });
      }
    } else {
      await tx.delete(schema.userStockFollows).where(and(eq(schema.userStockFollows.userId, userId), eq(schema.userStockFollows.instrumentId, inst.id)));
    }
    const [after] = await tx.select({ n: count() }).from(schema.userStockFollows).where(eq(schema.userStockFollows.userId, userId));
    return { following: on, count: after?.n ?? 0, max: settings.maxFollows };
  });
}

/**
 * Saham yang dipantau lengkap: dataset yang sudah tidak segar dan belum antre
 * dimasukkan antrean (sumber "follow", tanpa memotong jatah, tanpa notifikasi
 * agar tidak berisik). Hanya menulis ke database.
 */
export async function enqueueFollows(db: Db, now: Date): Promise<number> {
  const follows = await db
    .select({ userId: schema.userStockFollows.userId, instrumentId: schema.instruments.id, code: schema.instruments.code })
    .from(schema.userStockFollows)
    .innerJoin(schema.instruments, eq(schema.instruments.id, schema.userStockFollows.instrumentId))
    .where(eq(schema.instruments.dataMode, "live"));
  if (follows.length === 0) return 0;
  const codes = [...new Set(follows.map((f) => f.code))];
  const states = await db
    .select({ dataset: schema.datasetFetchState.dataset, code: schema.datasetFetchState.code, lastSuccessAt: schema.datasetFetchState.lastSuccessAt })
    .from(schema.datasetFetchState)
    .where(and(inArray(schema.datasetFetchState.code, codes), inArray(schema.datasetFetchState.dataset, [...USER_DATASETS])));
  let created = 0;
  for (const code of codes) {
    const followers = follows.filter((f) => f.code === code);
    for (const dataset of USER_DATASETS) {
      if (isFresh(dataset, states.find((s) => s.code === code && s.dataset === dataset)?.lastSuccessAt ?? null, now)) continue;
      const inserted = await db
        .insert(schema.dataRequests)
        .values({ dataset, code, instrumentId: followers[0]!.instrumentId, source: "follow" })
        .onConflictDoNothing()
        .returning({ id: schema.dataRequests.id });
      if (inserted[0]) created += 1;
      const [active] = inserted[0]
        ? inserted
        : await db
            .select({ id: schema.dataRequests.id })
            .from(schema.dataRequests)
            .where(and(eq(schema.dataRequests.dataset, dataset), eq(schema.dataRequests.code, code), inArray(schema.dataRequests.status, ["queued", "running"])));
      if (!active) continue;
      await db
        .insert(schema.dataRequestSubscribers)
        .values(followers.map((f) => ({ requestId: active.id, userId: f.userId, charged: false, notify: false })))
        .onConflictDoNothing();
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

async function notifySubscribers(db: Db, req: { id: number; dataset: UserDataset; code: string }, ok: boolean, detail: string) {
  const subs = await db
    .select({ userId: schema.dataRequestSubscribers.userId })
    .from(schema.dataRequestSubscribers)
    .where(and(eq(schema.dataRequestSubscribers.requestId, req.id), eq(schema.dataRequestSubscribers.notify, true), isNull(schema.dataRequestSubscribers.notifiedAt)));
  if (subs.length === 0) return;
  const label = USER_DATASET_INFO[req.dataset].label;
  await db
    .insert(schema.notifications)
    .values(
      subs.map((s) => ({
        userId: s.userId,
        title: ok ? `Data ${req.code} siap: ${label}` : `Data ${req.code} belum berhasil diambil: ${label}`,
        body: ok
          ? `${detail} Buka halaman saham ${req.code} untuk melihatnya.`
          : `${detail} Anda bisa meminta lagi nanti dari halaman saham ${req.code}.`,
        idempotencyKey: `req:${req.id}:${s.userId}`,
      })),
    )
    .onConflictDoNothing();
  await db
    .update(schema.dataRequestSubscribers)
    .set({ notifiedAt: new Date() })
    .where(and(eq(schema.dataRequestSubscribers.requestId, req.id), inArray(schema.dataRequestSubscribers.userId, subs.map((s) => s.userId))));
}

export interface QueueRunSummary {
  done: number;
  alreadyFresh: number;
  failed: number;
  retried: number;
  requests: number;
  stopped: string | null;
}

/**
 * Kerjakan antrean sesuai urutan activeQueue. Hanya setelah pembaruan harga
 * harian final (`dailyDone`), dibatasi anggaran harian antrean DAN sisa kuota
 * efektif. Pemanggil memegang lock ingest yang sama dengan jadwal dataset.
 */
export async function processRequestQueue(
  db: Db,
  provider: ArjumProvider,
  handlers: Partial<Record<UserDataset, DatasetHandler>>,
  opts: { dailyDone: boolean; log: (line: string) => void; now?: Date },
): Promise<QueueRunSummary> {
  const now = opts.now ?? new Date();
  const summary: QueueRunSummary = { done: 0, alreadyFresh: 0, failed: 0, retried: 0, requests: 0, stopped: null };
  const settings = await getRequestSettings(db);
  if (!settings.enabled) return { ...summary, stopped: "Permintaan pengguna dinonaktifkan admin." };

  // Pemulihan: pekerjaan "running" yang tertinggal (worker mati di tengah jalan).
  await db
    .update(schema.dataRequests)
    .set({ status: "queued", updatedAt: now })
    .where(and(eq(schema.dataRequests.status, "running"), lte(schema.dataRequests.startedAt, new Date(now.getTime() - RUNNING_STALE_MS))));
  const followed = await enqueueFollows(db, now);
  if (followed > 0) opts.log(`[permintaan] ${followed} permintaan baru dari "Pantau lengkap".`);
  if (!opts.dailyDone) return { ...summary, stopped: "Menunggu pembaruan harga harian selesai." };

  let budgetLeft = settings.dailyBudget - (await getUsageToday(db, now));
  const dailyLimit = arjumDailyBudget();
  const queue = (await activeQueue(db, now, settings)).filter((q) => q.status === "queued");
  const nextAttempt = new Map(
    (
      await db
        .select({ id: schema.dataRequests.id, nextAttemptAt: schema.dataRequests.nextAttemptAt, attempts: schema.dataRequests.attempts, instrumentId: schema.dataRequests.instrumentId })
        .from(schema.dataRequests)
        .where(inArray(schema.dataRequests.id, queue.length ? queue.map((q) => q.id) : [-1]))
    ).map((r) => [r.id, r]),
  );

  for (const item of queue) {
    const meta = nextAttempt.get(item.id);
    if (!meta) continue;
    if (meta.nextAttemptAt && meta.nextAttemptAt > now) continue;
    const handler = handlers[item.dataset];
    if (!handler) continue;
    const cost = costOf(item.dataset);

    const [state] = await db
      .select({ lastSuccessAt: schema.datasetFetchState.lastSuccessAt })
      .from(schema.datasetFetchState)
      .where(and(eq(schema.datasetFetchState.dataset, item.dataset), eq(schema.datasetFetchState.code, item.code)));
    if (isFresh(item.dataset, state?.lastSuccessAt ?? null, now)) {
      // Sudah diambil jadwal admin/permintaan lain sejak diminta: 0 request.
      await db.update(schema.dataRequests).set({ status: "done", note: "Sudah tersedia (diambil oleh jadwal lain).", finishedAt: now, updatedAt: now }).where(eq(schema.dataRequests.id, item.id));
      await notifySubscribers(db, item, true, "Data sudah tersedia.");
      summary.alreadyFresh += 1;
      continue;
    }
    if (budgetLeft < cost) {
      summary.stopped = "Anggaran harian antrean permintaan habis; dilanjutkan besok.";
      break;
    }
    const quota = await getQuotaUsage(db, ARJUM_PROVIDER, now);
    if (effectiveRemaining(quota, dailyLimit) < cost) {
      summary.stopped = "Kuota harian penyedia habis; dilanjutkan besok.";
      break;
    }

    await db.update(schema.dataRequests).set({ status: "running", startedAt: now, updatedAt: now }).where(and(eq(schema.dataRequests.id, item.id), eq(schema.dataRequests.status, "queued")));
    const usedBefore = quota?.used ?? 0;
    let note: string | null = null;
    let error: unknown = null;
    try {
      note = await handler({ db, provider, code: item.code, instrumentId: meta.instrumentId, batchId: `req-${item.id}`, now });
    } catch (e) {
      error = e;
      note = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    const spent = Math.max(0, ((await getQuotaUsage(db, ARJUM_PROVIDER, now))?.used ?? usedBefore) - usedBefore);
    summary.requests += spent;
    budgetLeft -= spent;
    await addUsage(db, spent, now);
    await markState(db, item.dataset, item.code, error === null, note, now);

    if (error === null) {
      await db.update(schema.dataRequests).set({ status: "done", note: note?.slice(0, 500) ?? null, lastError: null, finishedAt: new Date(), updatedAt: new Date() }).where(eq(schema.dataRequests.id, item.id));
      await notifySubscribers(db, item, true, "Data sudah masuk.");
      summary.done += 1;
      continue;
    }
    const systemic = error instanceof QuotaExhaustedError || error instanceof ArjumAuthError || error instanceof ArjumNonJsonError;
    if (systemic) {
      // Bukan salah permintaan ini: kembalikan ke antrean tanpa menambah percobaan.
      await db.update(schema.dataRequests).set({ status: "queued", lastError: note?.slice(0, 1000) ?? null, updatedAt: new Date() }).where(eq(schema.dataRequests.id, item.id));
      summary.stopped = note;
      break;
    }
    const attempts = meta.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await db
        .update(schema.dataRequests)
        .set({ status: "failed", attempts, lastError: note?.slice(0, 1000) ?? null, finishedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.dataRequests.id, item.id));
      await notifySubscribers(db, item, false, `Sudah dicoba ${attempts} kali.`);
      summary.failed += 1;
    } else {
      await db
        .update(schema.dataRequests)
        .set({ status: "queued", attempts, lastError: note?.slice(0, 1000) ?? null, nextAttemptAt: new Date(now.getTime() + 60 * 60_000), updatedAt: new Date() })
        .where(eq(schema.dataRequests.id, item.id));
      summary.retried += 1;
    }
  }
  opts.log(
    `[permintaan] ${summary.done} selesai, ${summary.alreadyFresh} sudah tersedia, ${summary.retried} dicoba lagi nanti, ${summary.failed} gagal, ${summary.requests} request${summary.stopped ? ` — ${summary.stopped}` : ""}`,
  );
  return summary;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function recentFinished(db: Db, limit = 30) {
  return db
    .select({
      id: schema.dataRequests.id,
      dataset: schema.dataRequests.dataset,
      code: schema.dataRequests.code,
      status: schema.dataRequests.status,
      source: schema.dataRequests.source,
      note: schema.dataRequests.note,
      lastError: schema.dataRequests.lastError,
      finishedAt: schema.dataRequests.finishedAt,
    })
    .from(schema.dataRequests)
    .where(inArray(schema.dataRequests.status, ["done", "failed", "cancelled"]))
    .orderBy(desc(schema.dataRequests.finishedAt))
    .limit(limit);
}

export async function adminUpdateRequest(db: Db, id: number, action: "prioritize" | "cancel" | "retry"): Promise<void> {
  const [req] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.id, id));
  if (!req) throw new RequestError("Permintaan tidak ditemukan.");
  const now = new Date();
  if (action === "prioritize") {
    if (req.status !== "queued") throw new RequestError("Hanya permintaan yang masih antre yang bisa didahulukan.");
    await db.update(schema.dataRequests).set({ priority: req.priority + 10, updatedAt: now }).where(eq(schema.dataRequests.id, id));
  } else if (action === "cancel") {
    if (req.status !== "queued") throw new RequestError("Hanya permintaan yang masih antre yang bisa dibatalkan.");
    await db.update(schema.dataRequests).set({ status: "cancelled", note: "Dibatalkan admin", finishedAt: now, updatedAt: now }).where(eq(schema.dataRequests.id, id));
  } else {
    if (req.status !== "failed" && req.status !== "cancelled") throw new RequestError("Hanya permintaan gagal/dibatalkan yang bisa diulang.");
    const [active] = await db
      .select({ id: schema.dataRequests.id })
      .from(schema.dataRequests)
      .where(and(eq(schema.dataRequests.dataset, req.dataset), eq(schema.dataRequests.code, req.code), inArray(schema.dataRequests.status, ["queued", "running"])));
    if (active) throw new RequestError("Sudah ada permintaan aktif untuk data ini.");
    await db
      .update(schema.dataRequests)
      .set({ status: "queued", attempts: 0, nextAttemptAt: null, lastError: null, finishedAt: null, note: "Diulang admin", updatedAt: now })
      .where(eq(schema.dataRequests.id, id));
  }
}
