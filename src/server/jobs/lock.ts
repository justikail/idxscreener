import { and, eq, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { randomUUID } from "node:crypto";

import * as schema from "@/server/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

export class JobLockedError extends Error {
  constructor(public readonly jobName: string) {
    super(`Job "${jobName}" sedang berjalan di proses lain (lock aktif). Tidak dijalankan ganda.`);
    this.name = "JobLockedError";
  }
}

/**
 * Ambil lock berbasis lease secara atomik. Lock yang lease-nya sudah lewat
 * (mis. proses mati tanpa melepas lock) boleh diambil alih. Mengembalikan
 * fungsi release yang hanya melepas lock milik owner ini.
 */
export async function acquireJobLock(db: Db, name: string, leaseMs: number): Promise<() => Promise<void>> {
  return (await acquireRenewableJobLock(db, name, leaseMs)).release;
}

/**
 * Seperti acquireJobLock, ditambah `renew()` untuk memperpanjang lease selama
 * proses masih hidup. Dipakai worker: lock sekaligus menjadi tanda "worker
 * hidup" yang dibaca panel admin, dan mencegah dua worker berjalan bersamaan.
 * `renew()` mengembalikan false bila lock sudah diambil alih proses lain.
 */
export async function acquireRenewableJobLock(
  db: Db,
  name: string,
  leaseMs: number,
): Promise<{ release: () => Promise<void>; renew: () => Promise<boolean> }> {
  const owner = randomUUID();
  // Waktu lease dihitung dengan jam server DB (bukan jam proses), sama dengan
  // `now()` yang dipakai untuk membandingkan — aman dari selisih jam antar mesin.
  const lockedUntil = sql`now() + (${Math.max(0, Math.floor(leaseMs))} * interval '1 millisecond')`;

  await db.insert(schema.jobLocks).values({ name, owner, lockedUntil }).onConflictDoNothing();

  const [claimed] = await db
    .update(schema.jobLocks)
    .set({ owner, lockedUntil, acquiredAt: sql`now()` })
    .where(
      and(
        eq(schema.jobLocks.name, name),
        // Milik kita sendiri (baru saja di-insert) ATAU lease lama sudah kedaluwarsa.
        sql`(${schema.jobLocks.owner} = ${owner} OR ${schema.jobLocks.lockedUntil} < now())`,
      ),
    )
    .returning({ owner: schema.jobLocks.owner });

  if (!claimed) throw new JobLockedError(name);

  return {
    release: async () => {
      await db
        .delete(schema.jobLocks)
        .where(and(eq(schema.jobLocks.name, name), eq(schema.jobLocks.owner, owner)));
    },
    renew: async () => {
      const [renewed] = await db
        .update(schema.jobLocks)
        .set({ lockedUntil })
        .where(and(eq(schema.jobLocks.name, name), eq(schema.jobLocks.owner, owner)))
        .returning({ owner: schema.jobLocks.owner });
      return Boolean(renewed);
    },
  };
}

/** Lock masih aktif (lease belum lewat)? Dipakai untuk status worker di panel admin. */
export async function isLockActive(db: Db, name: string): Promise<{ active: boolean; acquiredAt: Date | null; lockedUntil: Date | null }> {
  const [row] = await db
    .select({ acquiredAt: schema.jobLocks.acquiredAt, lockedUntil: schema.jobLocks.lockedUntil, active: sql<boolean>`${schema.jobLocks.lockedUntil} > now()` })
    .from(schema.jobLocks)
    .where(eq(schema.jobLocks.name, name))
    .limit(1);
  return { active: Boolean(row?.active), acquiredAt: row?.acquiredAt ?? null, lockedUntil: row?.lockedUntil ?? null };
}

export async function clearExpiredLocks(db: Db): Promise<void> {
  await db.delete(schema.jobLocks).where(lt(schema.jobLocks.lockedUntil, sql`now()`));
}

/**
 * Jalankan `fn` sambil memegang lock dengan lease pendek yang diperpanjang
 * berkala. Bila proses mati di tengah jalan, lock bebas paling lambat
 * `leaseMs` kemudian (bukan berjam-jam seperti lease panjang tanpa perpanjangan).
 */
export async function withRenewingLock<T>(db: Db, name: string, fn: () => Promise<T>, leaseMs = 10 * 60_000): Promise<T> {
  const lease = await acquireRenewableJobLock(db, name, leaseMs);
  const timer = setInterval(() => {
    lease.renew().catch(() => {});
  }, Math.max(1_000, Math.floor(leaseMs / 3)));
  try {
    return await fn();
  } finally {
    clearInterval(timer);
    await lease.release().catch(() => {});
  }
}
