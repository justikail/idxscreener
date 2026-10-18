import "@/server/load-env";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";
import { ingestOneDate, type IdxAdapterLike } from "@/jobs/ingest-idx-daily";
import { IdxSchemaError } from "@/server/providers/idx/errors";
import type { IdxAdapterFetchResult } from "@/server/providers/idx/adapter";

// Test ini TIDAK melakukan request jaringan sungguhan ke idx.co.id — provider
// disuntik mock (fixture sintetis). Memverifikasi properti wajib dari
// AGENTS.md §11: "batch gagal tidak boleh menggantikan batch valid", dan
// pemisahan demo/live (kode "ZTEST1" DIJAMIN tidak bentrok dengan kode demo
// M1 karena bukan kode BEI/demo manapun yang sudah dipakai).

const connectionString = process.env.DATABASE_URL;
const TEST_CODE = "ZTEST1"; // sengaja fiktif, tidak overlap kode BEI/demo manapun

function toIsoDate(compactYmd: string): string {
  // "20260105" -> "2026-01-05" (tryParseSourceDate butuh format berdash, lihat
  // src/server/ingestion/validate-daily-bars.ts).
  return `${compactYmd.slice(0, 4)}-${compactYmd.slice(4, 6)}-${compactYmd.slice(6, 8)}`;
}

function successProvider(): IdxAdapterLike {
  return {
    async fetchDailyBars(dateYmd: string): Promise<IdxAdapterFetchResult> {
      return {
        requestedDate: dateYmd,
        rows: [
          {
            stockCode: TEST_CODE,
            stockName: "Uji Ingest Live Tbk",
            tradingDate: `${toIsoDate(dateYmd)}T00:00:00`,
            open: 100,
            high: 110,
            low: 95,
            close: 105,
            previous: 100,
            volume: 1_000_000,
            value: 105_000_000,
            frequency: 50,
            extra: {},
          },
        ],
        fetchedAt: new Date(),
        isEmpty: false,
        httpStatus: 200,
        contentType: "application/json",
        rawBody: [{ Date: dateYmd, StockCode: TEST_CODE }],
        unknownFieldKeys: [],
      };
    },
  };
}

function failingProvider(): IdxAdapterLike {
  return {
    async fetchDailyBars(): Promise<IdxAdapterFetchResult> {
      throw new IdxSchemaError("Simulasi kegagalan schema untuk test.", []);
    },
  };
}

describe.skipIf(!connectionString)("ingestOneDate: isolasi batch gagal vs valid, demo/live", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(() => {
    client = postgres(connectionString!, { max: 1, prepare: false });
    db = drizzle(client, { schema });
  });

  afterAll(async () => {
    const [instrument] = await db
      .select({ id: schema.instruments.id })
      .from(schema.instruments)
      .where(eq(schema.instruments.code, TEST_CODE))
      .limit(1);
    if (instrument) {
      await db.delete(schema.dailyBars).where(eq(schema.dailyBars.instrumentId, instrument.id));
      await db.delete(schema.instruments).where(eq(schema.instruments.id, instrument.id));
    }
    // Urutan wajib: data_quality_issues mereferensikan ingestion_runs (FK) —
    // harus dihapus DULU sebelum ingestion_runs, atau FK violation.
    const idxRuns = await db
      .select({ id: schema.ingestionRuns.id })
      .from(schema.ingestionRuns)
      .where(eq(schema.ingestionRuns.provider, "idx"));
    if (idxRuns.length > 0) {
      await db.delete(schema.dataQualityIssues).where(
        inArray(
          schema.dataQualityIssues.ingestionRunId,
          idxRuns.map((r) => r.id),
        ),
      );
    }
    await db.delete(schema.ingestionRuns).where(eq(schema.ingestionRuns.provider, "idx"));
    await db.delete(schema.providerRawSnapshots).where(eq(schema.providerRawSnapshots.provider, "idx"));
    await client.end();
  });

  it(
    "tanggal valid tersimpan dengan instrument dataMode='live' dan daily_bars.source='idx'",
    async () => {
      await ingestOneDate(db, "20260105", successProvider());

      const [instrument] = await db
        .select()
        .from(schema.instruments)
        .where(eq(schema.instruments.code, TEST_CODE))
        .limit(1);
      expect(instrument).toBeDefined();
      expect(instrument!.dataMode).toBe("live"); // BUKAN 'demo' — pemisahan eksplisit AGENTS.md §6

      const [bar] = await db
        .select()
        .from(schema.dailyBars)
        .where(and(eq(schema.dailyBars.instrumentId, instrument!.id), eq(schema.dailyBars.tradingDate, "2026-01-05")));
      expect(bar).toBeDefined();
      expect(bar!.source).toBe("idx");
      expect(Number(bar!.close)).toBe(105);
    },
    30_000,
  );

  it(
    "batch gagal pada tanggal kedua TIDAK menghapus/mengubah data valid tanggal pertama",
    async () => {
      // Prasyarat: tanggal pertama (2026-01-05) sudah tersimpan dari test sebelumnya.
      await ingestOneDate(db, "20260106", failingProvider()); // sengaja gagal (IdxSchemaError)

      const [instrument] = await db
        .select({ id: schema.instruments.id })
        .from(schema.instruments)
        .where(eq(schema.instruments.code, TEST_CODE))
        .limit(1);

      // Data tanggal pertama HARUS TETAP UTUH setelah batch tanggal kedua gagal.
      const firstDateBar = await db
        .select()
        .from(schema.dailyBars)
        .where(and(eq(schema.dailyBars.instrumentId, instrument!.id), eq(schema.dailyBars.tradingDate, "2026-01-05")));
      expect(firstDateBar).toHaveLength(1);
      expect(Number(firstDateBar[0]!.close)).toBe(105);

      // Data tanggal kedua yang gagal TIDAK ADA sama sekali (bukan partial/rusak).
      const secondDateBar = await db
        .select()
        .from(schema.dailyBars)
        .where(and(eq(schema.dailyBars.instrumentId, instrument!.id), eq(schema.dailyBars.tradingDate, "2026-01-06")));
      expect(secondDateBar).toHaveLength(0);

      // ingestion_runs mencatat kegagalan (audit trail), bukan didiamkan.
      const failedRuns = await db
        .select()
        .from(schema.ingestionRuns)
        .where(and(eq(schema.ingestionRuns.provider, "idx"), eq(schema.ingestionRuns.status, "failed")));
      expect(failedRuns.length).toBeGreaterThan(0);
    },
    30_000,
  );

  it(
    "ingest ulang tanggal yang sama bersifat idempotent (upsert, bukan duplikat baris)",
    async () => {
      await ingestOneDate(db, "20260105", successProvider());
      await ingestOneDate(db, "20260105", successProvider());

      const [instrument] = await db
        .select({ id: schema.instruments.id })
        .from(schema.instruments)
        .where(eq(schema.instruments.code, TEST_CODE))
        .limit(1);

      const rows = await db
        .select()
        .from(schema.dailyBars)
        .where(and(eq(schema.dailyBars.instrumentId, instrument!.id), eq(schema.dailyBars.tradingDate, "2026-01-05")));
      expect(rows).toHaveLength(1); // BUKAN 2 — unique constraint + onConflictDoUpdate bekerja
    },
    30_000,
  );
});
