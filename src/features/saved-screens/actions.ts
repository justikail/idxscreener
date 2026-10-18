"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth/session";
import type { FilterNode } from "@/domain/filter-ast";
import { createSavedScreenCore, deleteSavedScreenCore, getSavedScreensCore } from "./core";

export async function createSavedScreen(name: string, filter: FilterNode): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const result = await createSavedScreenCore(user.id, name, filter);
  revalidatePath("/screener");
  return result;
}

export async function deleteSavedScreen(id: number): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const result = await deleteSavedScreenCore(user.id, id);
  revalidatePath("/screener");
  return result;
}

export async function getMySavedScreens() {
  const user = await requireUser();
  return getSavedScreensCore(user.id);
}
