import "@/server/load-env";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";
import { ingestArjumDailyBars } from "@/jobs/ingest-arjum";
import { runDailyUpdate, type DailyUpdateResult } from "@/jobs/daily-update";
import type { ArjumProvider } from "@/server/providers/arjum/adapter";
import { arjumHistoryResponseSchema } from "@/server/providers/arjum/schemas";

// Tidak ada request ke Arjum. Provider palsu mengembalikan candle sampai
// tanggal yang diatur per kode. "Sekarang" = Senin 21 Sep 2026 18.00 WIB —
// tanggal lampau, supaya label run test (daily-2026-09-21) tidak pernah sama
// dengan jadwal hari ini milik worker sungguhan.

const connectionString = process.env.DATABASE_URL;
const NOW = new Date("2026-09-21T18:00:00+07:00");
const CODES = ["ZDLYA", "ZDLYB"]; // 5 huruf: tidak bentrok dengan ticker BEI
const VALUE: Record<string, number> = { ZDLYA: 10_000_000_000, ZDLYB: 1_000_000_000 };

/** 5 hari kerja berakhir di `last`, harga sederhana yang lolos validasi. */
function rowsUntil(code: string, last: string) {
  const rows = [];
  const d = new Date(`${last}T00:00:00Z`);
  while (rows.length < 5) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) {
      rows.unshift({ date: d.toISOString().slice(0, 10), open: 1000, high: 1020, low: 990, close: 1010, value: VALUE[code], volume: 1_000_000, freq: 100 });
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return rows;
}

function fakeProvider(lastDates: Record<string, string>, calls: string[]): Pick<ArjumProvider, "history"> {
  return {
    async history(code: string) {
      calls.push(code);
      const body = { stock_code: code, frame: "daily", rows: rowsUntil(code, lastDates[code]!) };
      return {
        data: arjumHistoryResponseSchema.parse(body),
        response: { body, httpStatus: 200, contentType: "application/json", durationMs: 1, attempts: 1, responseHeaders: {} },
      };
    },
  };
}

describe.skipIf(!connectionString)("Pembaruan harian (lapis 1): patokan, status, idempotensi", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const runIds: number[] = [];
  const batchIds: string[] = [];
  let computeCalls = 0;

  const daily = async (
    lastDates: Record<string, string>,
    opts: { finalAttempt?: boolean; trigger?: "scheduled" | "manual"; now?: Date } = {},
  ) => {
    const calls: string[] = [];
    const result: DailyUpdateResult = await runDailyUpdate(db, fakeProvider(lastDates, calls), {
      trigger: opts.trigger ?? "scheduled",
      finalAttempt: opts.finalAttempt,
      codes: CODES,
      now: opts.now ?? NOW,
      afterIngest: async () => {
        computeCalls += 1;
      },
    });
    runIds.push(result.runId);
    batchIds.push(...result.ingest.map((s) => s.batchId));
    return { result, calls };
  };

  const barCount = async (code: string) => {
    const [inst] = await db.select({ id: schema.instruments.id }).from(schema.instruments).where(eq(schema.instruments.code, code));
    return (await db.select({ id: schema.dailyBars.id }).from(schema.dailyBars).where(eq(schema.dailyBars.instrumentId, inst!.id))).length;
  };

  beforeAll(async () => {
    client = postgres(connectionString!, { max: 4, prepare: false });
    db = drizzle(client, { schema });
    // Data awal sampai Kamis 17 Sep.
    const seed = await ingestArjumDailyBars(db, fakeProvider({ ZDLYA: "2026-09-17", ZDLYB: "2026-09-17" }, []), { codes: CODES, historyLimit: 20 });
    batchIds.push(seed.batchId);
  }, 90_000);

  afterAll(async () => {
    if (!db) return;
    const insts = await db.select({ id: schema.instruments.id }).from(schema.instruments).where(inArray(schema.instruments.code, CODES));
    const ids = insts.map((i) => i.id);
    if (batchIds.length) {
      const runs = await db.select({ id: schema.ingestionRuns.id }).from(schema.ingestionRuns).where(inArray(schema.ingestionRuns.batchId, batchIds));
      runIds.push(...runs.map((r) => r.id));
      await db.delete(schema.providerRawSnapshots).where(inArray(schema.providerRawSnapshots.batchId, batchIds));
    }
    if (runIds.length) {
      await db.delete(schema.dataQualityIssues).where(inArray(schema.dataQualityIssues.ingestionRunId, runIds));
      await db.delete(schema.ingestionRuns).where(inArray(schema.ingestionRuns.id, runIds));
    }
    if (ids.length) {
      await db.delete(schema.dataQualityIssues).where(inArray(schema.dataQualityIssues.instrumentId, ids));
      await db.delete(schema.dailyBars).where(inArray(schema.dailyBars.instrumentId, ids));
      await db.delete(schema.instruments).where(inArray(schema.instruments.id, ids));
    }
    await client.end();
  }, 60_000);

  it("menyusul sesi lama (Jumat) tetapi sesi hari ini belum ada → disimpan, status waiting", async () => {
    const { result, calls } = await daily({ ZDLYA: "2026-09-18", ZDLYB: "2026-09-18" });
    expect(calls).toEqual(["ZDLYA", "ZDLYA", "ZDLYB"]); // patokan = nilai transaksi terbesar, lalu semua saham
    expect(result.status).toBe("waiting");
    expect(result.sessionDate).toBe("2026-09-18");
    expect(computeCalls).toBe(1);
    expect(await barCount("ZDLYA")).toBe(6); // 11–17 Sep (5) + 18 Sep
  }, 90_000);

  it("tidak ada sesi baru → hanya 1 request (patokan), tidak menghitung ulang", async () => {
    const { result, calls } = await daily({ ZDLYA: "2026-09-18", ZDLYB: "2026-09-18" });
    expect(calls).toEqual(["ZDLYA"]);
    expect(result.status).toBe("waiting");
    expect(computeCalls).toBe(1);
  }, 60_000);

  it("percobaan terakhir tanpa sesi baru → no_session (final)", async () => {
    const { result } = await daily({ ZDLYA: "2026-09-18", ZDLYB: "2026-09-18" }, { finalAttempt: true });
    expect(result.status).toBe("no_session");
    const [row] = await db.select().from(schema.ingestionRuns).where(eq(schema.ingestionRuns.id, result.runId));
    expect(row!.note).toMatch(/libur bursa atau data penyedia terlambat/);
  }, 60_000);

  it("sesi hari ini tersedia → success; saham tanpa sesi baru dicatat, bukan diisi", async () => {
    const { result, calls } = await daily({ ZDLYA: "2026-09-21", ZDLYB: "2026-09-18" });
    expect(calls).toEqual(["ZDLYA", "ZDLYA", "ZDLYB"]);
    expect(result.status).toBe("success");
    expect(result.sessionDate).toBe("2026-09-21");
    expect(result.note).toMatch(/1 saham tanpa sesi 2026-09-21.*ZDLYB/);
    expect(await barCount("ZDLYA")).toBe(7);
    expect(await barCount("ZDLYB")).toBe(6); // tidak ada candle buatan untuk 21 Sep
  }, 90_000);

  it("percobaan ulang hanya mengambil saham yang masih tertinggal", async () => {
    const { result, calls } = await daily({ ZDLYA: "2026-09-21", ZDLYB: "2026-09-18" });
    expect(calls).toEqual(["ZDLYA", "ZDLYB"]); // patokan + ZDLYB saja; ZDLYA sudah 21 Sep
    expect(result.status).toBe("success");
  }, 90_000);

  it("diulang dengan data sama tidak menambah baris (idempotent)", async () => {
    await daily({ ZDLYA: "2026-09-21", ZDLYB: "2026-09-18" }, { trigger: "manual" });
    expect(await barCount("ZDLYA")).toBe(7);
    expect(await barCount("ZDLYB")).toBe(6);
  }, 90_000);

  it("saat bursa masih buka, candle hari ini tidak disimpan sebagai penutupan", async () => {
    // Selasa 22 Sep 10.00 WIB: penyedia sudah punya candle 22 Sep yang belum selesai.
    const { result } = await daily({ ZDLYA: "2026-09-22", ZDLYB: "2026-09-21" }, { trigger: "manual", now: new Date("2026-09-22T10:00:00+07:00") });
    expect(await barCount("ZDLYA")).toBe(7); // tetap sampai 21 Sep
    expect(result.sessionDate).toBe("2026-09-21");
    expect(result.note).toMatch(/candle 2026-09-22 belum final/);
  }, 90_000);

  it("manual melewati cek patokan dan berlabel -manual (tidak dihitung jadwal)", async () => {
    const { result, calls } = await daily({ ZDLYA: "2026-09-21", ZDLYB: "2026-09-21" }, { trigger: "manual" });
    expect(calls).toEqual(["ZDLYA", "ZDLYB"]);
    expect(result.status).toBe("success");
    const [row] = await db.select().from(schema.ingestionRuns).where(eq(schema.ingestionRuns.id, result.runId));
    expect(row!.batchId).toBe("daily-2026-09-21-manual");
  }, 90_000);
});
