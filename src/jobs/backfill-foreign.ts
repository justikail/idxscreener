import "@/server/load-env";

import { and, asc, eq, gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { normalizeForeign } from "@/server/ingestion/validate-arjum-history";
import { arjumHistoryResponseSchema, coerceNumber } from "@/server/providers/arjum/schemas";

/**
 * Isi kolom foreign_buy/sell/net daily_bars dari respons /api/history yang
 * SUDAH tersimpan di provider_raw_snapshots — tanpa satu pun request ke
 * penyedia. Snapshot diproses dari yang terlama; yang lebih baru menimpa.
 * Hanya baris source='arjum' dengan tanggal & volume yang sama yang diisi
 * (volume berbeda = respons beda revisi → dilewati).
 *
 *   pnpm jobs:backfill-foreign
 */
const PAGE = 50;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL belum diset.");
  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  let lastId = 0;
  let snapshots = 0;
  let updated = 0;
  let skipped = 0;
  try {
    const instruments = await db.select({ id: schema.instruments.id, code: schema.instruments.code }).from(schema.instruments).where(eq(schema.instruments.dataMode, "live"));
    const idByCode = new Map(instruments.map((i) => [i.code, i.id]));
    for (;;) {
      const batch = await db
        .select({ id: schema.providerRawSnapshots.id, rawBody: schema.providerRawSnapshots.rawBody })
        .from(schema.providerRawSnapshots)
        .where(and(eq(schema.providerRawSnapshots.provider, "arjum"), eq(schema.providerRawSnapshots.capability, "daily_bars"), gt(schema.providerRawSnapshots.id, lastId)))
        .orderBy(asc(schema.providerRawSnapshots.id))
        .limit(PAGE);
      if (batch.length === 0) break;
      for (const snap of batch) {
        lastId = snap.id;
        const parsed = arjumHistoryResponseSchema.safeParse(snap.rawBody);
        if (!parsed.success) continue;
        const instrumentId = idByCode.get(parsed.data.stock_code.toUpperCase());
        if (!instrumentId) continue;
        snapshots += 1;
        const rows: Array<{ date: string; volume: number; buy: number; sell: number; net: number }> = [];
        for (const row of parsed.data.rows) {
          const volume = coerceNumber(row.volume);
          const f = normalizeForeign(row, volume);
          if (volume === null || f.buy === null || f.sell === null || f.net === null || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
            skipped += 1;
            continue;
          }
          rows.push({ date: row.date, volume, buy: f.buy, sell: f.sell, net: f.net });
        }
        if (rows.length === 0) continue;
        const values = sql.join(
          rows.map((r) => sql`(${r.date}::date, ${r.volume}::bigint, ${r.buy}::bigint, ${r.sell}::bigint, ${r.net}::bigint)`),
          sql`, `,
        );
        const result = await db.execute(sql`
          update ${schema.dailyBars} d set foreign_buy = v.buy, foreign_sell = v.sell, foreign_net = v.net
          from (values ${values}) as v(trading_date, volume, buy, sell, net)
          where d.instrument_id = ${instrumentId} and d.source = 'arjum' and d.trading_date = v.trading_date and d.volume = v.volume
            and (d.foreign_buy is distinct from v.buy or d.foreign_sell is distinct from v.sell or d.foreign_net is distinct from v.net)
        `);
        updated += result.count ?? 0;
      }
    }
    const [coverage] = await db.execute<{ total: number; filled: number; [k: string]: unknown }>(
      sql`select count(*)::int as total, count(foreign_net)::int as filled from ${schema.dailyBars} where source = 'arjum'`,
    );
    console.log(`Snapshot diproses: ${snapshots}; baris diperbarui: ${updated}; baris snapshot dilewati: ${skipped}; cakupan foreign: ${coverage?.filled}/${coverage?.total} baris arjum.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Backfill foreign gagal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
