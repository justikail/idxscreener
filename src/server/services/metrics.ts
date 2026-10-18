import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { ema, macd, relativeVolume, rsi, sma } from "@/domain/indicators";
import { der, npm, per, pbv, roa, roe, ttmFromQuarters, type MetricStatus } from "@/domain/fundamentals";
import type { CandidateMetrics, FilterField } from "@/domain/filter-ast";
import { brokerTop3NetRatio, priceMetrics, ttmGrowth } from "@/domain/strategy-metrics";

// 2: fakta Arjum (EPS TTM, ekuitas induk, kapitalisasi dari saham tercatat), metrik asing & kapitalisasi.
// 3: metrik strategi Rekomendasi (return, posisi penutupan, nilai rata-rata, pertumbuhan TTM, konsentrasi broker).
export const FORMULA_VERSION = "3";

export interface InstrumentSnapshotRow {
  metric: string;
  value: number | null;
  unit: string | null;
  status: MetricStatus;
}

export interface ComputedInstrument {
  instrumentId: string;
  code: string;
  isBank: boolean;
  sectorCode: string | null;
  asOfPrice: string; // tanggal harga terakhir tersedia untuk instrumen ini
  isPriceStale: boolean;
  snapshots: InstrumentSnapshotRow[];
  candidate: CandidateMetrics;
}

const FINANCIAL_CONCEPTS = [
  "revenue",
  "net_income",
  "net_income_total",
  "eps_basic",
  "total_equity",
  "equity_parent",
  "total_liabilities",
  "total_assets",
  "weighted_avg_shares",
] as const;

/** Jumlah sesi untuk metrik volume asing bersih. */
export const FOREIGN_WINDOW = 5;

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

/**
 * Menghitung snapshot metrik untuk instrumen aktif SATU mode data (demo atau
 * live) pada `runAsOf` = tanggal bar terbaru milik mode tersebut. Mode
 * dipisah agar kesegaran data demo tidak dinilai terhadap tanggal data real
 * (dan sebaliknya). Setiap instrumen memakai harga terakhirnya sendiri; bila
 * lebih lama dari `runAsOf`, ditandai stale.
 */
export async function computeInstrumentSnapshots(
  db: Database,
  runAsOf: string,
  dataMode: "demo" | "live" = "demo",
): Promise<ComputedInstrument[]> {
  const instruments = await db
    .select({
      id: schema.instruments.id,
      code: schema.instruments.code,
      isBank: schema.instruments.isBank,
      sectorCode: schema.sectors.code,
    })
    .from(schema.instruments)
    .leftJoin(schema.sectors, eq(schema.instruments.sectorId, schema.sectors.id))
    .where(and(eq(schema.instruments.status, "active"), eq(schema.instruments.dataMode, dataMode)));

  if (instruments.length === 0) return [];
  const instrumentIds = instruments.map((i) => i.id);

  // Diambil sekaligus untuk semua instrumen mode ini (bukan per instrumen dalam
  // loop) agar round-trip ke DB remote tidak bertumbuh linear.
  const allBars = await db
    .select({
      instrumentId: schema.dailyBars.instrumentId,
      tradingDate: schema.dailyBars.tradingDate,
      close: schema.dailyBars.close,
      high: schema.dailyBars.high,
      low: schema.dailyBars.low,
      value: schema.dailyBars.value,
      volume: schema.dailyBars.volume,
      foreignNet: schema.dailyBars.foreignNet,
    })
    .from(schema.dailyBars)
    .where(
      and(
        inArray(schema.dailyBars.instrumentId, instrumentIds),
        eq(schema.dailyBars.marketScope, "regular"),
        eq(schema.dailyBars.isAdjusted, false),
        // close null tidak boleh masuk perhitungan sebagai 0 (AGENTS.md §8).
        isNotNull(schema.dailyBars.close),
      ),
    )
    .orderBy(asc(schema.dailyBars.tradingDate));

  const allFacts = await db
    .select({
      instrumentId: schema.financialFacts.instrumentId,
      fiscalYear: schema.financialFacts.fiscalYear,
      fiscalQuarter: schema.financialFacts.fiscalQuarter,
      concept: schema.financialFacts.concept,
      value: schema.financialFacts.value,
      periodType: schema.financialFacts.periodType,
      periodBasis: schema.financialFacts.periodBasis,
      version: schema.financialFacts.version,
    })
    .from(schema.financialFacts)
    .where(
      and(
        inArray(schema.financialFacts.instrumentId, instrumentIds),
        inArray(schema.financialFacts.concept, [...FINANCIAL_CONCEPTS]),
        // Flow hanya kuartal mandiri (terverifikasi atau hasil selisih YTD);
        // neraca = posisi akhir periode. YTD mentah, tahunan, dan kuartal
        // berbasis belum terverifikasi tidak masuk TTM.
        inArray(schema.financialFacts.periodBasis, ["quarter", "instant"]),
      ),
    )
    .orderBy(asc(schema.financialFacts.fiscalYear), asc(schema.financialFacts.fiscalQuarter), asc(schema.financialFacts.version));

  // Saham tercatat terbaru per instrumen (snapshot /api/market-cap) — untuk
  // kapitalisasi pasar dan PBV. Tanggalnya ikut disimpan sebagai label.
  const capRows = await db
    .select({
      instrumentId: schema.marketCapSnapshots.instrumentId,
      snapshotDate: schema.marketCapSnapshots.snapshotDate,
      listedShares: schema.marketCapSnapshots.listedShares,
    })
    .from(schema.marketCapSnapshots)
    .where(and(inArray(schema.marketCapSnapshots.instrumentId, instrumentIds), isNotNull(schema.marketCapSnapshots.listedShares)))
    .orderBy(desc(schema.marketCapSnapshots.snapshotDate));
  const sharesByInstrument = new Map<string, { date: string; shares: number }>();
  for (const c of capRows) {
    if (!sharesByInstrument.has(c.instrumentId)) sharesByInstrument.set(c.instrumentId, { date: c.snapshotDate, shares: Number(c.listedShares) });
  }

  // Ringkasan broker satu sesi terbaru per instrumen (untuk konsentrasi beli).
  const brokerSummaries = await db
    .select({ id: schema.brokerSummaries.id, instrumentId: schema.brokerSummaries.instrumentId, endDate: schema.brokerSummaries.endDate, coverage: schema.brokerSummaries.coverage })
    .from(schema.brokerSummaries)
    .where(and(inArray(schema.brokerSummaries.instrumentId, instrumentIds), eq(schema.brokerSummaries.startDate, schema.brokerSummaries.endDate)))
    .orderBy(desc(schema.brokerSummaries.endDate), desc(schema.brokerSummaries.fetchedAt));
  const latestBroker = new Map<string, (typeof brokerSummaries)[number]>();
  for (const b of brokerSummaries) {
    const cur = latestBroker.get(b.instrumentId);
    // Tanggal sama: snapshot berisi seluruh broker didahulukan atas yang parsial.
    if (!cur || (cur.endDate === b.endDate && cur.coverage !== "complete" && b.coverage === "complete")) latestBroker.set(b.instrumentId, b);
  }
  const brokerRows = latestBroker.size
    ? await db
        .select({ summaryId: schema.brokerSummaryRows.summaryId, netValue: schema.brokerSummaryRows.netValue })
        .from(schema.brokerSummaryRows)
        .where(inArray(schema.brokerSummaryRows.summaryId, [...latestBroker.values()].map((b) => b.id)))
    : [];
  const netBySummary = new Map<number, Array<number | null>>();
  for (const r of brokerRows) netBySummary.set(r.summaryId, [...(netBySummary.get(r.summaryId) ?? []), toNumber(r.netValue)]);

  const barsByInstrument = new Map<string, typeof allBars>();
  for (const bar of allBars) {
    const list = barsByInstrument.get(bar.instrumentId);
    if (list) list.push(bar);
    else barsByInstrument.set(bar.instrumentId, [bar]);
  }

  const factsByInstrument = new Map<string, typeof allFacts>();
  for (const fact of allFacts) {
    const list = factsByInstrument.get(fact.instrumentId);
    if (list) list.push(fact);
    else factsByInstrument.set(fact.instrumentId, [fact]);
  }

  const results: ComputedInstrument[] = [];

  for (const instrument of instruments) {
    const bars = barsByInstrument.get(instrument.id) ?? [];

    const snapshots: InstrumentSnapshotRow[] = [];
    const candidateValues: CandidateMetrics["values"] = {
      sector_code: instrument.sectorCode,
      is_bank: instrument.isBank ? "true" : "false",
    };

    let price: number | null = null;
    let lastTradingDate = runAsOf;
    let isPriceStale = false;

    if (bars.length === 0) {
      snapshots.push({ metric: "price", value: null, unit: "IDR", status: "unavailable" });
    } else {
      // Bar dengan close null sudah disaring di query; non-null assertion aman.
      const closes = bars.map((b) => toNumber(b.close)!);
      const volumes = bars.map((b) => Number(b.volume ?? 0n));
      const lastIndex = bars.length - 1;
      const lastBar = bars[lastIndex]!;

      price = toNumber(lastBar.close);
      lastTradingDate = lastBar.tradingDate;
      isPriceStale = lastTradingDate < runAsOf;

      snapshots.push({
        metric: "price",
        value: price,
        unit: "IDR",
        status: price === null ? "null_missing" : isPriceStale ? "stale" : "ok",
      });

      const rsiSeries = rsi(closes, 14);
      const rsiValue = rsiSeries[lastIndex] ?? null;
      snapshots.push({ metric: "rsi14", value: rsiValue, unit: "index", status: rsiValue === null ? "null_missing" : isPriceStale ? "stale" : "ok" });

      const relVol = relativeVolume(volumes, lastIndex, 20);
      snapshots.push({ metric: "volume_relative_20d", value: relVol, unit: "ratio", status: relVol === null ? "null_missing" : isPriceStale ? "stale" : "ok" });

      const sma20 = sma(closes, 20)[lastIndex] ?? null;
      const sma50 = sma(closes, 50)[lastIndex] ?? null;
      const ema12 = ema(closes, 12)[lastIndex] ?? null;
      const ema26 = ema(closes, 26)[lastIndex] ?? null;
      const macdResult = macd(closes);
      snapshots.push({ metric: "sma20", value: sma20, unit: "IDR", status: sma20 === null ? "null_missing" : "ok" });
      snapshots.push({ metric: "sma50", value: sma50, unit: "IDR", status: sma50 === null ? "null_missing" : "ok" });
      snapshots.push({ metric: "ema12", value: ema12, unit: "IDR", status: ema12 === null ? "null_missing" : "ok" });
      snapshots.push({ metric: "ema26", value: ema26, unit: "IDR", status: ema26 === null ? "null_missing" : "ok" });
      snapshots.push({
        metric: "macd_histogram",
        value: macdResult.histogram[lastIndex] ?? null,
        unit: "IDR",
        status: (macdResult.histogram[lastIndex] ?? null) === null ? "null_missing" : "ok",
      });

      // Volume asing bersih 5 sesi terakhir (lembar) dan rasionya terhadap
      // volume total 5 sesi yang sama. Butuh data asing lengkap di kelima sesi.
      const window = bars.slice(-FOREIGN_WINDOW);
      const foreignComplete = window.length === FOREIGN_WINDOW && window.every((b) => b.foreignNet !== null && b.volume !== null);
      const foreignNet5 = foreignComplete ? window.reduce((sum, b) => sum + Number(b.foreignNet), 0) : null;
      const volume5 = foreignComplete ? window.reduce((sum, b) => sum + Number(b.volume), 0) : null;
      const foreignRatio5 = foreignNet5 !== null && volume5 !== null && volume5 > 0 ? foreignNet5 / volume5 : null;
      const foreignStatus = (v: number | null) => (v === null ? (foreignComplete && volume5 === 0 ? "not_applicable" : "null_missing") : isPriceStale ? "stale" : "ok");
      snapshots.push({ metric: "foreign_net_5d", value: foreignNet5, unit: "shares", status: foreignStatus(foreignNet5) });
      snapshots.push({ metric: "foreign_net_ratio_5d", value: foreignRatio5, unit: "ratio", status: foreignStatus(foreignRatio5) });

      // Metrik strategi (v3) dari data harian.
      const pm = priceMetrics(bars.map((b) => ({ close: toNumber(b.close)!, high: toNumber(b.high), low: toNumber(b.low), value: toNumber(b.value) })));
      const pmStatus = (v: number | null) => (v === null ? "null_missing" : isPriceStale ? "stale" : "ok");
      for (const [metric, value, unit] of [
        ["change_1d", pm.change1d, "ratio"],
        ["return_5d", pm.return5d, "ratio"],
        ["return_20d", pm.return20d, "ratio"],
        ["close_position", pm.closePosition, "ratio"],
        ["value_avg_20d", pm.valueAvg20, "IDR"],
        ["close_vs_sma20", pm.closeVsSma20, "ratio"],
        ["close_vs_sma50", pm.closeVsSma50, "ratio"],
        ["sma20_vs_sma50", pm.sma20VsSma50, "ratio"],
        ["range_position_52w", pm.rangePosition52w, "ratio"],
      ] as const) {
        snapshots.push({ metric, value, unit, status: pmStatus(value) });
        (candidateValues as Record<string, number | string | null>)[metric] = value;
      }

      // Bandarmologi: hanya bila ringkasan broker untuk sesi TERAKHIR yang sama tersedia.
      const broker = latestBroker.get(instrument.id);
      const brokerRatio =
        broker && broker.endDate === lastBar.tradingDate ? brokerTop3NetRatio(netBySummary.get(broker.id) ?? [], toNumber(lastBar.value)) : null;
      snapshots.push({ metric: "broker_top3_net_ratio", value: brokerRatio, unit: "ratio", status: brokerRatio === null ? "null_missing" : "ok" });
      candidateValues.broker_top3_net_ratio = brokerRatio;

      candidateValues.price = price;
      candidateValues.rsi14 = rsiValue;
      candidateValues.volume_relative_20d = relVol;
      candidateValues.foreign_net_ratio_5d = foreignRatio5;
    }

    const facts = factsByInstrument.get(instrument.id) ?? [];

    // Versi terbaru menang (fakta diurutkan versi naik). Flow & neraca dipisah.
    const flow = new Map<string, number | null>();
    const stock = new Map<string, number | null>();
    const flowQuarters: Array<{ fiscalYear: number; fiscalQuarter: number }> = [];
    const stockQuarters: Array<{ fiscalYear: number; fiscalQuarter: number }> = [];
    const addQuarter = (list: typeof flowQuarters, fy: number, fq: number) => {
      if (!list.some((q) => q.fiscalYear === fy && q.fiscalQuarter === fq)) list.push({ fiscalYear: fy, fiscalQuarter: fq });
    };
    for (const fact of facts) {
      const key = `${fact.fiscalYear}Q${fact.fiscalQuarter}:${fact.concept}`;
      if (fact.periodType === "instant") {
        stock.set(key, toNumber(fact.value));
        addQuarter(stockQuarters, fact.fiscalYear, fact.fiscalQuarter);
      } else {
        flow.set(key, toNumber(fact.value));
        addQuarter(flowQuarters, fact.fiscalYear, fact.fiscalQuarter);
      }
    }
    const byOrder = (a: { fiscalYear: number; fiscalQuarter: number }, b: { fiscalYear: number; fiscalQuarter: number }) =>
      a.fiscalYear !== b.fiscalYear ? a.fiscalYear - b.fiscalYear : a.fiscalQuarter - b.fiscalQuarter;
    flowQuarters.sort(byOrder);
    stockQuarters.sort(byOrder);

    const lastFour = flowQuarters.slice(-4);
    const ttm = (concept: string) =>
      ttmFromQuarters(lastFour.map((q) => ({ fiscalYear: q.fiscalYear, fiscalQuarter: q.fiscalQuarter, value: flow.get(`${q.fiscalYear}Q${q.fiscalQuarter}:${concept}`) ?? null })));

    // Laba & ekuitas milik entitas induk berpasangan; bila tidak ada, total
    // berpasangan dengan total (tidak pernah dicampur induk vs total).
    const latestStock = stockQuarters[stockQuarters.length - 1];
    const stockAt = (q: { fiscalYear: number; fiscalQuarter: number } | undefined, concept: string) =>
      q ? stock.get(`${q.fiscalYear}Q${q.fiscalQuarter}:${concept}`) ?? null : null;
    // Awal periode TTM = posisi neraca 4 kuartal sebelum yang terakhir.
    const startStock = latestStock ? stockQuarters.find((q) => q.fiscalYear === latestStock.fiscalYear - 1 && q.fiscalQuarter === latestStock.fiscalQuarter) : undefined;

    const parentPair = ttm("net_income") !== null && stockAt(latestStock, "equity_parent") !== null;
    const netIncomeTtm = parentPair ? ttm("net_income") : ttm("net_income_total") ?? ttm("net_income");
    const equityConcept = parentPair ? "equity_parent" : stockAt(latestStock, "total_equity") !== null ? "total_equity" : "equity_parent";
    const revenueTtm = ttm("revenue");

    const latestEquity = stockAt(latestStock, equityConcept);
    const startEquity = stockAt(startStock, equityConcept);
    const latestAssets = stockAt(latestStock, "total_assets");
    const startAssets = stockAt(startStock, "total_assets");
    const latestLiabilities = stockAt(latestStock, "total_liabilities");
    const latestTotalEquity = stockAt(latestStock, "total_equity");
    const avgEquity = latestEquity !== null && startEquity !== null ? (latestEquity + startEquity) / 2 : latestEquity;
    const avgAssets = latestAssets !== null && startAssets !== null ? (latestAssets + startAssets) / 2 : latestAssets;

    // PER: data live = kapitalisasi (harga × saham tercatat terbaru) ÷ laba TTM —
    // setara harga ÷ (laba TTM ÷ saham tercatat). Satu definisi untuk semua
    // emiten: EPS sumber dibulatkan dan untuk sebagian emiten bernilai 0/tidak
    // dilaporkan (TLKM). Data demo (tanpa saham tercatat): laba ÷ saham tertimbang.
    const listed = sharesByInstrument.get(instrument.id) ?? null;
    const latestFlowKey = lastFour.length ? `${lastFour[lastFour.length - 1]!.fiscalYear}Q${lastFour[lastFour.length - 1]!.fiscalQuarter}` : null;
    const weightedShares = latestFlowKey ? flow.get(`${latestFlowKey}:weighted_avg_shares`) ?? stock.get(`${latestFlowKey}:weighted_avg_shares`) ?? null : null;
    const sharesForEarnings = listed?.shares ?? weightedShares;
    const epsTtm = netIncomeTtm !== null && sharesForEarnings !== null && sharesForEarnings > 0 ? netIncomeTtm / sharesForEarnings : null;

    // PBV = kapitalisasi (harga × saham tercatat terbaru) / ekuitas; data demo: saham tertimbang.
    const sharesForBook = listed?.shares ?? weightedShares;
    const equityPerShare = latestEquity !== null && sharesForBook !== null && sharesForBook > 0 ? latestEquity / sharesForBook : null;
    const marketCap = price !== null && listed ? price * listed.shares : null;
    snapshots.push({ metric: "market_cap", value: marketCap, unit: "IDR", status: marketCap === null ? "null_missing" : isPriceStale ? "stale" : "ok" });
    candidateValues.market_cap = marketCap;

    // Pertumbuhan TTM tahunan (v3): laba induk bila ada, selain itu laba total; pendapatan.
    const series = (concept: string) => flowQuarters.map((q) => ({ fiscalYear: q.fiscalYear, fiscalQuarter: q.fiscalQuarter, value: flow.get(`${q.fiscalYear}Q${q.fiscalQuarter}:${concept}`) ?? null }));
    const niSeries = series("net_income").filter((q) => q.value !== null).length >= 8 ? series("net_income") : series("net_income_total");
    const niGrowth = ttmGrowth(niSeries);
    const revGrowth = ttmGrowth(series("revenue"));
    snapshots.push({ metric: "net_income_growth_yoy", value: niGrowth.value, unit: "ratio", status: niGrowth.status });
    snapshots.push({ metric: "revenue_growth_yoy", value: revGrowth.value, unit: "ratio", status: revGrowth.status });
    candidateValues.net_income_growth_yoy = niGrowth.value;
    candidateValues.revenue_growth_yoy = revGrowth.value;

    const perResult = per(price, epsTtm);
    const pbvResult = pbv(price, equityPerShare);
    const roeResult = roe(netIncomeTtm, avgEquity);
    const roaResult = roa(netIncomeTtm, avgAssets);
    const npmResult = npm(netIncomeTtm, revenueTtm);
    const derResult = der(latestLiabilities, latestTotalEquity ?? latestEquity);

    for (const [metric, result] of [
      ["per", perResult],
      ["pbv", pbvResult],
      ["roe", roeResult],
      ["roa", roaResult],
      ["npm", npmResult],
      ["der", derResult],
    ] as const) {
      snapshots.push({ metric, value: result.value, unit: metric === "per" || metric === "pbv" || metric === "der" ? "x" : "ratio", status: result.status });
      (candidateValues as Record<FilterField, number | string | null>)[metric] = result.value;
    }

    results.push({
      instrumentId: instrument.id,
      code: instrument.code,
      isBank: instrument.isBank,
      sectorCode: instrument.sectorCode,
      asOfPrice: lastTradingDate,
      isPriceStale,
      snapshots,
      candidate: { instrumentId: instrument.id, values: candidateValues },
    });
  }

  return results;
}
