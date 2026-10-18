"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import {
  adminUpdateRequest,
  leaveRequest,
  RequestError,
  requestData,
  saveRequestSettings,
  setFollow,
  type RequestOutcome,
  type UserDataset,
} from "@/server/requests/core";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: unknown): { ok: false; error: string } => ({
  ok: false,
  error: error instanceof RequestError || (error instanceof Error && /Kode saham tidak valid/.test(error.message)) ? error.message : "Terjadi kesalahan. Coba lagi.",
});

/** Minta data tambahan untuk satu saham (hanya mencatat antrean; tidak memanggil penyedia). */
export async function requestStockData(
  code: string,
  datasets: string[],
): Promise<Result<{ results: Array<{ dataset: UserDataset; outcome: RequestOutcome }>; remaining: number; perUserDaily: number }>> {
  const user = await requireUser();
  try {
    const r = await requestData(db, { userId: user.id, code, datasets });
    revalidatePath(`/saham/${code.toUpperCase()}`);
    revalidatePath("/permintaan");
    return { ok: true, ...r };
  } catch (error) {
    return fail(error);
  }
}

export async function leaveMyRequest(requestId: number): Promise<Result> {
  const user = await requireUser();
  try {
    await leaveRequest(db, user.id, requestId);
    revalidatePath("/permintaan");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleFollow(code: string, on: boolean): Promise<Result<{ following: boolean; count: number; max: number }>> {
  const user = await requireUser();
  try {
    const r = await setFollow(db, user.id, code, on);
    revalidatePath("/permintaan");
    revalidatePath("/watchlist");
    revalidatePath(`/saham/${code.toUpperCase()}`);
    return { ok: true, ...r };
  } catch (error) {
    return fail(error);
  }
}

export async function updateRequestSettings(_prev: unknown, form: FormData): Promise<Result> {
  await requireAdmin();
  await saveRequestSettings(db, {
    enabled: form.get("enabled") === "on",
    dailyBudget: Number(form.get("dailyBudget")),
    perUserDaily: Number(form.get("perUserDaily")),
    maxFollows: Number(form.get("maxFollows")),
  });
  revalidatePath("/admin/jobs");
  return { ok: true };
}

export async function adminRequestAction(id: number, action: "prioritize" | "cancel" | "retry"): Promise<Result> {
  await requireAdmin();
  try {
    await adminUpdateRequest(db, id, action);
    revalidatePath("/admin/jobs");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
