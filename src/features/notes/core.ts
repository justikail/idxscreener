import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { instruments, notes } from "@/server/db/schema";
import { requireOwnership } from "@/server/auth/errors";

export async function addNoteCore(currentUserId: string, instrumentCode: string, body: string) {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false as const, error: "Catatan tidak boleh kosong." };
  if (trimmed.length > 4000) return { ok: false as const, error: "Catatan terlalu panjang (maks 4000 karakter)." };

  const [instrument] = await db
    .select({ id: instruments.id })
    .from(instruments)
    .where(eq(instruments.code, instrumentCode.toUpperCase()))
    .limit(1);
  if (!instrument) return { ok: false as const, error: "Saham tidak ditemukan." };

  await db.insert(notes).values({ userId: currentUserId, instrumentId: instrument.id, body: trimmed });
  return { ok: true as const };
}

/**
 * Melempar ForbiddenError bila catatan bukan milik currentUserId — dipanggil
 * SEBELUM delete di actions.ts. Baris dibaca dulu (bukan langsung DELETE
 * WHERE id+userId) supaya bisa membedakan "tidak ditemukan" vs "bukan milik
 * Anda" untuk pesan error yang jelas, sambil tetap aman: keputusan hapus
 * hanya terjadi setelah pengecekan eksplisit ini lulus.
 */
export async function deleteNoteCore(currentUserId: string, noteId: number) {
  const [note] = await db.select({ userId: notes.userId }).from(notes).where(eq(notes.id, noteId)).limit(1);
  if (!note) return { ok: false as const, error: "Catatan tidak ditemukan." };

  requireOwnership(currentUserId, note.userId);

  await db.delete(notes).where(eq(notes.id, noteId));
  return { ok: true as const };
}

export async function getNotesForInstrumentCore(currentUserId: string, instrumentId: string) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.instrumentId, instrumentId), eq(notes.userId, currentUserId)))
    .orderBy(desc(notes.createdAt));
}
