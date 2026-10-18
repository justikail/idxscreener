"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { requireOwnership, requireUser } from "@/server/auth/session";

export async function getMyNotifications() {
  const user = await requireUser();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(200);
}

export async function markNotificationRead(notificationId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();

  const [notification] = await db
    .select({ userId: notifications.userId })
    .from(notifications)
    .where(eq(notifications.id, notificationId))
    .limit(1);
  if (!notification) return { ok: false, error: "Notifikasi tidak ditemukan." };

  requireOwnership(user.id, notification.userId);

  await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, notificationId));
  revalidatePath("/notifikasi");
  return { ok: true };
}

/** Tandai semua notifikasi MILIK pengguna yang login sebagai dibaca. */
export async function markAllNotificationsRead(): Promise<{ ok: boolean; count: number }> {
  const user = await requireUser();
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  revalidatePath("/notifikasi");
  return { ok: true, count: updated.length };
}
