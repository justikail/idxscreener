import "@/server/load-env";

import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { ingestArjumDailyBars, LOCK_NAME, type IngestArjumSummary } from "@/jobs/ingest-arjum";
import { computeAfterIngest, createLiveArjumProvider, failInterruptedIngestRuns } from "@/jobs/daily-update";
import { JobLockedError, withRenewingLock } from "@/server/jobs/lock";
import type { ArjumProvider } from "@/server/providers/arjum/adapter";
import { coerceNumber } from "@/server/providers/arjum/schemas";
import { ARJUM_PROVIDER, arjumDailyBudget, assertStockCode } from "@/server/providers/arjum/config";
import { getQuotaUsage } from "@/server/quota/budget";

type Db = ReturnType<typeof drizzle<typeof schema>>;

export const UNIVERSE_CAPABILITY = "universe";
export const BACKFILL_CAPABILITY = "backfill";
/** Candle per saham saat backfill awal (sama dengan ingest awal 50 saham pertama). */
export const BACKFILL_HISTORY_LIMIT = 300;
/** Daftar saham diperbarui paling sering seminggu sekali (±20 request). */
export const UNIVERSE_REFRESH_DAYS = 7;

/**
 * Daftar semua saham dari /api/market-cap (per_page 50 → ±20 halaman = ±20
 * request). Instrumen baru disimpan sebagai live/active TANPA harga; harganya
 * diisi backfill. Kode yang dipakai instrumen DEMO tidak disentuh. Saham yang
 * hilang dari daftar penyedia tidak dihapus/diubah statusnya (belum ada bukti
 * delisting; dicatat jumlahnya saja).
 */
export async function refreshArjumUniverse(
  db: Db,
  provider: Pick<ArjumProvider, "marketCap">,
  log: (line: string) => void = () => {},
): Promise<{ total: number; added: number; renamed: number; skippedDemo: number; date: string | null; ranking: string[] }> {
  const [run] = await db
    .insert(schema.ingestionRuns)
    .values({ provider: ARJUM_PROVIDER, capability: UNIVERSE_CAPABILITY, status: "running", batchId: `universe-${Date.now()}` })
    .returning({ id: schema.ingestionRuns.id });

  try {
    const rows: Array<{ code: string; name: string }> = [];
    const caps: MarketCapRow[] = [];
    let date: string | null = null;
    let totalPages = 1;
    for (let page = 1; page <= totalPages; page++) {
      const res = await provider.marketCap({ page, perPage: 50 });
      totalPages = Math.min(coerceNumber(res.data.total_pages) ?? 1, 100); // pagar pengaman
      date = res.data.date ?? date;
      for (const r of res.data.data) {
        try {
          const code = assertStockCode(r.code);
          rows.push({ code, name: (r.name ?? "").trim() || r.code });
          caps.push({ code, date: res.data.date ?? null, close: coerceNumber(r.close), listedShares: coerceNumber(r.listed_shares), marketCap: coerceNumber(r.market_cap), turnoverRatio: coerceNumber(r.turnover_ratio) });
        } catch {
          log(`Kode tidak valid dari penyedia dilewati: ${String(r.code).slice(0, 12)}`);
        }
      }
    }

    const existing = await db
      .select({ code: schema.instruments.code, name: schema.instruments.name, dataMode: schema.instruments.dataMode })
      .from(schema.instruments);
    const byCode = new Map(existing.map((e) => [e.code, e]));
    let added = 0;
    let renamed = 0;
    let skippedDemo = 0;
    const fresh = rows.filter((r) => {
      const e = byCode.get(r.code);
      if (e?.dataMode === "demo") skippedDemo += 1;
      return !e;
    });
    for (let i = 0; i < fresh.length; i += 500) {
      const inserted = await db
        .insert(schema.instruments)
        .values(fresh.slice(i, i + 500).map((r) => ({ code: r.code, name: r.name, dataMode: "live" as const, status: "active" as const })))
        .onConflictDoNothing()
        .returning({ id: schema.instruments.id });
      added += inserted.length;
    }
    // Instrumen live yang dulu dibuat tanpa nama (nama = kode) diberi nama penyedia.
    for (const r of rows) {
      const e = byCode.get(r.code);
      if (e && e.dataMode === "live" && e.name === r.code && r.name !== r.code) {
        await db.update(schema.instruments).set({ name: r.name }).where(and(eq(schema.instruments.code, r.code), eq(schema.instruments.dataMode, "live")));
        renamed += 1;
      }
    }

    const capResult = await storeMarketCapSnapshots(db, caps, `universe-${run!.id}`);
    if (capResult.issues.length > 0) {
      await db.insert(schema.dataQualityIssues).values(capResult.issues.slice(0, 50).map((message) => ({ ingestionRunId: run!.id, severity: "warning", message })));
    }

    const note = `${capResult.stored} snapshot kapitalisasi · ${rows.length} saham di daftar penyedia (data ${date ?? "-"}) · ${added} baru · ${renamed} diberi nama${skippedDemo ? ` · ${skippedDemo} kode bentrok dengan demo dilewati` : ""}`;
    await db.update(schema.ingestionRuns).set({ status: "success", note, finishedAt: new Date() }).where(eq(schema.ingestionRuns.id, run!.id));
    log(`[universe] ${note}`);
    return { total: rows.length, added, renamed, skippedDemo, date, ranking: rows.map((r) => r.code) };
  } catch (error) {
    const message = error instanceof Error ? `${(error as { code?: string }).code ?? error.name}: ${error.message}` : String(error);
    await db.update(schema.ingestionRuns).set({ status: "failed", error: message.slice(0, 2000), finishedAt: new Date() }).where(eq(schema.ingestionRuns.id, run!.id));
    throw error;
  }
}

interface MarketCapRow {
  code: string;
  date: string | null;
  close: number | null;
  listedShares: number | null;
  marketCap: number | null;
  turnoverRatio: number | null;
}

/**
 * Simpan close/listed_shares/market_cap/turnover_ratio per tanggal data
 * penyedia. Validasi: listed_shares bilangan bulat > 0; market_cap ≈ close ×
 * listed_shares (toleransi 1%). Baris yang gagal tetap disimpan tanpa kolom
 * yang meragukan (null) dan dicatat — tidak diperbaiki.
 */
export async function storeMarketCapSnapshots(db: Db, caps: readonly MarketCapRow[], batchId: string): Promise<{ stored: number; issues: string[] }> {
  const issues: string[] = [];
  const instruments = await db.select({ id: schema.instruments.id, code: schema.instruments.code }).from(schema.instruments).where(eq(schema.instruments.dataMode, "live"));
  const idByCode = new Map(instruments.map((i) => [i.code, i.id]));
  const values = [];
  for (const c of caps) {
    const id = idByCode.get(c.code);
    if (!id || !c.date || !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) continue;
    let listed = c.listedShares;
    let cap = c.marketCap;
    if (listed !== null && (!Number.isInteger(listed) || listed <= 0)) {
      issues.push(`[${c.code}] listed_shares ${listed} tidak valid; tidak disimpan.`);
      listed = null;
    }
    if (cap !== null && c.close !== null && listed !== null) {
      const expected = c.close * listed;
      if (Math.abs(cap - expected) > 0.01 * expected) {
        issues.push(`[${c.code}] market_cap ${cap} ≠ close × listed_shares (${expected}); market_cap tidak disimpan.`);
        cap = null;
      }
    }
    values.push({
      instrumentId: id,
      snapshotDate: c.date,
      close: c.close?.toString() ?? null,
      listedShares: listed?.toString() ?? null,
      marketCap: cap?.toString() ?? null,
      turnoverRatio: c.turnoverRatio?.toString() ?? null,
      source: ARJUM_PROVIDER,
      batchId,
    });
  }
  for (let i = 0; i < values.length; i += 500) {
    await db
      .insert(schema.marketCapSnapshots)
      .values(values.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [schema.marketCapSnapshots.instrumentId, schema.marketCapSnapshots.snapshotDate, schema.marketCapSnapshots.source],
        set: {
          close: sql`excluded.close`,
          listedShares: sql`excluded.listed_shares`,
          marketCap: sql`excluded.market_cap`,
          turnoverRatio: sql`excluded.turnover_ratio`,
          batchId: sql`excluded.batch_id`,
          fetchedAt: sql`now()`,
        },
      });
  }
  return { stored: values.length, issues };
}

const NO_HISTORY_MARK = "backfill: penyedia tidak mengembalikan riwayat";
const NO_HISTORY_RETRY_DAYS = 7;

/**
 * Saham live aktif yang belum punya satu pun harga dari penyedia. Saham yang
 * pada backfill sebelumnya tidak mengembalikan riwayat (mis. baru listing,
 * belum ada transaksi) baru dicoba lagi setelah 7 hari — agar tidak membakar
 * kuota setiap hari.
 */
export async function codesWithoutHistory(db: Db): Promise<string[]> {
  const rows = await db.execute<{ code: string; [k: string]: unknown }>(sql`
    select i.code from ${schema.instruments} i
    where i.data_mode = 'live' and i.status = 'active'
      and not exists (select 1 from ${schema.dailyBars} d where d.instrument_id = i.id and d.source = 'arjum')
      and not exists (
        select 1 from ${schema.dataQualityIssues} q
        where q.instrument_id = i.id and q.message like ${"%" + NO_HISTORY_MARK + "%"}
          and q.created_at > now() - (${NO_HISTORY_RETRY_DAYS} * interval '1 day')
      )
    order by i.code
  `);
  return rows.map((r) => r.code);
}

export async function lastSuccessfulRun(db: Db, capability: string): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: schema.ingestionRuns.finishedAt })
    .from(schema.ingestionRuns)
    .where(and(eq(schema.ingestionRuns.capability, capability), eq(schema.ingestionRuns.status, "success")))
    .orderBy(sql`${schema.ingestionRuns.finishedAt} desc nulls last`)
    .limit(1);
  return row?.finishedAt ?? null;
}

export async function remainingQuota(db: Db, now = new Date()): Promise<number> {
  const usage = await getQuotaUsage(db, ARJUM_PROVIDER, now);
  return Math.max(0, arjumDailyBudget() - (usage?.used ?? 0));
}

/**
 * Isi riwayat saham yang belum punya harga, sebanyak kuota yang tersisa
 * (dikurangi `keep`). Saham yang belum kebagian dikerjakan pada kesempatan
 * berikutnya — kemajuannya tersimpan di database, jadi tidak ada checkpoint
 * terpisah yang bisa basi.
 */
export async function backfillMissingHistory(
  db: Db,
  provider: Pick<ArjumProvider, "history">,
  options: {
    keep?: number;
    priority?: string[];
    now?: Date;
    log?: (line: string) => void;
    /** Batasi ke kode tertentu (test) — default semua saham tanpa riwayat. */
    onlyCodes?: string[];
    /** Override jatah request (test) — default sisa kuota hari ini dikurangi `keep`. */
    allowance?: number;
  } = {},
): Promise<{ pending: number; attempted: number; summary: IngestArjumSummary | null }> {
  const log = options.log ?? (() => {});
  const only = options.onlyCodes ? new Set(options.onlyCodes) : null;
  const missing = (await codesWithoutHistory(db)).filter((c) => !only || only.has(c));
  if (missing.length === 0) return { pending: 0, attempted: 0, summary: null };

  // Urutan: peringkat kapitalisasi dari daftar penyedia (bila ada), sisanya alfabet.
  const rank = new Map((options.priority ?? []).map((c, i) => [c, i]));
  missing.sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || a.localeCompare(b));

  const allowance = options.allowance ?? (await remainingQuota(db, options.now)) - (options.keep ?? 10);
  if (allowance <= 0) {
    log(`[backfill] ${missing.length} saham menunggu, kuota hari ini habis — dilanjutkan besok.`);
    return { pending: missing.length, attempted: 0, summary: null };
  }
  const codes = missing.slice(0, allowance);
  log(`[backfill] ${codes.length} dari ${missing.length} saham, ${BACKFILL_HISTORY_LIMIT} candle per saham.`);
  const summary = await ingestArjumDailyBars(db, provider, { codes, historyLimit: BACKFILL_HISTORY_LIMIT, now: options.now });

  // Yang sudah dicoba tetapi tetap tanpa harga (bukan karena gagal jaringan/kuota) ditandai.
  const failed = new Set(summary.codesFailed.map((f) => f.code));
  const stillMissing = new Set(await codesWithoutHistory(db));
  const empty = codes.filter((c) => stillMissing.has(c) && !failed.has(c) && !summary.stoppedEarly);
  if (empty.length) {
    const insts = await db
      .select({ id: schema.instruments.id, code: schema.instruments.code })
      .from(schema.instruments)
      .where(sql`${schema.instruments.code} in ${empty}`);
    const [run] = await db.select({ id: schema.ingestionRuns.id }).from(schema.ingestionRuns).where(eq(schema.ingestionRuns.batchId, summary.batchId));
    await db.insert(schema.dataQualityIssues).values(
      insts.map((i) => ({ ingestionRunId: run?.id ?? null, instrumentId: i.id, severity: "info", message: `[${i.code}] ${NO_HISTORY_MARK}; dicoba lagi setelah ${NO_HISTORY_RETRY_DAYS} hari.` })),
    );
  }
  await db
    .update(schema.ingestionRuns)
    .set({
      capability: BACKFILL_CAPABILITY,
      note: `Backfill ${summary.codesStored}/${codes.length} saham · ${summary.rowsUpserted.toLocaleString("id-ID")} baris · sisa ${Math.max(0, missing.length - summary.codesStored)} saham menunggu`,
    })
    .where(eq(schema.ingestionRuns.batchId, summary.batchId));
  return { pending: missing.length - summary.codesStored, attempted: codes.length, summary };
}

/**
 * Perawatan cakupan, dijalankan worker setelah pembaruan hari itu selesai
 * (atau akhir pekan): perbarui daftar saham bila sudah >7 hari, lalu isi
 * riwayat saham baru memakai sisa kuota hari itu.
 */
export async function runMaintenanceWithLock(db: Db, log: (line: string) => void): Promise<"locked" | "idle" | "done"> {
  try {
    return await withRenewingLock(db, LOCK_NAME, async () => {
      await failInterruptedIngestRuns(db);
      const lastUniverse = await lastSuccessfulRun(db, UNIVERSE_CAPABILITY);
      // Juga dianggap basi bila snapshot kapitalisasi pasar belum pernah tersimpan
      // (kolom market-cap baru disimpan sejak 5 Okt 2026; sebelumnya diabaikan).
      const [capCount] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.marketCapSnapshots);
      const universeStale = !lastUniverse || (capCount?.n ?? 0) === 0 || Date.now() - lastUniverse.getTime() > UNIVERSE_REFRESH_DAYS * 86_400_000;
      const missing = await codesWithoutHistory(db);
      if (!universeStale && missing.length === 0) return "idle" as const;
      if ((await remainingQuota(db)) <= 30) return "idle" as const;

      const provider = createLiveArjumProvider(db, log);
      let ranking: string[] | undefined;
      if (universeStale) ranking = (await refreshArjumUniverse(db, provider, log)).ranking;
      const result = await backfillMissingHistory(db, provider, { priority: ranking, log });
      if (result.summary?.codesStored) await computeAfterIngest();
      return "done" as const;
    });
  } catch (error) {
    if (error instanceof JobLockedError) return "locked";
    throw error;
  }
}

// ---------------------------------------------------------------------------
// CLI: pnpm jobs:universe [--backfill]
//   Ambil daftar semua saham (±20 request); --backfill: lanjut isi riwayat
//   saham baru memakai sisa kuota hari ini.
// ---------------------------------------------------------------------------
async function main() {
  const backfill = process.argv.includes("--backfill");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL belum diset.");
  const client = postgres(connectionString, { max: 2, prepare: false });
  const db = drizzle(client, { schema });
  const log = (line: string) => console.log(line);
  try {
    await withRenewingLock(db, LOCK_NAME, async () => {
      await failInterruptedIngestRuns(db);
      const provider = createLiveArjumProvider(db, log);
      const universe = await refreshArjumUniverse(db, provider, log);
      if (backfill) {
        const result = await backfillMissingHistory(db, provider, { priority: universe.ranking, log });
        log(`[backfill] selesai: ${result.summary?.codesStored ?? 0} tersimpan, ${result.pending} menunggu.`);
        if (result.summary?.codesStored) await computeAfterIngest();
      }
    });
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Job universe gagal:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
