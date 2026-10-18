import "@/server/load-env";

import { readFileSync } from "node:fs";
import { and, eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";
import { ingestArjumDailyBars } from "@/jobs/ingest-arjum";
import { seedDemoData } from "@/jobs/seed";
import { acquireJobLock, JobLockedError, withRenewingLock } from "@/server/jobs/lock";
import { QuotaExhaustedError, reserveQuota } from "@/server/quota/budget";
import type { ArjumProvider } from "@/server/providers/arjum/adapter";
import { arjumHistoryResponseSchema } from "@/server/providers/arjum/schemas";

// Tidak ada request ke Arjum: provider palsu mengembalikan fixture. Yang diuji
// adalah perilaku penyimpanan di PostgreSQL nyata (Neon dev).

const connectionString = process.env.DATABASE_URL;
const fixture = JSON.parse(readFileSync("fixtures/arjum/history-sample.json", "utf8"));
const RUN_TAG = `t${Date.now()}`;
const QUOTA_PROVIDER = `test-quota-${RUN_TAG}`;
const LOCK_NAME = `test-lock-${RUN_TAG}`;
const CODES = ["ZARJA", "ZARJB"]; // 5 huruf: tidak mungkin bentrok dengan ticker BEI (4 huruf)
const SEED_GUARD_CODE = "ZSEEDA";

function fakeProvider(calls: string[]): Pick<ArjumProvider, "history"> {
  return {
    async history(code: string) {
      calls.push(code);
      const body = { ...fixture, stock_code: code };
      return {
        data: arjumHistoryResponseSchema.parse(body),
        response: { body, httpStatus: 200, contentType: "application/json", durationMs: 1, attempts: 1, responseHeaders: {} },
      };
    },
  };
}

describe.skipIf(!connectionString)("Arjum: kuota, lock, ingestion idempotent, pemisahan sumber", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const batchIds: string[] = [];

  beforeAll(() => {
    client = postgres(connectionString!, { max: 4, prepare: false });
    db = drizzle(client, { schema });
  });

  afterAll(async () => {
    if (!db) return;
    const testCodes = [...CODES, SEED_GUARD_CODE];
    const instruments = await db
      .select({ id: schema.instruments.id })
      .from(schema.instruments)
      .where(inArray(schema.instruments.code, testCodes));
    const ids = instruments.map((i) => i.id);
    if (batchIds.length > 0) {
      const runs = await db
        .select({ id: schema.ingestionRuns.id })
        .from(schema.ingestionRuns)
        .where(inArray(schema.ingestionRuns.batchId, batchIds));
      const runIds = runs.map((r) => r.id);
      if (runIds.length > 0) {
        await db.delete(schema.dataQualityIssues).where(inArray(schema.dataQualityIssues.ingestionRunId, runIds));
        await db.delete(schema.ingestionRuns).where(inArray(schema.ingestionRuns.id, runIds));
      }
      await db.delete(schema.providerRawSnapshots).where(inArray(schema.providerRawSnapshots.batchId, batchIds));
    }
    if (ids.length > 0) {
      await db.delete(schema.dataQualityIssues).where(inArray(schema.dataQualityIssues.instrumentId, ids));
      await db.delete(schema.dailyBars).where(inArray(schema.dailyBars.instrumentId, ids));
      await db.delete(schema.instruments).where(inArray(schema.instruments.id, ids));
    }
    await db.delete(schema.providerQuotaUsage).where(like(schema.providerQuotaUsage.provider, "test-quota-%"));
    await db.delete(schema.jobLocks).where(like(schema.jobLocks.name, "test-lock-%"));
    await client.end();
  }, 60_000);

  it("reservasi kuota atomik: 15 reservasi bersamaan dengan limit 10 → tepat 10 berhasil", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 15 }, () => reserveQuota(db, QUOTA_PROVIDER, 10, 1)),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const exhausted = results.filter((r) => r.status === "rejected" && r.reason instanceof QuotaExhaustedError).length;
    expect(ok).toBe(10);
    expect(exhausted).toBe(5);
  }, 60_000);

  it("lock job: pemegang kedua ditolak, lease kedaluwarsa bisa diambil alih", async () => {
    const release = await acquireJobLock(db, LOCK_NAME, 60_000);
    await expect(acquireJobLock(db, LOCK_NAME, 60_000)).rejects.toBeInstanceOf(JobLockedError);
    await release();

    await acquireJobLock(db, LOCK_NAME, 1); // lease 1 ms, sengaja tidak dilepas
    await new Promise((r) => setTimeout(r, 50));
    const takeover = await acquireJobLock(db, LOCK_NAME, 60_000);
    await takeover();
  }, 60_000);

  it("lock berperpanjangan: tidak bisa direbut selama job berjalan melewati masa lease, bebas setelah selesai", async () => {
    const name = `${LOCK_NAME}-renew`;
    await withRenewingLock(
      db,
      name,
      async () => {
        await new Promise((r) => setTimeout(r, 2_500)); // > lease 1,5 s; diperpanjang tiap 0,5 s
        await expect(acquireJobLock(db, name, 60_000)).rejects.toBeInstanceOf(JobLockedError);
      },
      1_500,
    );
    const release = await acquireJobLock(db, name, 60_000); // dilepas setelah selesai
    await release();
  }, 60_000);

  it("ingest pertama menyimpan baris real (source=arjum, data_mode=live) dengan satuan apa adanya", async () => {
    const calls: string[] = [];
    const summary = await ingestArjumDailyBars(db, fakeProvider(calls), { codes: CODES, historyLimit: 120 });
    batchIds.push(summary.batchId);

    expect(calls).toEqual(CODES);
    expect(summary.codesStored).toBe(2);
    expect(summary.rowsUpserted).toBe(10);
    expect(summary.dateRange).toEqual({ first: "2026-09-14", last: "2026-09-18" });

    const [inst] = await db.select().from(schema.instruments).where(eq(schema.instruments.code, "ZARJA"));
    expect(inst!.dataMode).toBe("live");
    const bars = await db.select().from(schema.dailyBars).where(eq(schema.dailyBars.instrumentId, inst!.id));
    expect(bars).toHaveLength(5);
    const bar = bars.find((b) => b.tradingDate === "2026-09-14")!;
    expect(bar.source).toBe("arjum");
    expect(bar.adjustmentMethod).toBe("unverified");
    expect(bar.volume).toBe(2000000n); // lembar, tidak dikonversi
    expect(Number(bar.value)).toBe(2040000000);
  }, 90_000);

  it("ingest ulang idempotent: jumlah baris tetap, revision naik", async () => {
    const summary = await ingestArjumDailyBars(db, fakeProvider([]), { codes: CODES, historyLimit: 120 });
    batchIds.push(summary.batchId);

    const insts = await db.select({ id: schema.instruments.id }).from(schema.instruments).where(inArray(schema.instruments.code, CODES));
    const bars = await db
      .select()
      .from(schema.dailyBars)
      .where(inArray(schema.dailyBars.instrumentId, insts.map((i) => i.id)));
    expect(bars).toHaveLength(10);
    expect(bars.every((b) => b.revision === 2)).toBe(true);
  }, 90_000);

  it("baris dari sumber lain TIDAK ditimpa diam-diam", async () => {
    const [inst] = await db.select().from(schema.instruments).where(eq(schema.instruments.code, "ZARJB"));
    await db
      .update(schema.dailyBars)
      .set({ source: "idx", close: "999" })
      .where(and(eq(schema.dailyBars.instrumentId, inst!.id), eq(schema.dailyBars.tradingDate, "2026-09-15")));

    const summary = await ingestArjumDailyBars(db, fakeProvider([]), { codes: ["ZARJB"], historyLimit: 120 });
    batchIds.push(summary.batchId);

    expect(summary.rowsSkippedOtherSource).toBe(1);
    const [kept] = await db
      .select()
      .from(schema.dailyBars)
      .where(and(eq(schema.dailyBars.instrumentId, inst!.id), eq(schema.dailyBars.tradingDate, "2026-09-15")));
    expect(kept!.source).toBe("idx");
    expect(Number(kept!.close)).toBe(999);
  }, 90_000);

  it("kode yang dipakai instrumen DEMO (BAJA) tidak menerima harga real", async () => {
    const [demo] = await db.select().from(schema.instruments).where(eq(schema.instruments.code, "BAJA"));
    expect(demo?.dataMode).toBe("demo");
    const before = await db.select().from(schema.dailyBars).where(eq(schema.dailyBars.instrumentId, demo!.id));

    const calls: string[] = [];
    const summary = await ingestArjumDailyBars(db, fakeProvider(calls), { codes: ["BAJA"], historyLimit: 120 });
    batchIds.push(summary.batchId);

    expect(calls).toEqual([]); // tidak ada request — kuota tidak terbuang
    expect(summary.codesSkipped.map((s) => s.code)).toEqual(["BAJA"]);
    const after = await db.select().from(schema.dailyBars).where(eq(schema.dailyBars.instrumentId, demo!.id));
    expect(after.length).toBe(before.length);
    expect(after.every((b) => b.source === "demo")).toBe(true);
  }, 90_000);

  it("seed demo tidak menghapus instrumen/bar data REAL", async () => {
    const [live] = await db
      .insert(schema.instruments)
      .values({ code: SEED_GUARD_CODE, name: "Penjaga Seed", dataMode: "live" })
      .returning();
    await db.insert(schema.dailyBars).values({
      instrumentId: live!.id,
      tradingDate: "2026-09-18",
      close: "500",
      source: "arjum",
      batchId: `guard-${RUN_TAG}`,
    });

    await seedDemoData();

    const stillThere = await db.select().from(schema.instruments).where(eq(schema.instruments.code, SEED_GUARD_CODE));
    expect(stillThere).toHaveLength(1);
    const bars = await db.select().from(schema.dailyBars).where(eq(schema.dailyBars.instrumentId, live!.id));
    expect(bars).toHaveLength(1);
    // Instrumen ingest sebelumnya juga utuh.
    const ingested = await db.select().from(schema.instruments).where(inArray(schema.instruments.code, CODES));
    expect(ingested).toHaveLength(2);
  }, 240_000);
});
