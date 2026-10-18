import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { savedScreens } from "@/server/db/schema";
import { requireOwnership } from "@/server/auth/errors";
import { filterNodeSchema, validateFilterNode, type FilterNode } from "@/domain/filter-ast";

export async function createSavedScreenCore(currentUserId: string, name: string, filter: FilterNode) {
  const trimmedName = name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 128) {
    return { ok: false as const, error: "Nama filter tersimpan tidak valid." };
  }

  const parsed = filterNodeSchema.safeParse(filter);
  if (!parsed.success) return { ok: false as const, error: "Filter tidak valid." };
  try {
    validateFilterNode(parsed.data);
  } catch {
    return { ok: false as const, error: "Filter tidak valid (operator/field tidak sesuai)." };
  }

  await db.insert(savedScreens).values({ userId: currentUserId, name: trimmedName, filter: parsed.data });
  return { ok: true as const };
}

export async function deleteSavedScreenCore(currentUserId: string, id: number) {
  const [screen] = await db
    .select({ userId: savedScreens.userId })
    .from(savedScreens)
    .where(eq(savedScreens.id, id))
    .limit(1);
  if (!screen) return { ok: false as const, error: "Filter tersimpan tidak ditemukan." };

  requireOwnership(currentUserId, screen.userId);

  await db.delete(savedScreens).where(eq(savedScreens.id, id));
  return { ok: true as const };
}

export async function getSavedScreensCore(currentUserId: string) {
  return db
    .select()
    .from(savedScreens)
    .where(eq(savedScreens.userId, currentUserId))
    .orderBy(desc(savedScreens.createdAt));
}
