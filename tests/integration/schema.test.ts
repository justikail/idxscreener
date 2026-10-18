import "@/server/load-env";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";

// Tes integrasi membutuhkan PostgreSQL nyata (lihat docker-compose.yml). Jalankan
// via `pnpm test:integration` setelah `pnpm db:migrate`. Tidak dijalankan sebagai
// bagian dari `pnpm test` default (lihat AGENTS.md §12 — network eksternal tidak
// wajib untuk CI default; ini contract test lokal terhadap DB yang sudah ada).

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("skema database", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(() => {
    client = postgres(connectionString!, { max: 1, prepare: false });
    db = drizzle(client, { schema });
  });

  afterAll(async () => {
    await client.end();
  });

  it("menolak duplikasi daily_bars pada (instrument, tanggal, scope, adjusted)", async () => {
    // Timeout diperbesar: tes ini melakukan beberapa round-trip berurutan ke
    // PostgreSQL nyata (bisa remote/berlatensi tinggi), bukan mock.
    const [sector] = await db
      .insert(schema.sectors)
      .values({ code: `TEST_${Date.now()}`, name: "Uji" })
      .returning();

    const [instrument] = await db
      .insert(schema.instruments)
      .values({ code: `TST${Date.now() % 100000}`, name: "Uji Coba", sectorId: sector!.id })
      .returning();

    const barValues = {
      instrumentId: instrument!.id,
      tradingDate: "2026-01-05",
      marketScope: "regular" as const,
      open: "100",
      high: "105",
      low: "99",
      close: "102",
      volume: 1000n,
      value: "102000",
      frequency: 10,
      batchId: "test-batch",
    };

    await db.insert(schema.dailyBars).values(barValues);

    await expect(db.insert(schema.dailyBars).values(barValues)).rejects.toThrow();

    // cleanup
    await db.delete(schema.dailyBars).where(eq(schema.dailyBars.instrumentId, instrument!.id));
    await db.delete(schema.instruments).where(eq(schema.instruments.id, instrument!.id));
    await db.delete(schema.sectors).where(eq(schema.sectors.id, sector!.id));
  }, 20_000);
});
