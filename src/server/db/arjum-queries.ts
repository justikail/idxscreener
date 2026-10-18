import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "./client";
import * as schema from "./schema";

/**
 * Query halaman detail untuk dataset Arjum tambahan. Semua hanya membaca
 * database aplikasi — tidak pernah memanggil penyedia (AGENTS.md §7).
 */

/** Fakta laporan keuangan versi terbaru per (periode, basis, konsep). */
export async function getLatestFacts(instrumentId: string) {
  const rows = await db.execute<{
    fiscal_year: number;
    fiscal_quarter: number;
    period_basis: string;
    period_type: string;
    concept: string;
    value: string | null;
    unit: string | null;
    validation: string | null;
    provider_fetched_at: string | null;
    fetched_at: string; // db.execute: timestamp dikembalikan sebagai string
    source: string;
    version: number;
    [k: string]: unknown;
  }>(sql`
    select distinct on (fiscal_year, fiscal_quarter, period_basis, concept)
      fiscal_year, fiscal_quarter, period_basis, period_type::text, concept, value::text, unit, validation,
      provider_fetched_at, fetched_at, source, version
    from ${schema.financialFacts}
    where instrument_id = ${instrumentId}
    order by fiscal_year desc, fiscal_quarter desc, period_basis, concept, version desc
  `);
  return rows;
}

/** Laporan mentah terbaru (versi tertinggi) per jenis untuk periode terbaru. */
export async function getLatestReports(instrumentId: string) {
  return db.execute<{
    report_type: string;
    period: string;
    fiscal_year: number;
    fiscal_quarter: number;
    label: string | null;
    provider_fetched_at: string | null;
    data: Record<string, unknown>;
    version: number;
    fetched_at: string;
    [k: string]: unknown;
  }>(sql`
    select distinct on (report_type, period, fiscal_year, fiscal_quarter)
      report_type, period, fiscal_year, fiscal_quarter, label, provider_fetched_at, data, version, fetched_at
    from ${schema.financialReports}
    where instrument_id = ${instrumentId}
    order by report_type, period, fiscal_year desc, fiscal_quarter desc, version desc
  `);
}

export async function getLatestMarketCap(instrumentId: string) {
  const [row] = await db
    .select()
    .from(schema.marketCapSnapshots)
    .where(eq(schema.marketCapSnapshots.instrumentId, instrumentId))
    .orderBy(desc(schema.marketCapSnapshots.snapshotDate))
    .limit(1);
  return row ?? null;
}

export async function getLatestQuote(instrumentId: string) {
  const [row] = await db.select().from(schema.latestQuotes).where(eq(schema.latestQuotes.instrumentId, instrumentId)).limit(1);
  return row ?? null;
}

/** Daftar rentang broker summary yang TERSIMPAN (untuk pemilih tanggal). */
export async function getBrokerSummaryRanges(instrumentId: string) {
  return db
    .select({
      id: schema.brokerSummaries.id,
      startDate: schema.brokerSummaries.startDate,
      endDate: schema.brokerSummaries.endDate,
      paramsKey: schema.brokerSummaries.paramsKey,
      brokerCount: schema.brokerSummaries.brokerCount,
      coverage: schema.brokerSummaries.coverage,
      coverageNote: schema.brokerSummaries.coverageNote,
      meta: schema.brokerSummaries.meta,
      fetchedAt: schema.brokerSummaries.fetchedAt,
    })
    .from(schema.brokerSummaries)
    .where(eq(schema.brokerSummaries.instrumentId, instrumentId))
    .orderBy(desc(schema.brokerSummaries.endDate), desc(schema.brokerSummaries.startDate))
    .limit(60);
}

export async function getBrokerSummaryRows(summaryId: number) {
  return db.select().from(schema.brokerSummaryRows).where(eq(schema.brokerSummaryRows.summaryId, summaryId));
}

/** Volume asing per sesi (lembar) — hanya sesi yang punya data asing. */
export async function getForeignFlow(instrumentId: string, sessions = 20) {
  const rows = await db
    .select({
      tradingDate: schema.dailyBars.tradingDate,
      volume: schema.dailyBars.volume,
      foreignBuy: schema.dailyBars.foreignBuy,
      foreignSell: schema.dailyBars.foreignSell,
      foreignNet: schema.dailyBars.foreignNet,
    })
    .from(schema.dailyBars)
    .where(and(eq(schema.dailyBars.instrumentId, instrumentId), eq(schema.dailyBars.source, "arjum")))
    .orderBy(desc(schema.dailyBars.tradingDate))
    .limit(sessions);
  return rows.reverse();
}

/** Semua penutupan tersimpan (untuk seasonality lokal). */
export async function getAllCloses(instrumentId: string) {
  return db
    .select({ tradingDate: schema.dailyBars.tradingDate, close: schema.dailyBars.close })
    .from(schema.dailyBars)
    .where(and(eq(schema.dailyBars.instrumentId, instrumentId), sql`${schema.dailyBars.close} is not null`))
    .orderBy(asc(schema.dailyBars.tradingDate));
}

export async function getDerivedSnapshot(instrumentId: string, dataset: string) {
  const [row] = await db
    .select()
    .from(schema.providerDerivedSnapshots)
    .where(and(eq(schema.providerDerivedSnapshots.instrumentId, instrumentId), eq(schema.providerDerivedSnapshots.dataset, dataset)))
    .orderBy(desc(schema.providerDerivedSnapshots.fetchedAt))
    .limit(1);
  return row ?? null;
}

/** Transaksi insider tersimpan, terbaru dulu. */
export async function getInsiders(instrumentId: string) {
  return db
    .select({
      id: schema.insiderTransactions.id,
      holderName: schema.insiderTransactions.holderName,
      txDate: schema.insiderTransactions.txDate,
      actionType: schema.insiderTransactions.actionType,
      badges: schema.insiderTransactions.badges,
      previousShares: schema.insiderTransactions.previousShares,
      previousPct: schema.insiderTransactions.previousPct,
      currentShares: schema.insiderTransactions.currentShares,
      currentPct: schema.insiderTransactions.currentPct,
      changeShares: schema.insiderTransactions.changeShares,
      price: schema.insiderTransactions.price,
      fetchedAt: schema.insiderTransactions.fetchedAt,
    })
    .from(schema.insiderTransactions)
    .where(eq(schema.insiderTransactions.instrumentId, instrumentId))
    .orderBy(desc(schema.insiderTransactions.txDate), asc(schema.insiderTransactions.holderName));
}

/** Checkpoint pengambilan insider (lengkap atau belum) untuk label cakupan. */
export async function getFetchCheckpoint(dataset: string, code: string) {
  const [row] = await db
    .select({ checkpoint: schema.datasetFetchState.checkpoint, lastSuccessAt: schema.datasetFetchState.lastSuccessAt })
    .from(schema.datasetFetchState)
    .where(and(eq(schema.datasetFetchState.dataset, dataset), eq(schema.datasetFetchState.code, code)));
  return row ?? null;
}
