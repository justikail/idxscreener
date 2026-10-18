import "@/server/load-env";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";
import { SCREENING_PRESETS } from "@/domain/presets";
import { seedDemoData } from "@/jobs/seed";
import { runComputeJob } from "@/jobs/run";
import { DEMO_INSTRUMENTS } from "@/server/providers/demo/generate";

// Tes ini menjalankan ULANG seed dan job kalkulasi terhadap database DEMO yang
// sama (lihat AGENTS.md §5 dan instruksi sesi: hanya boleh dijalankan pada
// database pengembangan/demo, TIDAK PERNAH pada database bersama/produksi).
// Tidak menampilkan connection string di output manapun.

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("idempotensi seed dan jobs:run", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(() => {
    client = postgres(connectionString!, { max: 1, prepare: false });
    db = drizzle(client, { schema });
  });

  afterAll(async () => {
    await client.end();
  });

  it(
    "menjalankan db:seed dua kali menghasilkan jumlah baris yang identik (tidak menduplikasi)",
    async () => {
      await seedDemoData();
      const first = await countAll(db);

      await seedDemoData();
      const second = await countAll(db);

      expect(second).toEqual(first);
      expect(first.instruments).toBe(DEMO_INSTRUMENTS.length);
    },
    90_000,
  );

  it(
    "menjalankan jobs:run dua kali tidak menduplikasi metric_snapshots (upsert per instrument+as_of+metric+formula_version)",
    async () => {
      await runComputeJob(["demo"]);
      const firstSnapshotCount = (await db.select().from(schema.metricSnapshots)).length;

      await runComputeJob(["demo"]);
      const secondSnapshotCount = (await db.select().from(schema.metricSnapshots)).length;

      expect(secondSnapshotCount).toBe(firstSnapshotCount);
    },
    90_000,
  );

  it(
    "nilai metric_snapshots stabil (nilai run kedua sama dengan run pertama untuk input yang sama)",
    async () => {
      const instrument = await db
        .select({ id: schema.instruments.id })
        .from(schema.instruments)
        .where(eq(schema.instruments.code, "VPAS"))
        .limit(1);
      const instrumentId = instrument[0]?.id;
      expect(instrumentId).toBeDefined();

      const before = await db
        .select({ metric: schema.metricSnapshots.metric, value: schema.metricSnapshots.value })
        .from(schema.metricSnapshots)
        .where(and(eq(schema.metricSnapshots.instrumentId, instrumentId!), eq(schema.metricSnapshots.metric, "per")));

      await runComputeJob(["demo"]);

      const after = await db
        .select({ metric: schema.metricSnapshots.metric, value: schema.metricSnapshots.value })
        .from(schema.metricSnapshots)
        .where(and(eq(schema.metricSnapshots.instrumentId, instrumentId!), eq(schema.metricSnapshots.metric, "per")));

      expect(after).toEqual(before);
    },
    90_000,
  );

  it(
    "screening_runs SENGAJA bertambah tiap jalan (riwayat bertimestamp, bukan bug duplikasi) — lihat docs/methodology.md",
    async () => {
      const before = (await db.select().from(schema.screeningRuns)).length;
      await runComputeJob(["demo"]);
      const after = (await db.select().from(schema.screeningRuns)).length;
      // Satu screening_run per preset per jalan (lihat src/domain/presets.ts)
      expect(after).toBe(before + SCREENING_PRESETS.length);
    },
    90_000,
  );
});

async function countAll(db: ReturnType<typeof drizzle<typeof schema>>) {
  const [instruments, bars, facts, announcements] = await Promise.all([
    db.select().from(schema.instruments).where(eq(schema.instruments.dataMode, "demo")),
    db.select().from(schema.dailyBars),
    db.select().from(schema.financialFacts),
    db.select().from(schema.announcements),
  ]);
  return {
    instruments: instruments.length,
    bars: bars.length,
    facts: facts.length,
    announcements: announcements.length,
  };
}
