import "@/server/load-env";

import { readFileSync, writeFileSync } from "node:fs";

import postgres from "postgres";

import { summarizeInstruments, toNum, type AuditCheckpoint } from "@/server/audit/arjum-capacity";

/**
 * Menyusun docs/arjum-capacity-audit.json dari checkpoint audit (fakta live)
 * + pembacaan database READ-ONLY. Tidak ada panggilan HTTP.
 *   pnpm audit:arjum:report
 *
 * Setiap angka diberi status: exact | lower_bound | upper_bound_conditional |
 * estimate | unknown. Tidak ada angka hasil mengalikan sampel satu saham.
 */

type Status = "exact" | "lower_bound" | "upper_bound_conditional" | "estimate" | "unknown";
const n = (value: number | null, status: Status, basis: string) => ({ value, status, basis });

/** Hari Senin–Jumat dalam rentang tertutup (batas atas jumlah sesi). */
export function weekdaysBetween(start: string, end: string): number {
  let count = 0;
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) count += 1;
  }
  return count;
}

async function main() {
  const cp = JSON.parse(readFileSync("docs/arjum-audit/checkpoint.json", "utf8")) as AuditCheckpoint;
  const manifest = readFileSync("docs/arjum-audit/manifest.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const f = (id: string) => (cp.done[id]?.facts ?? {}) as Record<string, unknown>;
  const inst = summarizeInstruments(cp);

  const codesOf = (prefix: string) => new Set(Object.entries(cp.marketCapCodes).filter(([k]) => k.startsWith(prefix)).flatMap(([, v]) => v));
  const current = new Set(inst.codes);
  const list2025 = codesOf("market-cap:date-2025-01-02");
  const missingNow = [...list2025].filter((c) => !current.has(c)).sort();
  const knownCodes = new Set([...current, ...list2025]);

  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  try {
    const session = cp.sessionDate;
    // Rentang data_available 50 saham dari raw snapshot ingestion (read-only).
    const avail = await sql`
      select distinct on (request_params->>'code') request_params->>'code' as code,
             raw_body->'data_available'->>'start' as start, raw_body->'data_available'->>'end' as "end"
      from provider_raw_snapshots
      where provider = 'arjum' and capability = 'daily_bars' and raw_body ? 'data_available'
      order by request_params->>'code', fetched_at desc`;
    const perStockUpper = avail.map((r) => Math.ceil(weekdaysBetween(r.start as string, (r.end as string) ?? session) / 500));

    // done-details: perkiraan halaman dari freq (freq teramati sedikit < total done-details).
    const ddWindow = await sql`
      select count(distinct d.trading_date)::int sesi, count(distinct d.instrument_id)::int saham,
             sum(ceil(d.frequency / 100.0))::int halaman
      from daily_bars d where d.source = 'arjum' and d.trading_date >= '2026-09-01' and d.trading_date <= ${session} and d.frequency > 0`;
    const ddDay = await sql`
      select count(*)::int saham, sum(ceil(d.frequency / 100.0))::int halaman
      from daily_bars d where d.source = 'arjum' and d.trading_date = ${session} and d.frequency > 0`;
    const freqCheck = await sql`
      select i.code, d.trading_date::text as date, d.frequency from daily_bars d join instruments i on i.id = d.instrument_id
      where d.source = 'arjum' and ((i.code = 'BBCA' and d.trading_date in (${session}, '2026-09-01')) or (i.code = 'BBRI' and d.trading_date = ${session}))`;
    const db = await sql`
      select (select count(*)::int from instruments where data_mode = 'live') live_instruments,
             (select count(distinct instrument_id)::int from daily_bars where source = 'arjum') priced_instruments,
             (select count(*)::int from daily_bars where source = 'arjum') bars,
             (select min(trading_date)::text from daily_bars where source = 'arjum') first_date,
             (select max(trading_date)::text from daily_bars where source = 'arjum') last_date,
             (select count(*)::int from (select instrument_id, trading_date from daily_bars where source='arjum' group by 1,2 having count(*) > 1) x) duplicate_bars,
             (select count(*)::int from financial_facts ff join instruments i on i.id = ff.instrument_id where i.data_mode = 'live') live_financial_facts,
             (select count(*)::int from announcements a join instruments i on i.id = a.instrument_id where i.data_mode = 'live') live_announcements`;

    const weekdaysFull = weekdaysBetween("2020-01-02", session);
    const finCalls = ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW_REPORT"].flatMap((t) => ["quarterly", "annually"].map((p) => f(`fin:${t}:${p}`)));
    const finMaxCount = Math.max(...finCalls.map((x) => toNum(x.count) ?? 0));
    const ddTotals = {
      BBCA_session: toNum(f("done-details:last-session").total),
      BBRI_session: toNum(f("done-details:BBRI-last-session").total),
      BBCA_2026_09_01: toNum(f("done-details:2026-09-01").total),
    };
    const ddPagesExact = (toNum(f("done-details:last-session").total_pages) ?? 0) + (toNum(f("done-details:BBRI-last-session").total_pages) ?? 0) +
      Math.ceil((ddTotals.BBCA_2026_09_01 ?? 0) / 100);
    const httpOk = manifest.filter((m) => m.outcome === "ok").length;
    const costs = manifest.map((m) => m.quotaCost).filter((c) => c !== null);

    const out = {
      generatedAt: new Date().toISOString(),
      provider: "arjum",
      keyUsedForAudit: cp.keyLabel,
      sessionDateUsed: session,
      audit: {
        httpCalls: n(cp.httpCallsUsed, "exact", "penghitung budget audit (setiap percobaan HTTP, termasuk retry)"),
        httpOk,
        hardBudget: 100,
        quotaUnitsPerDataCall: n(costs.every((c) => c === 1) ? 1 : null, costs.every((c) => c === 1) ? "exact" : "unknown",
          `penurunan x-ratelimit-remaining antar panggilan berurutan pada key yang sama (${costs.length} pengamatan; semua = 1 termasuk respons kosong)`),
        healthCostsQuota: n(0, "exact", "search(remaining 900) → health → search(remaining 899): selisih hanya milik search"),
        contaminationNote: "Audit memakai key#1 saja; worker aplikasi memilih key acak dan menunggu sampai 17.00 WIB selama audit (16.36–16.45 WIB). Pengukuran biaya per panggilan tidak tercemar pada rentang itu (tidak ada penurunan ganda).",
      },
      instruments: {
        current: n(inst.unique, "exact", `market-cap date=${inst.datasetDate}, ${inst.pagesFetched} halaman, ${inst.rows} baris, metadata total ${inst.metadataTotal}`),
        duplicates: inst.duplicates,
        paginationConsistent: inst.pagination,
        datasetDate: inst.datasetDate,
        list_2025_01_02: n(list2025.size, "exact", `metadata total ${toNum(f("market-cap:date-2025-01-02").total)}`),
        list_2020_01_02_total: n(toNum(f("market-cap:date-2020-01-02").total), "exact", "metadata total halaman 1 (kode tidak dikumpulkan lengkap)"),
        inListOn2025ButNotNow: missingNow,
        everListedSince2020: n(knownCodes.size, "lower_bound", "gabungan daftar kini + 2025-01-02; tanggal lain belum diambil (20 panggilan per tanggal)"),
        instrumentTypes: n(null, "unknown", "respons tidak memuat jenis instrumen; daftar memuat kode non-4-huruf (mis. GOTOM, MAMIP, MYRXP)"),
        delistedHistoryAccessible: n(1, "exact", `FREN: data_available ${JSON.stringify(f("history:FREN-delisted-20").data_available)}`),
      },
      setup: {
        instrumentList: n(toNum(f("market-cap:p1").total_pages), "exact", "1 panggilan per halaman per_page=50"),
        ohlcvDailyAllHistory: {
          perStockFormula: "ceil(jumlah_sesi_i / 500) dengan jendela start_date/end_date (terbukti dihormati)",
          lowerBound: n(knownCodes.size + 1, "lower_bound", "≥1 per kode yang diketahui; BBCA terbukti >500 sesi (500 baris hanya sampai 2024-08-27, data mulai 2020-01-02)"),
          upperBoundConditional: n(knownCodes.size * Math.ceil(weekdaysFull / 500), "upper_bound_conditional",
            `bila tidak ada saham dengan data sebelum 2020-01-02 (teramati pada ${avail.length + 2} saham) dan sesi ≤ hari kerja (${weekdaysFull} hari kerja 2020-01-02..${session} → maks ${Math.ceil(weekdaysFull / 500)} panggilan/saham)`),
          measuredStored: n(perStockUpper.reduce((a, b) => a + b, 0), "upper_bound_conditional", `${avail.length} saham dengan data_available tersimpan; batas atas per saham dari hari kerja dalam rentangnya`),
          exact: n(null, "unknown", "jumlah sesi per saham hanya diketahui dengan mengambil datanya"),
        },
        fundamentalsAll: {
          perStock: n(6, "exact", `BBCA: count maksimum ${finMaxCount} periode < limit 40 → 1 panggilan per (3 jenis × 2 periode)`),
          allCurrent: n(inst.unique * 6, "lower_bound", "6 per instrumen kini; pasti bila tidak ada instrumen >40 periode (belum terukur selain BBCA); parameter year untuk periode sebelum 2022 belum diuji"),
          projectNeed: n(inst.unique * 2, "lower_bound", "fitur proyek (PER/PBV/ROE/ROA/NPM/DER) butuh INCOME_STATEMENT + BALANCE_SHEET kuartalan"),
        },
        brokerSummaryDailyArchive: n(null, "unknown", "1 panggilan per saham per sesi sejak broker_date_min 2020-01-02 = total sesi semua saham (belum terukur); kelengkapan broker per panggilan dibatasi broker_limit (default 20; all_data belum diuji)"),
        insiders: {
          BBCA: n(toNum(f("insiders:p1").total_pages), "exact", `total ${toNum(f("insiders:p1").total)} baris, ${toNum(f("insiders:p1").count)} per halaman`),
          all: n(knownCodes.size, "lower_bound", "≥1 halaman per kode; total per saham hanya dari halaman 1 masing-masing"),
        },
        doneDetails: {
          retention: n(null, "unknown", "tersedia 2026-09-01 (BBCA), kosong 2026-06-02/2026-03-02/2025-10-02 → batas awal di (2026-06-02, 2026-09-01]"),
          pagesMeasuredExact: n(ddPagesExact, "exact", "BBCA 2026-10-02 + BBRI 2026-10-02 + BBCA 2026-09-01"),
          totalsVsFreq: { doneDetails: ddTotals, freq: freqCheck },
          estimatePricedStocksWindow: n(ddWindow[0]?.halaman ?? null, "estimate",
            `Σ ceil(freq/100), ${ddWindow[0]?.saham} saham × ${ddWindow[0]?.sesi} sesi 2026-09-01..${session}; freq teramati 5–44 lebih kecil dari total done-details → sedikit di bawah nyata`),
          allMarket: n(null, "unknown", "freq saham lain belum tersimpan (backfill); retensi belum terukur"),
        },
        seasonalAnalysisPrice: n(inst.unique, "exact", "1 panggilan per instrumen per snapshot untuk masing-masing endpoint (snapshot terkini, tidak bisa mundur)"),
        screenerLatest: n(1, "exact", `snapshot harian, cached_for_seconds ${toNum(f("screener-latest").cached_for_seconds)}`),
      },
      sync: {
        ohlcvPerSession: n(inst.unique, "exact", "1 panggilan per instrumen aktif (limit ≥20 → overlap koreksi tanpa biaya tambahan); tidak ada batch OHLCV"),
        closeOnlyBatchAlternative: n(toNum(f("market-cap:p1").total_pages), "exact", "market-cap?date= memberi close+market cap semua saham (tanpa OHLV/volume) per 20 panggilan"),
        brokerSummaryPerSession: n(inst.unique, "exact", "1 panggilan per saham per sesi (start_date=end_date)"),
        doneDetailsPerSessionPricedStocks: n(ddDay[0]?.halaman ?? null, "estimate", `Σ ceil(freq/100) ${ddDay[0]?.saham} saham pada ${session}`),
        doneDetailsPerSessionAll: n(null, "unknown", "butuh freq semua saham (tersedia setelah backfill) atau halaman 1 per saham"),
        fundamentalsPerRefresh: n(inst.unique * 2, "exact", "2 per saham untuk kebutuhan proyek; frekuensi refresh = variabel (musim laporan)"),
        universePerRefresh: n(toNum(f("market-cap:p1").total_pages), "exact", "per refresh daftar"),
        intradayPricePerPoll: n(inst.unique, "exact", "/api/price per saham per interval; interval = variabel"),
      },
      database: db[0],
      dataAvailable50: avail,
    };
    writeFileSync("docs/arjum-capacity-audit.json", JSON.stringify(out, null, 2) + "\n");
    console.log(JSON.stringify({ instruments: out.instruments.current, ohlcv: out.setup.ohlcvDailyAllHistory, dd: out.setup.doneDetails, db: out.database, weekdaysFull }, null, 1));
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Laporan gagal:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
