import "@/server/load-env";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";
import { computeInstrumentSnapshots } from "@/server/services/metrics";

// Memverifikasi bahwa kalkulasi metrik end-to-end (baca dari DB -> hitung ->
// status) benar-benar menegakkan aturan null vs not_applicable dari
// AGENTS.md §8, bukan hanya pada level fungsi murni (sudah dites di
// tests/domain/fundamentals.test.ts). Butuh data yang sudah di-seed
// (`pnpm db:seed`) pada database DEMO yang sedang dipakai.

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("kalkulasi metrik end-to-end (data ter-seed)", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let computed: Awaited<ReturnType<typeof computeInstrumentSnapshots>>;

  beforeAll(async () => {
    client = postgres(connectionString!, { max: 1, prepare: false });
    db = drizzle(client, { schema });

    const [latestBar] = await db
      .select({ tradingDate: schema.dailyBars.tradingDate })
      .from(schema.dailyBars)
      .orderBy(schema.dailyBars.tradingDate)
      .limit(1);
    if (!latestBar) throw new Error("Database belum di-seed. Jalankan `pnpm db:seed` dahulu.");

    const allDates = await db
      .selectDistinct({ tradingDate: schema.dailyBars.tradingDate })
      .from(schema.dailyBars);
    const runAsOf = allDates.map((d) => d.tradingDate).sort().at(-1)!;

    computed = await computeInstrumentSnapshots(db, runAsOf);
  }, 60_000);

  afterAll(async () => {
    await client.end();
  });

  it("BAJA (ekuitas negatif): PBV dan DER ditandai not_applicable, bukan angka murah palsu", () => {
    const baja = computed.find((c) => c.code === "BAJA");
    expect(baja).toBeDefined();

    const pbv = baja!.snapshots.find((s) => s.metric === "pbv");
    const der = baja!.snapshots.find((s) => s.metric === "der");

    expect(pbv?.status).toBe("not_applicable");
    expect(pbv?.value).toBeNull();
    expect(der?.status).toBe("not_applicable");
    expect(der?.value).toBeNull();
  });

  it("RETA dan BATU (kuartal fundamental hilang): ROE/NPM null_missing, TIDAK berubah jadi 0", () => {
    for (const code of ["RETA", "BATU"]) {
      const instrument = computed.find((c) => c.code === code);
      expect(instrument, `${code} harus ada di hasil kalkulasi`).toBeDefined();

      const roe = instrument!.snapshots.find((s) => s.metric === "roe");
      const npm = instrument!.snapshots.find((s) => s.metric === "npm");

      expect(roe?.status, `${code}.roe status`).toBe("null_missing");
      expect(roe?.value, `${code}.roe value harus null, bukan 0`).toBeNull();
      expect(npm?.status, `${code}.npm status`).toBe("null_missing");
      expect(npm?.value, `${code}.npm value harus null, bukan 0`).toBeNull();
    }
  });

  it("VPAS: PER<=15 dan ROE>=10% (status ok, kandidat lolos preset value_wajar)", () => {
    const vpas = computed.find((c) => c.code === "VPAS");
    expect(vpas).toBeDefined();

    const perSnap = vpas!.snapshots.find((s) => s.metric === "per");
    const roeSnap = vpas!.snapshots.find((s) => s.metric === "roe");

    expect(perSnap?.status).toBe("ok");
    expect(Number(perSnap?.value)).toBeLessThanOrEqual(15);
    expect(roeSnap?.status).toBe("ok");
    expect(Number(roeSnap?.value)).toBeGreaterThanOrEqual(0.1);
  });

  it("VFAI: PER>15 dan ROE<10% dengan status ok (gagal ambang, BUKAN unknown/missing)", () => {
    const vfai = computed.find((c) => c.code === "VFAI");
    expect(vfai).toBeDefined();

    const perSnap = vfai!.snapshots.find((s) => s.metric === "per");
    const roeSnap = vfai!.snapshots.find((s) => s.metric === "roe");

    expect(perSnap?.status).toBe("ok");
    expect(Number(perSnap?.value)).toBeGreaterThan(15);
    expect(roeSnap?.status).toBe("ok");
    expect(Number(roeSnap?.value)).toBeLessThan(0.1);
  });

  it("MIGA/TEKO (rugi): EPS TTM negatif -> PER not_applicable, bukan 'murah'", () => {
    for (const code of ["MIGA", "TEKO"]) {
      const instrument = computed.find((c) => c.code === code);
      expect(instrument, `${code} harus ada`).toBeDefined();
      const perSnap = instrument!.snapshots.find((s) => s.metric === "per");
      expect(perSnap?.status, `${code}.per status`).toBe("not_applicable");
      expect(perSnap?.value).toBeNull();
    }
  });
});
