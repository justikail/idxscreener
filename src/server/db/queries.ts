import "server-only";

import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "./client";
import { FILTER_FIELDS } from "@/domain/filter-ast";
import { visibleDataModes } from "@/server/data-mode";
import { FORMULA_VERSION } from "@/server/services/metrics";
import * as schema from "./schema";

/**
 * Cache singkat di memori proses untuk data pasar yang hanya berubah sekali
 * sehari (setelah pembaruan harian). Permintaan bersamaan berbagi satu query;
 * data baru terlihat paling lambat MARKET_CACHE_MS setelah job selesai.
 * Kunci memuat mode data yang terlihat, jadi demo dan live tidak tercampur.
 */
const MARKET_CACHE_MS = 60_000;
const marketCache = new Map<string, { at: number; value: Promise<unknown> }>();

function cachedMarket<T>(name: string, load: () => Promise<T>): Promise<T> {
  const key = `${name}:${visibleDataModes().join(",")}`;
  const hit = marketCache.get(key);
  if (hit && Date.now() - hit.at < MARKET_CACHE_MS) return hit.value as Promise<T>;
  const value = load();
  marketCache.set(key, { at: Date.now(), value });
  // Kegagalan tidak disimpan: permintaan berikutnya mencoba lagi.
  value.catch(() => {
    if (marketCache.get(key)?.value === value) marketCache.delete(key);
  });
  return value;
}

/** Dipanggil setelah job dijalankan dari dalam proses web (mis. tombol admin). */
export function clearMarketCache(): void {
  marketCache.clear();
}

export interface DashboardRow {
  instrumentId: string;
  code: string;
  name: string;
  sectorName: string | null;
  dataMode: "demo" | "live";
  /** Provider asal bar terakhir (mis. "demo", "arjum"). */
  source: string | null;
  close: number | null;
  prevClose: number | null;
  changePct: number | null;
  volume: string | null;
  /** Nilai transaksi (Rupiah) sesi terakhir. */
  value: number | null;
  tradingDate: string | null;
  isStale: boolean;
}

type DashboardSqlRow = {
  id: string;
  code: string;
  name: string;
  sector_name: string | null;
  data_mode: "demo" | "live";
  trading_date: string | null;
  close: string | null;
  volume: string | null;
  value: string | null;
  source: string | null;
  rn: number | null;
};

/**
 * Ringkasan dashboard: harga terakhir + perubahan dari sesi sebelumnya, per
 * instrumen — SATU query (LATERAL dua bar terakhir), bukan satu query per
 * instrumen. Status stale dinilai terhadap tanggal terbaru MODE yang sama
 * (demo dibanding demo, real dibanding real).
 */
export function getDashboardRows(): Promise<DashboardRow[]> {
  return cachedMarket("dashboard", loadDashboardRows);
}

async function loadDashboardRows(): Promise<DashboardRow[]> {
  const result = await db.execute<DashboardSqlRow>(sql`
    select i.id, i.code, i.name, s.name as sector_name, i.data_mode,
           b.trading_date::text as trading_date, b.close::text as close, b.volume::text as volume,
           b.value::text as value, b.source, b.rn
    from ${schema.instruments} i
    left join ${schema.sectors} s on s.id = i.sector_id
    left join lateral (
      select d.trading_date, d.close, d.volume, d.value, d.source,
             row_number() over (order by d.trading_date desc)::int as rn
      from ${schema.dailyBars} d
      where d.instrument_id = i.id and d.market_scope = 'regular' and d.is_adjusted = false and d.close is not null
      order by d.trading_date desc
      limit 2
    ) b on true
    where i.status = 'active'
      and i.data_mode::text in (${sql.join(visibleDataModes().map((m) => sql`${m}`), sql`, `)})
    order by i.data_mode, i.code
  `);

  const byInstrument = new Map<string, { base: DashboardSqlRow; latest?: DashboardSqlRow; prev?: DashboardSqlRow }>();
  for (const row of result) {
    const entry = byInstrument.get(row.id) ?? { base: row };
    if (row.rn === 1) entry.latest = row;
    if (row.rn === 2) entry.prev = row;
    byInstrument.set(row.id, entry);
  }

  const maxDateByMode = new Map<string, string>();
  for (const { base, latest } of byInstrument.values()) {
    const current = maxDateByMode.get(base.data_mode);
    if (latest?.trading_date && (!current || latest.trading_date > current)) {
      maxDateByMode.set(base.data_mode, latest.trading_date);
    }
  }

  return [...byInstrument.values()].map(({ base, latest, prev }) => {
    const close = latest?.close != null ? Number(latest.close) : null;
    const prevClose = prev?.close != null ? Number(prev.close) : null;
    const changePct = close !== null && prevClose !== null && prevClose !== 0 ? ((close - prevClose) / prevClose) * 100 : null;
    const modeMax = maxDateByMode.get(base.data_mode);
    return {
      instrumentId: base.id,
      code: base.code,
      name: base.name,
      sectorName: base.sector_name,
      dataMode: base.data_mode,
      source: latest?.source ?? null,
      close,
      prevClose,
      changePct,
      volume: latest?.volume ?? null,
      value: latest?.value != null ? Number(latest.value) : null,
      tradingDate: latest?.trading_date ?? null,
      isStale: Boolean(latest?.trading_date && modeMax && latest.trading_date < modeMax),
    };
  });
}

/**
 * Harga penutupan hingga 30 sesi terakhir untuk sparkline — hanya untuk
 * instrumen yang benar-benar ditampilkan (bukan seluruh pasar), urut naik.
 */
export async function getSparklines(instrumentIds: string[]): Promise<Map<string, number[]>> {
  if (instrumentIds.length === 0) return new Map();
  const rows = await db.execute<{ instrument_id: string; closes: string[] }>(sql`
    select i.id as instrument_id,
           array(select c from (
             select d.close::text as c, d.trading_date from ${schema.dailyBars} d
             where d.instrument_id = i.id and d.market_scope = 'regular' and d.is_adjusted = false and d.close is not null
             order by d.trading_date desc limit 30
           ) t order by t.trading_date) as closes
    from ${schema.instruments} i
    where i.id in ${instrumentIds}
  `);
  return new Map(rows.map((r) => [r.instrument_id, r.closes.map(Number)]));
}

export async function searchInstruments(query: string, limit = 20) {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  return db
    .select({
      id: schema.instruments.id,
      code: schema.instruments.code,
      name: schema.instruments.name,
      sectorName: schema.sectors.name,
      dataMode: schema.instruments.dataMode,
    })
    .from(schema.instruments)
    .leftJoin(schema.sectors, eq(schema.instruments.sectorId, schema.sectors.id))
    .where(
      and(
        inArray(schema.instruments.dataMode, visibleDataModes()),
        or(ilike(schema.instruments.code, `%${trimmed}%`), ilike(schema.instruments.name, `%${trimmed}%`)),
      ),
    )
    .limit(limit);
}

export async function getInstrumentByCode(code: string) {
  const [instrument] = await db
    .select({
      id: schema.instruments.id,
      code: schema.instruments.code,
      name: schema.instruments.name,
      board: schema.instruments.board,
      isBank: schema.instruments.isBank,
      listingDate: schema.instruments.listingDate,
      status: schema.instruments.status,
      dataMode: schema.instruments.dataMode,
      sectorName: schema.sectors.name,
      sectorCode: schema.sectors.code,
    })
    .from(schema.instruments)
    .leftJoin(schema.sectors, eq(schema.instruments.sectorId, schema.sectors.id))
    .where(and(eq(schema.instruments.code, code.toUpperCase()), inArray(schema.instruments.dataMode, visibleDataModes())))
    .limit(1);

  return instrument ?? null;
}

export async function getDailyBars(instrumentId: string, limit = 260) {
  const rows = await db
    .select({
      tradingDate: schema.dailyBars.tradingDate,
      open: schema.dailyBars.open,
      high: schema.dailyBars.high,
      low: schema.dailyBars.low,
      close: schema.dailyBars.close,
      volume: schema.dailyBars.volume,
      value: schema.dailyBars.value,
    })
    .from(schema.dailyBars)
    .where(
      and(
        eq(schema.dailyBars.instrumentId, instrumentId),
        eq(schema.dailyBars.marketScope, "regular"),
        eq(schema.dailyBars.isAdjusted, false),
      ),
    )
    .orderBy(desc(schema.dailyBars.tradingDate))
    .limit(limit);

  return rows.reverse();
}

export async function getLatestMetricSnapshots(instrumentId: string) {
  const [{ asOf } = { asOf: null as string | null }] = await db
    .select({ asOf: schema.metricSnapshots.asOf })
    .from(schema.metricSnapshots)
    .where(and(eq(schema.metricSnapshots.instrumentId, instrumentId), eq(schema.metricSnapshots.formulaVersion, FORMULA_VERSION)))
    .orderBy(desc(schema.metricSnapshots.asOf))
    .limit(1);

  if (!asOf) return { asOf: null, snapshots: [] };

  const snapshots = await db
    .select()
    .from(schema.metricSnapshots)
    .where(
      and(
        eq(schema.metricSnapshots.instrumentId, instrumentId),
        eq(schema.metricSnapshots.asOf, asOf),
        eq(schema.metricSnapshots.formulaVersion, FORMULA_VERSION),
      ),
    );

  return { asOf, snapshots };
}

export async function getFinancialFacts(instrumentId: string) {
  return db
    .select()
    .from(schema.financialFacts)
    .where(eq(schema.financialFacts.instrumentId, instrumentId))
    .orderBy(desc(schema.financialFacts.fiscalYear), desc(schema.financialFacts.fiscalQuarter));
}

export async function getAnnouncements(instrumentId?: string, limit = 50) {
  const query = db
    .select({
      id: schema.announcements.id,
      instrumentId: schema.announcements.instrumentId,
      title: schema.announcements.title,
      category: schema.announcements.category,
      publishedAt: schema.announcements.publishedAt,
      sourceUrl: schema.announcements.sourceUrl,
      instrumentCode: schema.instruments.code,
    })
    .from(schema.announcements)
    .leftJoin(schema.instruments, eq(schema.announcements.instrumentId, schema.instruments.id))
    .orderBy(desc(schema.announcements.publishedAt))
    .limit(limit);

  const visible = inArray(schema.instruments.dataMode, visibleDataModes());
  if (instrumentId) {
    return query.where(and(eq(schema.announcements.instrumentId, instrumentId), visible));
  }

  return query.where(visible);
}

export async function getLatestScreeningRun(presetCode: string) {
  const [run] = await db
    .select()
    .from(schema.screeningRuns)
    .where(eq(schema.screeningRuns.presetCode, presetCode))
    .orderBy(desc(schema.screeningRuns.createdAt))
    .limit(1);

  if (!run) return null;

  const results = await db
    .select({
      id: schema.screeningResults.id,
      instrumentId: schema.screeningResults.instrumentId,
      passed: schema.screeningResults.passed,
      reasons: schema.screeningResults.reasons,
      missingFields: schema.screeningResults.missingFields,
      code: schema.instruments.code,
      name: schema.instruments.name,
    })
    .from(schema.screeningResults)
    .innerJoin(schema.instruments, eq(schema.screeningResults.instrumentId, schema.instruments.id))
    .where(and(eq(schema.screeningResults.runId, run.id), eq(schema.screeningResults.passed, true)));

  return { run, results };
}

export async function getDashboardSummary() {
  const rows = await db
    .select({ id: schema.instruments.id, dataMode: schema.instruments.dataMode })
    .from(schema.instruments)
    .where(and(eq(schema.instruments.status, "active"), inArray(schema.instruments.dataMode, visibleDataModes())));

  return {
    activeCount: rows.length,
    demoCount: rows.filter((r) => r.dataMode === "demo").length,
    liveCount: rows.filter((r) => r.dataMode === "live").length,
  };
}

export async function getSectorList() {
  return db.select().from(schema.sectors).orderBy(schema.sectors.name);
}

export async function getInstrumentsBasic() {
  return db
    .select({
      id: schema.instruments.id,
      code: schema.instruments.code,
      name: schema.instruments.name,
      board: schema.instruments.board,
      isBank: schema.instruments.isBank,
      sectorCode: schema.sectors.code,
      sectorName: schema.sectors.name,
      dataMode: schema.instruments.dataMode,
    })
    .from(schema.instruments)
    .leftJoin(schema.sectors, eq(schema.instruments.sectorId, schema.sectors.id))
    .where(and(eq(schema.instruments.status, "active"), inArray(schema.instruments.dataMode, visibleDataModes())));
}

export interface ScreenerCandidateRow {
  instrumentId: string;
  code: string;
  name: string;
  sectorName: string | null;
  isBank: boolean;
  dataMode: "demo" | "live";
  asOf: string | null;
  values: Record<string, number | string | null>;
}

/** Kandidat screener: instrumen + metric_snapshots terbaru (as_of terkini per instrumen). */
export function getScreenerCandidates(): Promise<ScreenerCandidateRow[]> {
  return cachedMarket("screener", loadScreenerCandidates);
}

async function loadScreenerCandidates(): Promise<ScreenerCandidateRow[]> {
  const instruments = await getInstrumentsBasic();
  if (instruments.length === 0) return [];

  // Snapshot terbaru per instrumen, diringkas di database menjadi SATU baris
  // per instrumen (json metrik → nilai) dan hanya metrik yang dipakai filter
  // serta bernilai. Dulu ±15 baris per instrumen (±900 KB untuk 957 saham)
  // dikirim setiap kunjungan — 5–30 detik di koneksi lambat ke Neon.
  // Metrik yang tidak ada di json = data tidak tersedia (null), sama seperti
  // sebelumnya; status selain ok/stale tidak pernah menjadi angka.
  const metrics = FILTER_FIELDS.filter((f) => f !== "sector_code" && f !== "is_bank");
  const latestSnapshots = await db.execute<{ instrument_id: string; as_of: string; vals: Record<string, string> | null }>(sql`
    select m.instrument_id, latest.as_of::text as as_of,
           json_object_agg(m.metric, m.value::text) filter (
             where m.status in ('ok', 'stale') and m.value is not null
           ) as vals
    from ${schema.metricSnapshots} m
    join (
      select instrument_id, max(as_of) as as_of from ${schema.metricSnapshots}
      where formula_version = ${FORMULA_VERSION} group by instrument_id
    ) latest on latest.instrument_id = m.instrument_id and latest.as_of = m.as_of and m.formula_version = ${FORMULA_VERSION}
    join ${schema.instruments} i on i.id = m.instrument_id
    where i.status = 'active'
      and i.data_mode::text in (${sql.join(visibleDataModes().map((mode) => sql`${mode}`), sql`, `)})
      and m.metric in (${sql.join(metrics.map((metric) => sql`${metric}`), sql`, `)})
    group by m.instrument_id, latest.as_of
  `);
  const byInstrument = new Map(latestSnapshots.map((r) => [r.instrument_id, r]));

  return instruments.map((instrument) => {
    const snap = byInstrument.get(instrument.id);
    const values: Record<string, number | string | null> = {
      sector_code: instrument.sectorCode,
      is_bank: instrument.isBank ? "true" : "false",
    };
    for (const [metric, value] of Object.entries(snap?.vals ?? {})) values[metric] = Number(value);
    return {
      instrumentId: instrument.id,
      code: instrument.code,
      name: instrument.name,
      sectorName: instrument.sectorName,
      isBank: instrument.isBank,
      dataMode: instrument.dataMode,
      asOf: snap?.as_of ?? null,
      values,
    };
  });
}

export async function getMetricSnapshotsForInstruments(instrumentIds: string[]) {
  if (instrumentIds.length === 0) return [];
  return db
    .select()
    .from(schema.metricSnapshots)
    .where(and(inArray(schema.metricSnapshots.instrumentId, instrumentIds), eq(schema.metricSnapshots.formulaVersion, FORMULA_VERSION)));
}

export interface ForeignLeaderRow {
  code: string;
  name: string;
  tradingDate: string;
  foreignNet: number;
  foreignBuy: number | null;
  foreignSell: number | null;
  volume: number | null;
  close: number | null;
  changePct: number | null;
}

/**
 * Net asing per saham pada sesi terakhir (lembar) — semua saham yang punya
 * data asing di sesi itu. Satuan lembar; tidak dikonversi ke Rupiah.
 */
export function getForeignSession(): Promise<ForeignLeaderRow[]> {
  return cachedMarket("foreign-session", async () => {
    const rows = await db.execute<{
      code: string;
      name: string;
      trading_date: string;
      foreign_net: string;
      foreign_buy: string | null;
      foreign_sell: string | null;
      volume: string | null;
      close: string | null;
      prev_close: string | null;
    }>(sql`
      with last as (
        select max(d.trading_date) as dt from ${schema.dailyBars} d
        join ${schema.instruments} i on i.id = d.instrument_id
        where d.foreign_net is not null and i.data_mode::text in (${sql.join(visibleDataModes().map((m) => sql`${m}`), sql`, `)})
      )
      select i.code, i.name, d.trading_date::text as trading_date, d.foreign_net::text as foreign_net, d.foreign_buy::text as foreign_buy,
             d.foreign_sell::text as foreign_sell, d.volume::text as volume, d.close::text as close,
             (select p.close::text from ${schema.dailyBars} p where p.instrument_id = d.instrument_id and p.trading_date < d.trading_date and p.close is not null order by p.trading_date desc limit 1) as prev_close
      from ${schema.dailyBars} d
      join ${schema.instruments} i on i.id = d.instrument_id
      join last on d.trading_date = last.dt
      where d.foreign_net is not null and i.status = 'active'
        and i.data_mode::text in (${sql.join(visibleDataModes().map((m) => sql`${m}`), sql`, `)})
    `);
    return rows.map((r) => {
      const close = r.close !== null ? Number(r.close) : null;
      const prev = r.prev_close !== null ? Number(r.prev_close) : null;
      return {
        code: r.code,
        name: r.name,
        tradingDate: r.trading_date,
        foreignNet: Number(r.foreign_net),
        foreignBuy: r.foreign_buy !== null ? Number(r.foreign_buy) : null,
        foreignSell: r.foreign_sell !== null ? Number(r.foreign_sell) : null,
        volume: r.volume !== null ? Number(r.volume) : null,
        close,
        changePct: close !== null && prev !== null && prev !== 0 ? ((close - prev) / prev) * 100 : null,
      };
    });
  });
}
