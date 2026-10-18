"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth/session";
import { addNoteCore, deleteNoteCore, getNotesForInstrumentCore } from "./core";

export async function addNote(instrumentCode: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const result = await addNoteCore(user.id, instrumentCode, body);
  revalidatePath(`/saham/${instrumentCode.toUpperCase()}`);
  return result;
}

export async function deleteNote(noteId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const result = await deleteNoteCore(user.id, noteId);
  revalidatePath("/");
  return result;
}

export async function getMyNotesForInstrument(instrumentId: string) {
  const user = await requireUser();
  return getNotesForInstrumentCore(user.id, instrumentId);
}
