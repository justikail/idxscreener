import "@/server/load-env";

import { eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";
import { backfillMissingHistory, refreshArjumUniverse } from "@/jobs/universe";
import type { ArjumProvider } from "@/server/providers/arjum/adapter";
import { arjumHistoryResponseSchema, arjumMarketCapResponseSchema } from "@/server/providers/arjum/schemas";

// Tanpa request ke Arjum. Daftar saham palsu berisi kode 5 huruf (tidak
// bentrok dengan ticker BEI) dan satu kode demo nyata (DEMA) untuk memastikan
// instrumen demo tidak disentuh. Backfill dibatasi ke kode test (`onlyCodes`).

const connectionString = process.env.DATABASE_URL;
const CODES = ["ZUNVA", "ZUNVB", "ZUNVC", "ZUNVD", "ZUNVE"];
const EMPTY = "ZUNVE"; // penyedia tidak punya riwayat untuk kode ini
const response = (body: unknown, parsed: unknown) => ({
  data: parsed,
  response: { body, httpStatus: 200, contentType: "application/json", durationMs: 1, attempts: 1, responseHeaders: {} },
});

function fakeProvider(calls: string[]): Pick<ArjumProvider, "marketCap" | "history"> {
  const list = [...CODES.map((code) => ({ code, name: `PT ${code} Tbk` })), { code: "DEMA", name: "Nama Asli Bukan Demo" }];
  return {
    async marketCap({ page = 1 } = {}) {
      calls.push(`market-cap:${page}`);
      const pageRows = page === 1 ? list.slice(0, 3) : list.slice(3);
      const body = { date: "2026-09-18", total: list.length, page, per_page: 3, total_pages: 2, data: pageRows };
      return response(body, arjumMarketCapResponseSchema.parse(body)) as Awaited<ReturnType<ArjumProvider["marketCap"]>>;
    },
    async history(code: string) {
      calls.push(`history:${code}`);
      const rows =
        code === EMPTY
          ? []
          : ["2026-09-16", "2026-09-17", "2026-09-18"].map((date) => ({ date, open: 500, high: 510, low: 495, close: 505, value: 5e8, volume: 1e6, freq: 50 }));
      const body = { stock_code: code, frame: "daily", rows };
      return response(body, arjumHistoryResponseSchema.parse(body)) as Awaited<ReturnType<ArjumProvider["history"]>>;
    },
  };
}

describe.skipIf(!connectionString)("Daftar semua saham + backfill bertahap", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const batchIds: string[] = [];

  beforeAll(() => {
    client = postgres(connectionString!, { max: 4, prepare: false });
    db = drizzle(client, { schema });
  });

  afterAll(async () => {
    if (!db) return;
    const insts = await db.select({ id: schema.instruments.id }).from(schema.instruments).where(inArray(schema.instruments.code, CODES));
    const ids = insts.map((i) => i.id);
    if (ids.length) {
      await db.delete(schema.dataQualityIssues).where(inArray(schema.dataQualityIssues.instrumentId, ids));
      await db.delete(schema.dailyBars).where(inArray(schema.dailyBars.instrumentId, ids));
      await db.delete(schema.marketCapSnapshots).where(inArray(schema.marketCapSnapshots.instrumentId, ids));
      await db.delete(schema.instruments).where(inArray(schema.instruments.id, ids));
    }
    if (batchIds.length) {
      const runs = await db.select({ id: schema.ingestionRuns.id }).from(schema.ingestionRuns).where(inArray(schema.ingestionRuns.batchId, batchIds));
      const runIds = runs.map((r) => r.id);
      if (runIds.length) {
        await db.delete(schema.dataQualityIssues).where(inArray(schema.dataQualityIssues.ingestionRunId, runIds));
        await db.delete(schema.ingestionRuns).where(inArray(schema.ingestionRuns.id, runIds));
      }
      await db.delete(schema.providerRawSnapshots).where(inArray(schema.providerRawSnapshots.batchId, batchIds));
    }
    // Run "universe" buatan test ditandai catatan berisi tanggal palsu 2026-09-18 dari fixture.
    await db.delete(schema.ingestionRuns).where(like(schema.ingestionRuns.note, "6 saham di daftar penyedia (data 2026-09-18)%"));
    await client.end();
  }, 60_000);

  it("membaca semua halaman, menambah saham baru tanpa harga, tidak menyentuh instrumen demo", async () => {
    const calls: string[] = [];
    const [demoBefore] = await db.select().from(schema.instruments).where(eq(schema.instruments.code, "DEMA"));
    const result = await refreshArjumUniverse(db, fakeProvider(calls));

    expect(calls).toEqual(["market-cap:1", "market-cap:2"]);
    expect(result.total).toBe(6);
    expect(result.added).toBe(5);
    expect(result.ranking.slice(0, 5)).toEqual(CODES);
    const insts = await db.select().from(schema.instruments).where(inArray(schema.instruments.code, CODES));
    expect(insts.every((i) => i.dataMode === "live" && i.status === "active")).toBe(true);
    expect(insts.find((i) => i.code === "ZUNVA")!.name).toBe("PT ZUNVA Tbk");
    if (demoBefore) {
      const [demoAfter] = await db.select().from(schema.instruments).where(eq(schema.instruments.code, "DEMA"));
      expect(demoAfter).toEqual(demoBefore);
      expect(result.skippedDemo).toBe(1);
    }

    // Diulang: tidak ada duplikat.
    const again = await refreshArjumUniverse(db, fakeProvider([]));
    expect(again.added).toBe(0);
  }, 90_000);

  it("backfill memakai jatah yang ada, sisanya menunggu; urutan mengikuti peringkat", async () => {
    const calls: string[] = [];
    const first = await backfillMissingHistory(db, fakeProvider(calls), { onlyCodes: CODES, allowance: 2, priority: CODES });
    batchIds.push(first.summary!.batchId);
    expect(calls).toEqual(["history:ZUNVA", "history:ZUNVB"]);
    expect(first.attempted).toBe(2);
    expect(first.pending).toBe(3);

    const second = await backfillMissingHistory(db, fakeProvider([]), { onlyCodes: CODES, allowance: 10, priority: CODES });
    batchIds.push(second.summary!.batchId);
    expect(second.attempted).toBe(3); // ZUNVC, ZUNVD, ZUNVE
  }, 90_000);

  it("saham tanpa riwayat di penyedia ditandai dan tidak dicoba ulang setiap hari", async () => {
    const calls: string[] = [];
    const third = await backfillMissingHistory(db, fakeProvider(calls), { onlyCodes: CODES, allowance: 10 });
    expect(third.attempted).toBe(0);
    expect(calls).toEqual([]);
    const [inst] = await db.select({ id: schema.instruments.id }).from(schema.instruments).where(eq(schema.instruments.code, EMPTY));
    const issues = await db.select().from(schema.dataQualityIssues).where(eq(schema.dataQualityIssues.instrumentId, inst!.id));
    expect(issues.some((i) => /tidak mengembalikan riwayat/.test(i.message))).toBe(true);
  }, 60_000);

  it("kuota habis → tidak ada request, semua tetap menunggu", async () => {
    const calls: string[] = [];
    await db.delete(schema.dailyBars).where(
      inArray(
        schema.dailyBars.instrumentId,
        (await db.select({ id: schema.instruments.id }).from(schema.instruments).where(eq(schema.instruments.code, "ZUNVA"))).map((i) => i.id),
      ),
    );
    const result = await backfillMissingHistory(db, fakeProvider(calls), { onlyCodes: CODES, allowance: 0 });
    expect(calls).toEqual([]);
    expect(result.pending).toBe(1);
  }, 60_000);
});
