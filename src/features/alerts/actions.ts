"use server";

import { desc, eq, getTableColumns } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import { alerts, instruments } from "@/server/db/schema";
import { requireOwnership, requireUser } from "@/server/auth/session";

const ALERTABLE_METRICS = ["price", "per", "pbv", "roe", "rsi14", "volume_relative_20d"] as const;
// Subset dari operator numerik filter-ast: alert TIDAK mendukung "eq" (ambang
// batas kesetaraan presisi floating point tidak berguna untuk alert harga).
const ALERT_OPERATORS = ["gt", "gte", "lt", "lte"] as const;
type AlertOperator = (typeof ALERT_OPERATORS)[number];

export async function createAlert(input: {
  instrumentCode: string;
  metric: string;
  operator: string;
  threshold: number;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();

  if (!ALERTABLE_METRICS.includes(input.metric as (typeof ALERTABLE_METRICS)[number])) {
    return { ok: false, error: "Metrik tidak didukung untuk alert." };
  }
  if (!ALERT_OPERATORS.includes(input.operator as AlertOperator)) {
    return { ok: false, error: "Operator tidak valid." };
  }
  if (!Number.isFinite(input.threshold)) {
    return { ok: false, error: "Ambang batas harus angka." };
  }

  const [instrument] = await db
    .select({ id: instruments.id })
    .from(instruments)
    .where(eq(instruments.code, input.instrumentCode.toUpperCase()))
    .limit(1);
  if (!instrument) return { ok: false, error: "Saham tidak ditemukan." };

  await db.insert(alerts).values({
    userId: user.id,
    instrumentId: instrument.id,
    metric: input.metric,
    operator: input.operator as AlertOperator,
    threshold: input.threshold.toString(),
  });

  revalidatePath("/watchlist");
  return { ok: true };
}

export async function deleteAlert(alertId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();

  const [alert] = await db.select({ userId: alerts.userId }).from(alerts).where(eq(alerts.id, alertId)).limit(1);
  if (!alert) return { ok: false, error: "Alert tidak ditemukan." };

  requireOwnership(user.id, alert.userId);

  await db.delete(alerts).where(eq(alerts.id, alertId));
  revalidatePath("/watchlist");
  return { ok: true };
}

export async function getMyAlerts() {
  const user = await requireUser();
  return db
    .select({ ...getTableColumns(alerts), code: instruments.code })
    .from(alerts)
    .innerJoin(instruments, eq(instruments.id, alerts.instrumentId))
    .where(eq(alerts.userId, user.id))
    .orderBy(desc(alerts.createdAt));
}
