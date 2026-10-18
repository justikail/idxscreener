import "@/server/load-env";

import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";
import { evaluateAlerts } from "@/jobs/evaluate-alerts";
import { runComputeJob } from "@/jobs/run";
import { FORMULA_VERSION } from "@/server/services/metrics";

// Memverifikasi aturan alert dari AGENTS.md §9: trigger hanya pada transisi
// false->true, dan TIDAK ADA notifikasi duplikat untuk kondisi yang sama saat
// job dievaluasi ulang berkali-kali pada as_of yang sama (idempotency key +
// unique constraint DB, bukan hanya asumsi logic aplikasi benar).

const connectionString = process.env.DATABASE_URL;
const LIVE_CODE = `ZNTF${Date.now() % 10000}`;

describe.skipIf(!connectionString)("dedup notifikasi alert", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let userId: string;
  let instrumentId: string;
  let alertId: number;
  let runAsOf: string;
  let liveInstrumentId: string | undefined;

  beforeAll(async () => {
    client = postgres(connectionString!, { max: 1, prepare: false });
    db = drizzle(client, { schema });

    const passwordHash = await bcrypt.hash("test-password-tidak-dipakai", 4);
    const [user] = await db
      .insert(schema.users)
      .values({ email: `test-notif-${Date.now()}@test.local`, passwordHash, name: "Test Notif", role: "user" })
      .returning();
    userId = user!.id;

    // Pakai VPAS (kandidat deterministik "guaranteed_value_pass", PER=5x, lihat
    // src/server/providers/demo/generate.ts) supaya kondisi alert (PER < 999,
    // ambang longgar) PASTI true tanpa bergantung data acak.
    const [instrument] = await db
      .select()
      .from(schema.instruments)
      .where(eq(schema.instruments.code, "VPAS"))
      .limit(1);
    if (!instrument) throw new Error("VPAS tidak ditemukan. Jalankan `pnpm db:seed` dan `pnpm jobs:run` dahulu.");
    instrumentId = instrument.id;

    // Siapkan prasyarat sendiri: test lain (seed) bisa menghapus snapshot demo
    // sebelum file ini berjalan, jadi jangan bergantung pada urutan file.
    await runComputeJob(["demo"]);
    const [latestSnapshot] = await db
      .select({ asOf: schema.metricSnapshots.asOf })
      .from(schema.metricSnapshots)
      .where(and(eq(schema.metricSnapshots.formulaVersion, FORMULA_VERSION), eq(schema.metricSnapshots.instrumentId, instrumentId)))
      .orderBy(desc(schema.metricSnapshots.asOf))
      .limit(1);
    if (!latestSnapshot) throw new Error("metric_snapshots VPAS kosong setelah runComputeJob.");
    runAsOf = latestSnapshot.asOf;

    const [alert] = await db
      .insert(schema.alerts)
      .values({
        userId,
        instrumentId,
        metric: "per",
        operator: "lte",
        threshold: "999",
        isActive: true,
        lastConditionMet: false,
      })
      .returning();
    alertId = alert!.id;

    // Regresi: instrumen LIVE dengan snapshot bertanggal LEBIH BARU dari data
    // demo. Dulu evaluateAlerts memakai satu as_of global sehingga alert demo
    // (VPAS) tidak lagi dievaluasi begitu data real yang lebih baru ada.
    const [live] = await db
      .insert(schema.instruments)
      .values({ code: LIVE_CODE, name: "Uji Alert Live", dataMode: "live" })
      .returning();
    liveInstrumentId = live!.id;
    await db.insert(schema.metricSnapshots).values({
      instrumentId: liveInstrumentId,
      asOf: "2026-10-02",
      metric: "price",
      value: "100",
      unit: "IDR",
      status: "ok",
      formulaVersion: FORMULA_VERSION,
      inputBatchId: "live",
    });
  }, 120_000);

  afterAll(async () => {
    // Guard: bila beforeAll gagal di tengah jalan (mis. timeout/koneksi),
    // userId/alertId bisa tetap undefined — postgres.js menolak parameter
    // undefined ("UNDEFINED_VALUE"), jadi jangan query dengan nilai itu.
    if (userId) await db.delete(schema.notifications).where(eq(schema.notifications.userId, userId));
    if (alertId) await db.delete(schema.alerts).where(eq(schema.alerts.id, alertId));
    if (userId) await db.delete(schema.users).where(eq(schema.users.id, userId));
    if (liveInstrumentId) {
      await db.delete(schema.metricSnapshots).where(eq(schema.metricSnapshots.instrumentId, liveInstrumentId));
      await db.delete(schema.instruments).where(eq(schema.instruments.id, liveInstrumentId));
    }
    await client.end();
  });

  it("evaluateAlerts dipanggil 3x berturut-turut hanya menghasilkan 1 notifikasi (transisi false->true sekali)", async () => {
    await evaluateAlerts();
    await evaluateAlerts();
    await evaluateAlerts();

    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.alertId, alertId));
    expect(rows.length).toBe(1);
    // as_of milik VPAS (data demo), BUKAN tanggal snapshot live yang lebih baru.
    expect(runAsOf < "2026-10-02").toBe(true);
    expect(rows[0]!.idempotencyKey).toBe(`${alertId}:${runAsOf}`);

    const [alertRow] = await db.select().from(schema.alerts).where(eq(schema.alerts.id, alertId)).limit(1);
    expect(alertRow!.lastConditionMet).toBe(true);
  }, 60_000);

  it("insert manual dengan idempotencyKey yang sama ditolak unique constraint (backstop DB, bukan hanya logic aplikasi)", async () => {
    await expect(
      db.insert(schema.notifications).values({
        userId,
        alertId,
        title: "Duplikat manual",
        body: "percobaan duplikasi langsung ke DB",
        idempotencyKey: `${alertId}:${runAsOf}`,
      }),
    ).rejects.toThrow();
  }, 15_000);
});
