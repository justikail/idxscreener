import "@/server/load-env";

import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { FORMULA_VERSION } from "@/server/services/metrics";

/**
 * Evaluasi alert -> notifikasi in-app, dengan aturan dari AGENTS.md §9:
 * - Trigger hanya pada transisi kondisi false -> true (bukan setiap kali true).
 * - Cooldown per alert (kolom cooldownMinutes) mencegah notifikasi bertubi-tubi.
 * - Idempotency key (`${alertId}:${asOf}`) + unique constraint DB adalah
 *   backstop keras terhadap duplikasi walau job dijalankan ulang/retry pada
 *   as_of yang sama (tests/integration/notifications.test.ts memverifikasi ini).
 * - Alert TIDAK dievaluasi (state tidak diubah) bila metric_snapshots berstatus
 *   selain "ok" — data stale/missing tidak boleh memicu maupun menghentikan
 *   trigger secara keliru ("Hentikan alert sensitif harga ketika data stale").
 */
export async function evaluateAlerts(): Promise<{ evaluated: number; notified: number }> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL belum diset. Salin .env.example menjadi .env.local.");
  }

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  try {
    const activeAlerts = await db.select().from(schema.alerts).where(eq(schema.alerts.isActive, true));
    if (activeAlerts.length === 0) return { evaluated: 0, notified: 0 };

    // Snapshot terbaru PER INSTRUMEN (bukan satu as_of global): data demo dan
    // real punya tanggal terakhir berbeda, jadi as_of global akan membuat alert
    // pada salah satu mode tidak pernah dievaluasi.
    const instrumentIds = [...new Set(activeAlerts.map((a) => a.instrumentId))];
    const latestPerInstrument = db
      .select({
        instrumentId: schema.metricSnapshots.instrumentId,
        asOf: sql<string>`max(${schema.metricSnapshots.asOf})`.as("latest_as_of"),
      })
      .from(schema.metricSnapshots)
      .where(
        and(
          inArray(schema.metricSnapshots.instrumentId, instrumentIds),
          eq(schema.metricSnapshots.formulaVersion, FORMULA_VERSION),
        ),
      )
      .groupBy(schema.metricSnapshots.instrumentId)
      .as("latest");
    const snapshots = await db
      .select({
        instrumentId: schema.metricSnapshots.instrumentId,
        metric: schema.metricSnapshots.metric,
        asOf: schema.metricSnapshots.asOf,
        value: schema.metricSnapshots.value,
        status: schema.metricSnapshots.status,
      })
      .from(schema.metricSnapshots)
      .innerJoin(
        latestPerInstrument,
        and(
          eq(schema.metricSnapshots.instrumentId, latestPerInstrument.instrumentId),
          eq(schema.metricSnapshots.asOf, latestPerInstrument.asOf),
        ),
      )
      .where(eq(schema.metricSnapshots.formulaVersion, FORMULA_VERSION));
    if (snapshots.length === 0) return { evaluated: 0, notified: 0 };

    const snapshotByKey = new Map(snapshots.map((s) => [`${s.instrumentId}:${s.metric}`, s]));

    let notified = 0;
    const now = new Date();

    for (const alert of activeAlerts) {
      const snapshot = snapshotByKey.get(`${alert.instrumentId}:${alert.metric}`);
      if (!snapshot || snapshot.status !== "ok" || snapshot.value === null) {
        continue; // data tidak tersedia/stale: jangan ubah state, jangan trigger
      }
      const runAsOf = snapshot.asOf;

      const value = Number(snapshot.value);
      const threshold = Number(alert.threshold);
      const conditionMet = compare(value, alert.operator, threshold);

      const isNewTrigger = conditionMet && !alert.lastConditionMet;
      const cooldownMs = alert.cooldownMinutes * 60_000;
      const withinCooldown =
        alert.lastNotifiedAt !== null && now.getTime() - alert.lastNotifiedAt.getTime() < cooldownMs;

      if (isNewTrigger && !withinCooldown) {
        const idempotencyKey = `${alert.id}:${runAsOf}`;
        const inserted = await db
          .insert(schema.notifications)
          .values({
            userId: alert.userId,
            alertId: alert.id,
            title: `Alert ${alert.metric} ${alert.operator} ${threshold}`,
            body: `Nilai ${alert.metric} saat ini ${value} (as_of ${runAsOf}).`,
            idempotencyKey,
          })
          .onConflictDoNothing()
          .returning({ id: schema.notifications.id });

        if (inserted.length > 0) {
          notified += 1;
          await db
            .update(schema.alerts)
            .set({ lastConditionMet: true, lastEvaluatedAsOf: runAsOf, lastNotifiedAt: now })
            .where(eq(schema.alerts.id, alert.id));
          continue;
        }
      }

      await db
        .update(schema.alerts)
        .set({ lastConditionMet: conditionMet, lastEvaluatedAsOf: runAsOf })
        .where(eq(schema.alerts.id, alert.id));
    }

    return { evaluated: activeAlerts.length, notified };
  } finally {
    await client.end();
  }
}

function compare(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    default:
      return false;
  }
}

async function main() {
  const { evaluated, notified } = await evaluateAlerts();
  console.log(`Alert dievaluasi: ${evaluated}, notifikasi baru: ${notified}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Evaluasi alert gagal:", error);
    process.exit(1);
  });
}
