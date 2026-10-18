import "@/server/load-env";

import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import {
  DEMO_BATCH_ID,
  DEMO_INSTRUMENTS,
  DEMO_SECTORS,
  generateAnnouncements,
  generateDailyBars,
  generateFinancialFacts,
  quarterPeriod,
} from "@/server/providers/demo/generate";

/**
 * Menulis ulang data pasar DEMO dalam satu transaksi. Hanya baris milik
 * instrumen ber-`data_mode='demo'` dan run berlabel provider "demo" yang
 * dihapus; data REAL (instrumen live) dan data pengguna tidak disentuh.
 * Idempotent: generator deterministik menghasilkan jumlah baris identik (lihat
 * tests/integration/idempotency.test.ts). Tetap hanya untuk database
 * pengembangan — AGENTS.md §9.
 */
export async function seedDemoData(): Promise<{ barCount: number; factCount: number; announcementCount: number }> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL belum diset. Salin .env.example menjadi .env.local.");
  }

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  let barCount = 0;
  let factCount = 0;
  let announcementCount = 0;

  try {
    await db.transaction(async (tx) => {
      const demoCodes = DEMO_INSTRUMENTS.map((i) => i.code);

      // Pengaman: seed HANYA boleh menyentuh instrumen demo. Bila kode demo
      // sudah dipakai instrumen LIVE (data real), batalkan seluruh seed.
      const liveCollisions = await tx
        .select({ code: schema.instruments.code })
        .from(schema.instruments)
        .where(and(inArray(schema.instruments.code, demoCodes), eq(schema.instruments.dataMode, "live")));
      if (liveCollisions.length > 0) {
        throw new Error(
          `Seed demo dibatalkan: kode ${liveCollisions.map((c) => c.code).join(", ")} sudah dipakai instrumen data REAL.`,
        );
      }

      // Sektor dan instrumen di-UPSERT (bukan hapus-insert) agar ID stabil —
      // watchlist/catatan/alert pengguna yang merujuk instrumen demo tetap valid.
      for (const s of DEMO_SECTORS) {
        await tx
          .insert(schema.sectors)
          .values({ code: s.code, name: s.name })
          .onConflictDoUpdate({ target: schema.sectors.code, set: { name: s.name } });
      }
      const sectorRows = await tx
        .select()
        .from(schema.sectors)
        .where(inArray(schema.sectors.code, DEMO_SECTORS.map((s) => s.code)));
      const sectorIdByCode = new Map(sectorRows.map((s) => [s.code, s.id]));

      for (const ins of DEMO_INSTRUMENTS) {
        const values = {
          code: ins.code,
          name: ins.name,
          sectorId: sectorIdByCode.get(ins.sectorCode) ?? null,
          board: ins.board,
          isBank: ins.isBank,
          listingDate: ins.listingDate,
          status: "active" as const,
          dataMode: "demo" as const,
        };
        await tx
          .insert(schema.instruments)
          .values(values)
          .onConflictDoUpdate({ target: schema.instruments.code, set: { ...values, updatedAt: new Date() } });
      }
      const instrumentRows = await tx
        .select({ id: schema.instruments.id, code: schema.instruments.code })
        .from(schema.instruments)
        .where(inArray(schema.instruments.code, demoCodes));
      const instrumentIdByCode = new Map(instrumentRows.map((i) => [i.code, i.id]));
      const demoIds = instrumentRows.map((i) => i.id);

      // Hapus HANYA data pasar milik instrumen demo dan run berlabel demo.
      // Data real (instrumen live, run provider lain) tidak disentuh.
      const demoRuns = await tx
        .select({ id: schema.ingestionRuns.id })
        .from(schema.ingestionRuns)
        .where(eq(schema.ingestionRuns.provider, "demo"));
      const demoRunIds = demoRuns.map((r) => r.id);

      await tx.delete(schema.dataQualityIssues).where(inArray(schema.dataQualityIssues.instrumentId, demoIds));
      if (demoRunIds.length > 0) {
        await tx.delete(schema.dataQualityIssues).where(inArray(schema.dataQualityIssues.ingestionRunId, demoRunIds));
        await tx.delete(schema.ingestionRuns).where(inArray(schema.ingestionRuns.id, demoRunIds));
      }
      await tx.delete(schema.screeningResults).where(inArray(schema.screeningResults.instrumentId, demoIds));
      // Run screening demo kini kosong; run mode lain masih punya hasil sendiri.
      await tx.delete(schema.screeningRuns).where(
        and(
          eq(schema.screeningRuns.inputBatchId, DEMO_BATCH_ID),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(schema.screeningResults)
              .where(eq(schema.screeningResults.runId, schema.screeningRuns.id)),
          ),
        ),
      );
      await tx.delete(schema.metricSnapshots).where(inArray(schema.metricSnapshots.instrumentId, demoIds));
      await tx.delete(schema.announcements).where(inArray(schema.announcements.instrumentId, demoIds));
      await tx.delete(schema.financialFacts).where(inArray(schema.financialFacts.instrumentId, demoIds));
      await tx.delete(schema.dailyBars).where(inArray(schema.dailyBars.instrumentId, demoIds));
      await tx.delete(schema.instrumentStatusEvents).where(inArray(schema.instrumentStatusEvents.instrumentId, demoIds));

      for (const instrument of DEMO_INSTRUMENTS) {
        const instrumentId = instrumentIdByCode.get(instrument.code);
        if (!instrumentId) throw new Error(`Instrumen ${instrument.code} tidak ditemukan setelah insert.`);

        const bars = generateDailyBars(instrument);
        if (bars.length > 0) {
          await tx.insert(schema.dailyBars).values(
            bars.map((bar) => ({
              instrumentId,
              tradingDate: bar.tradingDate,
              open: bar.open.toString(),
              high: bar.high.toString(),
              low: bar.low.toString(),
              close: bar.close.toString(),
              volume: bar.volume,
              value: bar.value.toString(),
              frequency: bar.frequency,
              source: "demo",
              batchId: DEMO_BATCH_ID,
            })),
          );
          barCount += bars.length;
        }

        const facts = generateFinancialFacts(instrument);
        const factsWithValue = facts.filter((f) => f.value !== null);
        if (factsWithValue.length > 0) {
          await tx.insert(schema.financialFacts).values(
            factsWithValue.map((fact) => {
              const period = quarterPeriod(fact.fiscalYear, fact.fiscalQuarter);
              return {
                instrumentId,
                fiscalYear: fact.fiscalYear,
                fiscalQuarter: fact.fiscalQuarter,
                periodType: fact.periodType,
                isYtd: false,
                consolidation: "consolidated" as const,
                currency: "IDR",
                concept: fact.concept,
                value: fact.value!.toString(),
                periodStart: period.start,
                periodEnd: period.end,
                publishedAt: new Date(`${period.end}T09:00:00+07:00`),
                sourceDocHash: `demo-${instrument.code}-${fact.fiscalYear}Q${fact.fiscalQuarter}-${fact.concept}`,
                source: "demo",
              };
            }),
          );
          factCount += factsWithValue.length;
        }

        const announcements = generateAnnouncements(instrument);
        if (announcements.length > 0) {
          await tx.insert(schema.announcements).values(
            announcements.map((a, idx) => ({
              instrumentId,
              title: a.title,
              category: a.category,
              publishedAt: new Date(a.publishedAt),
              docHash: `demo-${instrument.code}-ann-${idx}`,
              source: "demo",
            })),
          );
          announcementCount += announcements.length;
        }
      }

      await tx.insert(schema.ingestionRuns).values({
        provider: "demo",
        capability: "seed",
        status: "success",
        batchId: DEMO_BATCH_ID,
        finishedAt: new Date(),
      });
    });
  } finally {
    await client.end();
  }

  return { barCount, factCount, announcementCount };
}

async function main() {
  console.log("Seeding data DEMO sintetis...");
  console.log(`Batch: ${DEMO_BATCH_ID}`);
  const { barCount, factCount, announcementCount } = await seedDemoData();
  console.log(`- ${barCount} baris daily_bars`);
  console.log(`- ${factCount} baris financial_facts`);
  console.log(`- ${announcementCount} baris announcements`);
  console.log("Seed selesai.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Seed gagal:", error);
    process.exit(1);
  });
}
