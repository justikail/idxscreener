"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/server/auth/config";
import { requireUser } from "@/server/auth/session";
import {
  addToWatchlistCore,
  getWatchlistCodesCore,
  getWatchlistCore,
  isInWatchlistCore,
  removeFromWatchlistByCodeCore,
  removeFromWatchlistCore,
} from "./core";

/**
 * userId SELALU diambil dari sesi server (requireUser()), TIDAK PERNAH dari
 * input form/klien — mencegah pengguna A memanipulasi watchlist pengguna B
 * dengan mengirim userId sendiri (AGENTS.md §11). Logic sesungguhnya ada di
 * core.ts (testable tanpa request context Next.js).
 */
export async function addToWatchlist(instrumentCode: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const result = await addToWatchlistCore(user.id, instrumentCode);
  revalidateWatchlistViews(instrumentCode);
  return result;
}

export async function removeFromWatchlistByCode(instrumentCode: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const result = await removeFromWatchlistByCodeCore(user.id, instrumentCode);
  revalidateWatchlistViews(instrumentCode);
  return result;
}

export async function removeFromWatchlist(itemId: number): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const result = await removeFromWatchlistCore(user.id, itemId);
  revalidatePath("/watchlist");
  return result;
}

export async function getMyWatchlist() {
  const user = await requireUser();
  return getWatchlistCore(user.id);
}

export async function isInWatchlist(instrumentId: string): Promise<boolean> {
  const user = await requireUser();
  return isInWatchlistCore(user.id, instrumentId);
}

/** Kode saham di watchlist pengguna yang sedang masuk; kosong bila belum masuk. */
export async function getMyWatchlistCodes(): Promise<Set<string>> {
  const session = await auth();
  if (!session?.user?.id) return new Set();
  return getWatchlistCodesCore(session.user.id);
}

function revalidateWatchlistViews(instrumentCode: string) {
  revalidatePath("/watchlist");
  revalidatePath(`/saham/${instrumentCode.toUpperCase()}`);
}
