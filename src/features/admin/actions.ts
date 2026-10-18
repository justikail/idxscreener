"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth/session";
import {
  addCodeToScheduleCore,
  getMonitoringCore,
  updateDatasetScheduleCore,
  getDataQualityIssuesCore,
  getIngestionRunsCore,
  getDailyStatusCore,
  requestDailyUpdateCore,
  retryComputeJobCore,
} from "./core";

export async function getIngestionRuns() {
  const user = await requireUser();
  return getIngestionRunsCore(user.role);
}

export async function getDataQualityIssues() {
  const user = await requireUser();
  return getDataQualityIssuesCore(user.role);
}

export async function retryComputeJob(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const result = await retryComputeJobCore(user.role);
  revalidatePath("/admin/jobs");
  return result;
}

export async function getDailyStatus() {
  const user = await requireUser();
  return getDailyStatusCore(user.role);
}

export async function requestDailyUpdate(): Promise<{ ok: boolean; error?: string; workerActive?: boolean }> {
  const user = await requireUser();
  const result = await requestDailyUpdateCore(user.role);
  revalidatePath("/admin/jobs");
  return result;
}

export async function getMonitoring() {
  const user = await requireUser();
  return getMonitoringCore(user.role);
}

/** Form panel admin → jadwal dataset. Otorisasi di core (bukan hanya UI). */
export async function updateDatasetSchedule(_prev: { ok: boolean; error?: string } | null, form: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const result = await updateDatasetScheduleCore(user.role, {
    dataset: String(form.get("dataset") ?? ""),
    enabled: form.get("enabled") === "on",
    scope: String(form.get("scope") ?? "list"),
    codes: String(form.get("codes") ?? ""),
    intervalMinutes: Number(form.get("intervalMinutes")),
    dailyBudget: Number(form.get("dailyBudget")),
    priority: Number(form.get("priority")),
  });
  revalidatePath("/admin/jobs");
  return result;
}

export async function scheduleCodePermanently(dataset: string, code: string): Promise<{ ok: boolean; error?: string; message?: string }> {
  const user = await requireUser();
  const result = await addCodeToScheduleCore(user.role, dataset, code);
  revalidatePath("/admin/jobs");
  return result;
}
