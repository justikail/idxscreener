import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { instruments, watchlistItems } from "@/server/db/schema";
import { ForbiddenError } from "@/server/auth/errors";

/**
 * Logic inti watchlist, dipisah dari pembacaan sesi (requireUser()) di
 * actions.ts agar dapat diuji langsung tanpa request context Next.js — lihat
 * tests/integration/authorization.test.ts. `currentUserId` HARUS berasal dari
 * sesi terverifikasi di pemanggil (actions.ts), tidak pernah dari input klien.
 */

export async function addToWatchlistCore(currentUserId: string, instrumentCode: string) {
  const [instrument] = await db
    .select({ id: instruments.id })
    .from(instruments)
    .where(eq(instruments.code, instrumentCode.toUpperCase()))
    .limit(1);

  if (!instrument) return { ok: false as const, error: "Saham tidak ditemukan." };

  await db
    .insert(watchlistItems)
    .values({ userId: currentUserId, instrumentId: instrument.id })
    .onConflictDoNothing();

  return { ok: true as const };
}

/**
 * Menghapus item watchlist. WHERE userId=currentUserId ditegakkan di query,
 * BUKAN sekadar dicek lalu dihapus — baris milik pengguna lain tidak pernah
 * ter-delete meski itemId ditebak (defense in depth).
 */
export async function removeFromWatchlistCore(currentUserId: string, itemId: number) {
  await db
    .delete(watchlistItems)
    .where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.userId, currentUserId)));
  return { ok: true as const };
}

/** Hapus berdasarkan kode saham — dipakai tombol toggle di halaman detail. */
export async function removeFromWatchlistByCodeCore(currentUserId: string, instrumentCode: string) {
  const [instrument] = await db
    .select({ id: instruments.id })
    .from(instruments)
    .where(eq(instruments.code, instrumentCode.toUpperCase()))
    .limit(1);
  if (!instrument) return { ok: false as const, error: "Saham tidak ditemukan." };

  await db
    .delete(watchlistItems)
    .where(and(eq(watchlistItems.instrumentId, instrument.id), eq(watchlistItems.userId, currentUserId)));
  return { ok: true as const };
}

export async function isInWatchlistCore(currentUserId: string, instrumentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: watchlistItems.id })
    .from(watchlistItems)
    .where(and(eq(watchlistItems.userId, currentUserId), eq(watchlistItems.instrumentId, instrumentId)))
    .limit(1);
  return Boolean(row);
}

export async function getWatchlistCodesCore(currentUserId: string): Promise<Set<string>> {
  const rows = await db
    .select({ code: instruments.code })
    .from(watchlistItems)
    .innerJoin(instruments, eq(watchlistItems.instrumentId, instruments.id))
    .where(eq(watchlistItems.userId, currentUserId));
  return new Set(rows.map((r) => r.code));
}

export async function getWatchlistCore(currentUserId: string) {
  return db
    .select({
      itemId: watchlistItems.id,
      instrumentId: instruments.id,
      code: instruments.code,
      name: instruments.name,
      addedAt: watchlistItems.createdAt,
      ownerUserId: watchlistItems.userId,
    })
    .from(watchlistItems)
    .innerJoin(instruments, eq(watchlistItems.instrumentId, instruments.id))
    .where(eq(watchlistItems.userId, currentUserId));
}

/**
 * Varian yang melempar ForbiddenError bila item bukan milik currentUserId —
 * dipakai test untuk memverifikasi baris memang milik pengguna yang benar,
 * bukan hanya "delete tidak berpengaruh".
 */
export async function assertWatchlistItemOwnedBy(currentUserId: string, itemId: number): Promise<void> {
  const [item] = await db
    .select({ userId: watchlistItems.userId })
    .from(watchlistItems)
    .where(eq(watchlistItems.id, itemId))
    .limit(1);
  if (!item) return;
  if (item.userId !== currentUserId) throw new ForbiddenError();
}
