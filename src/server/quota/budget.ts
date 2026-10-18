import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "@/server/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

export class QuotaExhaustedError extends Error {
  constructor(
    public readonly provider: string,
    public readonly quotaDate: string,
    public readonly used: number,
    public readonly dailyLimit: number,
  ) {
    super(`Budget harian ${provider} untuk ${quotaDate} habis (${used}/${dailyLimit}).`);
    this.name = "QuotaExhaustedError";
  }
}

/** Tanggal kalender di zona Asia/Jakarta (WIB) — zona reset kuota Arjum. */
export function quotaDateWib(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Reservasi `count` request secara atomik. Satu statement UPDATE dengan
 * kondisi `used + count <= daily_limit` memastikan beberapa worker yang
 * berjalan bersamaan tidak bisa melampaui budget (tidak ada read-then-write).
 * Dipanggil SEBELUM setiap request dikirim, termasuk setiap retry.
 */
export async function reserveQuota(
  db: Db,
  provider: string,
  dailyLimit: number,
  count = 1,
  now: Date = new Date(),
): Promise<{ used: number; dailyLimit: number; quotaDate: string }> {
  const quotaDate = quotaDateWib(now);

  await db
    .insert(schema.providerQuotaUsage)
    .values({ provider, quotaDate, used: 0, dailyLimit })
    .onConflictDoNothing();

  const [row] = await db
    .update(schema.providerQuotaUsage)
    .set({
      used: sql`${schema.providerQuotaUsage.used} + ${count}`,
      dailyLimit,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(schema.providerQuotaUsage.provider, provider),
        eq(schema.providerQuotaUsage.quotaDate, quotaDate),
        sql`${schema.providerQuotaUsage.used} + ${count} <= ${dailyLimit}`,
        // Header penyedia (bila teramati hari ini) juga harus masih menyisakan kuota.
        sql`(${schema.providerQuotaUsage.providerRemaining} is null or ${schema.providerQuotaUsage.providerRemaining} >= ${count})`,
      ),
    )
    .returning({ used: schema.providerQuotaUsage.used });

  if (!row) {
    const [current] = await db
      .select({ used: schema.providerQuotaUsage.used })
      .from(schema.providerQuotaUsage)
      .where(
        and(eq(schema.providerQuotaUsage.provider, provider), eq(schema.providerQuotaUsage.quotaDate, quotaDate)),
      );
    throw new QuotaExhaustedError(provider, quotaDate, current?.used ?? 0, dailyLimit);
  }

  return { used: row.used, dailyLimit, quotaDate };
}

/**
 * Simpan header x-ratelimit-limit/remaining terakhir (hitungan penyedia).
 * Header tidak valid diabaikan.
 */
export async function recordProviderQuota(
  db: Db,
  provider: string,
  headers: Record<string, string>,
  dailyLimit: number,
  now: Date = new Date(),
): Promise<void> {
  const limit = parseHeaderInt(headers["x-ratelimit-limit"]);
  const remaining = parseHeaderInt(headers["x-ratelimit-remaining"]);
  if (limit === null && remaining === null) return;
  const quotaDate = quotaDateWib(now);
  await db
    .insert(schema.providerQuotaUsage)
    .values({ provider, quotaDate, used: 0, dailyLimit, providerLimit: limit, providerRemaining: remaining, providerObservedAt: now })
    .onConflictDoUpdate({
      target: [schema.providerQuotaUsage.provider, schema.providerQuotaUsage.quotaDate],
      set: { providerLimit: limit, providerRemaining: remaining, providerObservedAt: now },
    });
}

function parseHeaderInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Sisa kuota efektif = minimum dari sisa budget aplikasi dan sisa menurut
 * header penyedia hari ini (bila pernah teramati). Pemakaian di luar
 * aplikasi (audit, dashboard penyedia) hanya terlihat lewat header.
 */
export function effectiveRemaining(row: { used: number; providerRemaining: number | null } | null, dailyLimit: number): number {
  const local = Math.max(0, dailyLimit - (row?.used ?? 0));
  return row?.providerRemaining === null || row?.providerRemaining === undefined ? local : Math.min(local, row.providerRemaining);
}

export async function getQuotaUsage(db: Db, provider: string, now: Date = new Date()) {
  const quotaDate = quotaDateWib(now);
  const [row] = await db
    .select()
    .from(schema.providerQuotaUsage)
    .where(and(eq(schema.providerQuotaUsage.provider, provider), eq(schema.providerQuotaUsage.quotaDate, quotaDate)));
  return row ?? null;
}
