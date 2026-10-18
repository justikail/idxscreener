import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { monthlySeasonality } from "@/domain/seasonality";
import { assessBrokerCoverage, brokerParamsKey, normalizeBrokerSummary } from "@/server/ingestion/arjum-broker";
import { detectQuarterBasis, normalizeFacts, parseReportItems, quarterBounds, stableHash, valueAt, type ProviderReportItem } from "@/server/ingestion/arjum-financials";
import { normalizeQuote } from "@/server/ingestion/arjum-price";
import { normalizeForeign } from "@/server/ingestion/validate-arjum-history";
import {
  arjumBrokerSummaryResponseSchema,
  arjumFinancialStatementsResponseSchema,
  arjumPriceResponseSchema,
} from "@/server/providers/arjum/schemas";
import { effectiveRemaining } from "@/server/quota/budget";
import { insiderDedupKey, normalizeInsiders, parseFormatted } from "@/server/ingestion/arjum-insiders";
import { normalizeAccumulation, normalizeSeasonal } from "@/server/ingestion/arjum-derived";

const fixture = (name: string) => JSON.parse(readFileSync(`fixtures/arjum/${name}`, "utf8"));

// Respons nyata BBCA (probe 4 Okt 2026), disanitasi: tanpa header/key.
const isQuarterly = arjumFinancialStatementsResponseSchema.parse(fixture("financial-statements-BBCA-IS-quarterly.json"));

describe("laporan keuangan — validasi & pemetaan", () => {
  it("memetakan path nyata: laba induk, EPS dasar (anak, bukan grup bernilai 0)", () => {
    const { items, issues } = parseReportItems(isQuarterly, { code: "BBCA", reportType: "INCOME_STATEMENT", period: "quarterly" });
    expect(issues).toEqual([]);
    expect(items.map((i) => `${i.fiscalYear}Q${i.fiscalQuarter}`)).toEqual(["2026Q1", "2025Q4", "2025Q3", "2025Q2"]);
    const q1 = items[0]!;
    expect(valueAt(q1.data, "laba_rugi_yang_dapat_diatribusikan.laba_rugi_yang_dapat_diatribusikan_ke_entitas_induk")).toBe(14684123000000);
    // Grup induk EPS bernilai 0 di sumber padahal anaknya 119 → 0 = tidak dilaporkan.
    expect(valueAt(q1.data, "laba_rugi_per_saham.total")).toBe(0);
    const facts = normalizeFacts(items, "standalone");
    const eps = facts.find((f) => f.concept === "eps_basic" && f.fiscalYear === 2026)!;
    expect(eps).toMatchObject({ value: 119, unit: "IDR_per_share", periodBasis: "quarter", periodStart: "2026-01-01", periodEnd: "2026-03-31" });
  });

  it("menolak respons untuk kode/jenis/periode lain dan periode duplikat", () => {
    expect(parseReportItems(isQuarterly, { code: "BBRI", reportType: "INCOME_STATEMENT", period: "quarterly" }).items).toEqual([]);
    expect(parseReportItems(isQuarterly, { code: "BBCA", reportType: "BALANCE_SHEET", period: "quarterly" }).items).toEqual([]);
    expect(parseReportItems(isQuarterly, { code: "BBCA", reportType: "INCOME_STATEMENT", period: "annually" }).items).toEqual([]);
    const dup = { ...isQuarterly, items: [isQuarterly.items[0]!, isQuarterly.items[0]!] };
    const r = parseReportItems(dup, { code: "BBCA", reportType: "INCOME_STATEMENT", period: "quarterly" });
    expect(r.items).toHaveLength(1);
    expect(r.issues[0]!.message).toContain("lebih dari sekali");
  });

  it("basis kuartal: mandiri, YTD, belum terverifikasi, tidak konsisten", () => {
    const q = (vals: number[], year = 2025) => vals.map((value, i) => ({ fiscalYear: year, fiscalQuarter: i + 1, value }));
    expect(detectQuarterBasis(q([10, 11, 12, 13]), [{ fiscalYear: 2025, value: 46 }]).basis).toBe("standalone");
    expect(detectQuarterBasis(q([10, 21, 33, 46]), [{ fiscalYear: 2025, value: 46 }]).basis).toBe("ytd");
    expect(detectQuarterBasis(q([10, 11, 12]), [{ fiscalYear: 2025, value: 46 }]).basis).toBe("unverified");
    expect(detectQuarterBasis(q([10, 11, 12, 13]), [{ fiscalYear: 2025, value: 99 }]).basis).toBe("inconsistent");
    // Q1..Q3 nol: kedua uji cocok → bukan bukti.
    expect(detectQuarterBasis(q([0, 0, 0, 46]), [{ fiscalYear: 2025, value: 46 }]).basis).toBe("inconsistent");
  });

  it("YTD tidak dijumlahkan: kuartal mandiri diturunkan dari selisih, EPS tidak diturunkan", () => {
    const item = (q: number, laba: number, eps: number): ProviderReportItem => {
      const data = { laba_rugi: laba, laba_rugi_per_saham: { laba_per_saham_dasar_diatribusikan_kepada_pemilik_entitas_induk: { total: eps } } };
      return { reportType: "INCOME_STATEMENT", period: "quarterly", fiscalYear: 2025, fiscalQuarter: q, label: null, providerFetchedAt: null, data, dataHash: stableHash(data) };
    };
    const facts = normalizeFacts([item(1, 10, 1), item(2, 21, 2), item(3, 33, 3)], "ytd");
    const discrete = facts.filter((f) => f.concept === "net_income_total" && f.periodBasis === "quarter").map((f) => f.value);
    expect(discrete).toEqual([10, 11, 12]);
    expect(facts.filter((f) => f.concept === "net_income_total" && f.periodBasis === "ytd").map((f) => f.isYtd)).toEqual([true, true, true]);
    expect(facts.some((f) => f.concept === "eps_basic" && f.periodBasis === "quarter")).toBe(false);
  });

  it("basis belum terbukti → quarter_unverified (tidak masuk TTM)", () => {
    const { items } = parseReportItems(isQuarterly, { code: "BBCA", reportType: "INCOME_STATEMENT", period: "quarterly" });
    const facts = normalizeFacts(items, "unverified");
    expect(new Set(facts.map((f) => f.periodBasis))).toEqual(new Set(["quarter_unverified"]));
  });

  it("hash stabil terhadap urutan key (dasar deteksi revisi)", () => {
    expect(stableHash({ a: 1, b: { c: 2, d: 3 } })).toBe(stableHash({ b: { d: 3, c: 2 }, a: 1 }));
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });

  it("batas kuartal kalender", () => {
    expect(quarterBounds(2024, 1)).toEqual({ start: "2024-01-01", end: "2024-03-31" });
    expect(quarterBounds(2024, 4)).toEqual({ start: "2024-10-01", end: "2024-12-31" });
  });
});

describe("broker summary — kelengkapan & satuan", () => {
  const response = arjumBrokerSummaryResponseSchema.parse(fixture("broker-summary-BBCA.json"));

  it("respons nyata: 20 broker teratas mencakup ±79% volume pasar → parsial, satuan lembar", () => {
    const { summary } = normalizeBrokerSummary(response, "BBCA");
    expect(summary).toMatchObject({ startDate: "2026-10-02", endDate: "2026-10-02" });
    expect(summary!.rows).toHaveLength(20);
    // Volume BBCA 2026-10-02 dari /api/history (probe yang sama): 131.920.300 lembar.
    const coverage = assessBrokerCoverage(summary!.rows, 131_920_300);
    expect(coverage).toMatchObject({ coverage: "partial", volumeUnit: "shares" });
    expect(coverage.note).toContain("78.9%");
  });

  it("lengkap bila Σ volume beli = volume pasar (lembar) atau ×100 (lot); tanpa volume: uji keseimbangan beli=jual", () => {
    const rows = [
      { brokerCode: "AA", buyVolume: 600, sellVolume: 300 },
      { brokerCode: "BB", buyVolume: 400, sellVolume: 700 },
    ].map((r) => ({ brokerName: null, buyValue: 1, buyFreq: 1, sellValue: 1, sellFreq: 1, netValue: 0, netVolume: 0, ...r }));
    expect(assessBrokerCoverage(rows, 1000)).toMatchObject({ coverage: "complete", volumeUnit: "shares" });
    expect(assessBrokerCoverage(rows, 100_000)).toMatchObject({ coverage: "complete", volumeUnit: "lots" });
    expect(assessBrokerCoverage(rows, null)).toMatchObject({ coverage: "complete", volumeUnit: "unknown" });
    expect(assessBrokerCoverage(rows, 500).coverage).toBe("unknown"); // melebihi volume pasar
    const unbalanced = [{ ...rows[0]!, sellVolume: 1 }, rows[1]!];
    expect(assessBrokerCoverage(unbalanced, null).coverage).toBe("partial");
  });

  it("respons nyata all_data=true: 63 broker, Σ beli = Σ jual = volume pasar 5 Okt → lengkap, lembar", () => {
    const all = arjumBrokerSummaryResponseSchema.parse(fixture("broker-summary-BBCA-alldata.json"));
    const { summary } = normalizeBrokerSummary(all, "BBCA");
    expect(summary!.rows).toHaveLength(63);
    expect(assessBrokerCoverage(summary!.rows, 89_905_700)).toMatchObject({ coverage: "complete", volumeUnit: "shares" });
    expect(assessBrokerCoverage(summary!.rows, null).coverage).toBe("complete");
  });

  it("rentang tidak valid / kode lain ditolak; broker duplikat dilewati", () => {
    expect(normalizeBrokerSummary({ ...response, stock_code: "BBRI" }, "BBCA").summary).toBeNull();
    expect(normalizeBrokerSummary({ ...response, broker_start_date: "2026-10-03" }, "BBCA").summary).toBeNull();
    const dup = { ...response, brokers: [response.brokers[0]!, response.brokers[0]!] };
    const r = normalizeBrokerSummary(dup, "BBCA");
    expect(r.summary!.rows).toHaveLength(1);
    expect(r.issues[0]).toContain("lebih dari sekali");
  });

  it("kunci parameter membedakan snapshot top-N dan all_data", () => {
    expect(brokerParamsKey({})).toBe("");
    expect(brokerParamsKey({ allData: true })).toBe("all_data");
    expect(brokerParamsKey({ brokerLimit: 50 })).toBe("limit=50");
  });
});

describe("harga terbaru — fallback penutupan", () => {
  const response = arjumPriceResponseSchema.parse(fixture("price-BBCA.json"));

  it("respons nyata akhir pekan = penutupan sesi sebelumnya, bukan harga hari ini", () => {
    const { quote } = normalizeQuote(response, "BBCA", "2026-10-04");
    expect(quote).toMatchObject({ lastPrice: 6100, sourceDate: "2026-10-02", noTradeToday: true, isFallbackClose: true, quoteAgeMs: null });
  });

  it("transaksi hari ini hanya bila no_trade_today=false dan source_date = hari ini", () => {
    const today = { ...response, no_trade_today: false, source_date: "2026-10-05", quote_age_ms: 120000 };
    expect(normalizeQuote(today, "BBCA", "2026-10-05").quote!.isFallbackClose).toBe(false);
    expect(normalizeQuote({ ...today, source_date: "2026-10-02" }, "BBCA", "2026-10-05").quote!.isFallbackClose).toBe(true);
    expect(normalizeQuote({ ...today, source_date: null }, "BBCA", "2026-10-05").quote!.isFallbackClose).toBe(true);
  });

  it("kode lain atau harga ≤ 0 ditolak", () => {
    expect(normalizeQuote(response, "BBRI", "2026-10-04").quote).toBeNull();
    expect(normalizeQuote({ ...response, last_price: 0 }, "BBCA", "2026-10-04").quote).toBeNull();
  });
});

describe("volume asing (history)", () => {
  it("baris nyata BBCA 2026-10-02: lembar, net = beli − jual", () => {
    expect(normalizeForeign({ f_buy: 100853800, f_sell: 93815300, n_foreign: 7038500 }, 131920300)).toEqual({ buy: 100853800, sell: 93815300, net: 7038500, issue: null });
  });
  it("tidak konsisten → tidak disimpan (null), bukan diperbaiki", () => {
    expect(normalizeForeign({ f_buy: 200, f_sell: 50, n_foreign: 150 }, 100).net).toBeNull(); // > volume
    expect(normalizeForeign({ f_buy: 60, f_sell: 50, n_foreign: 5 }, 100).net).toBeNull(); // net salah
    expect(normalizeForeign({ f_buy: null, f_sell: 50 }, 100).net).toBeNull();
    expect(normalizeForeign({}, 100)).toEqual({ buy: null, sell: null, net: null, issue: null });
  });
});

describe("seasonality lokal", () => {
  const bars = [
    { tradingDate: "2025-11-28", close: 100 },
    { tradingDate: "2025-12-30", close: 110 },
    { tradingDate: "2026-01-30", close: 99 },
    // Februari kosong (celah) → Maret tidak dihitung
    { tradingDate: "2026-03-31", close: 120 },
    { tradingDate: "2026-04-30", close: 132 },
    { tradingDate: "2026-05-04", close: 140 }, // bulan berjalan
  ];
  it("hanya bulan lengkap dengan penutupan bulan sebelumnya", () => {
    const r = monthlySeasonality(bars, "2026-05-10");
    const y2025 = r.matrix.find((m) => m.year === 2025)!.returns;
    const y2026 = r.matrix.find((m) => m.year === 2026)!.returns;
    expect(y2025[11]).toBeCloseTo(0.1);
    expect(y2026[0]).toBeCloseTo(-0.1);
    expect(y2026[2]).toBeNull(); // setelah celah Februari
    expect(y2026[3]).toBeCloseTo(0.1);
    expect(y2026[4]).toBeNull(); // bulan berjalan
    expect(r.observedMonths).toBe(3);
    expect(r.months[0]).toMatchObject({ n: 1, positive: 0 });
  });
});

describe("rekonsiliasi kuota", () => {
  it("sisa efektif = minimum budget lokal dan header penyedia", () => {
    expect(effectiveRemaining({ used: 100, providerRemaining: null }, 990)).toBe(890);
    expect(effectiveRemaining({ used: 100, providerRemaining: 40 }, 990)).toBe(40);
    expect(effectiveRemaining(null, 990)).toBe(990);
    expect(effectiveRemaining({ used: 1087, providerRemaining: null }, 1000)).toBe(0);
  });
});

const items = (name: string, reportType: "INCOME_STATEMENT" | "BALANCE_SHEET", period: "quarterly" | "annually", code: string) =>
  parseReportItems(arjumFinancialStatementsResponseSchema.parse(fixture(name)), { code, reportType, period }).items;

describe("laporan keuangan — respons nyata 6 Okt (bank & nonbank)", () => {
  it("BBCA: Σ Q1–Q4 2025 = tahunan → kuartal mandiri; 'FY' tahunan menjadi Q4", () => {
    const q = items("financial-statements-BBCA-IS-quarterly-8.json", "INCOME_STATEMENT", "quarterly", "BBCA");
    const a = items("financial-statements-BBCA-IS-annually.json", "INCOME_STATEMENT", "annually", "BBCA");
    expect(a.map((i) => `${i.fiscalYear}Q${i.fiscalQuarter}`)).toEqual(["2025Q4", "2024Q4", "2023Q4"]);
    const basis = detectQuarterBasis(
      q.map((i) => ({ fiscalYear: i.fiscalYear, fiscalQuarter: i.fiscalQuarter, value: valueAt(i.data, "laba_rugi") })),
      a.map((i) => ({ fiscalYear: i.fiscalYear, value: valueAt(i.data, "laba_rugi") })),
    );
    expect(basis.basis).toBe("standalone");
    expect(basis.checks.find((c) => c.year === 2025)).toMatchObject({ sumQuarters: 57563093000000, annual: 57563093000000 });
  });

  it("neraca bank & nonbank: total aset, liabilitas, ekuitas, ekuitas induk dari path berbeda", () => {
    const bank = normalizeFacts(items("financial-statements-BBCA-BS-quarterly.json", "BALANCE_SHEET", "quarterly", "BBCA"), "standalone");
    const get = (facts: typeof bank, c: string) => facts.find((f) => f.concept === c && f.fiscalYear === 2026 && f.fiscalQuarter === 2);
    expect(get(bank, "total_assets")).toMatchObject({ value: 1660579336000000, periodBasis: "instant", periodType: "instant" });
    expect(get(bank, "total_liabilities")!.value).toBe(1379511881000000);
    expect(get(bank, "equity_parent")!.value).toBe(270437543000000);
    const tlkm = normalizeFacts(items("financial-statements-TLKM-BS-quarterly.json", "BALANCE_SHEET", "quarterly", "TLKM"), "unverified");
    expect(get(tlkm, "total_equity")).toMatchObject({ value: 134848000000000, periodBasis: "instant" });
    expect(get(tlkm, "total_liabilities")!.value).toBe(168239000000000);
  });

  it("TLKM: Q4 2025 tidak terbit, tidak ada tahun lengkap di 8 kuartal → basis belum terverifikasi, Q4 tidak diturunkan; EPS 0 = tidak dilaporkan", () => {
    const q = items("financial-statements-TLKM-IS-quarterly.json", "INCOME_STATEMENT", "quarterly", "TLKM");
    const a = items("financial-statements-TLKM-IS-annually.json", "INCOME_STATEMENT", "annually", "TLKM");
    expect(q.some((i) => i.fiscalYear === 2025 && i.fiscalQuarter === 4)).toBe(false);
    const basis = detectQuarterBasis(
      q.map((i) => ({ fiscalYear: i.fiscalYear, fiscalQuarter: i.fiscalQuarter, value: valueAt(i.data, "laba_rugi") })),
      a.map((i) => ({ fiscalYear: i.fiscalYear, value: valueAt(i.data, "laba_rugi") })),
    );
    expect(basis.basis).toBe("unverified");
    const facts = normalizeFacts([...q, ...a], basis.basis);
    expect(facts.some((f) => f.validation === "derived_from_annual")).toBe(false);
    expect(facts.find((f) => f.concept === "revenue" && f.fiscalYear === 2026 && f.fiscalQuarter === 2)!.value).toBe(38689000000000);
    expect(facts.find((f) => f.concept === "eps_basic" && f.fiscalYear === 2026 && f.fiscalQuarter === 2)).toMatchObject({ value: null, validation: "zero_as_missing" });
    // EPS bertanda berlawanan dengan laba / salah skala → tidak konsisten, dikosongkan.
    expect(facts.find((f) => f.concept === "eps_basic" && f.fiscalYear === 2025 && f.fiscalQuarter === 2)).toMatchObject({ value: null, validation: "eps_inconsistent" });
    expect(facts.find((f) => f.concept === "eps_basic" && f.fiscalYear === 2026 && f.fiscalQuarter === 1)).toMatchObject({ value: null, validation: "eps_inconsistent" });
    expect(facts.find((f) => f.concept === "eps_basic" && f.fiscalYear === 2025 && f.fiscalQuarter === 1)!.value).toBe(58.65);
  });

  it("Q4 diturunkan dari tahunan hanya bila basis mandiri terverifikasi", () => {
    const mk = (q: number, v: number, period: "quarterly" | "annually" = "quarterly"): ProviderReportItem => ({
      reportType: "INCOME_STATEMENT", period, fiscalYear: 2025, fiscalQuarter: q, label: null, providerFetchedAt: null, data: { laba_rugi: v }, dataHash: String(v),
    });
    const facts = normalizeFacts([mk(1, 10), mk(2, 11), mk(3, 12), mk(4, 50, "annually")], "standalone");
    expect(facts.find((f) => f.concept === "net_income_total" && f.fiscalQuarter === 4 && f.periodBasis === "quarter")).toMatchObject({ value: 17, validation: "derived_from_annual" });
  });
});

describe("insider — angka berformat, dedup kunci komposit", () => {
  const body = fixture("insiders-BBCA-p1.json");
  it("respons nyata: pagination & satuan lembar/persen", () => {
    const r = normalizeInsiders(body, "BBCA");
    expect(r).toMatchObject({ page: 1, totalPages: 9, total: 85 });
    expect(r.rows).toHaveLength(10);
    expect(r.rows[0]).toMatchObject({ holderName: "TONNY KUSNADI", txDate: "2026-03-25", actionType: "buy", previousShares: 7502058, currentShares: 7819950, changeShares: 317892, previousPct: 0.0061, price: 6982, brokerCode: null, badges: ["KOMISARIS"] });
    expect(r.issues).toEqual([]);
  });
  it("baris identik di halaman bergeser = satu kunci; kepemilikan berbeda = kunci berbeda", () => {
    const base = { holderName: "A", txDate: "2026-01-01", actionType: "buy", previousShares: 1, currentShares: 2 };
    expect(insiderDedupKey(base)).toBe(insiderDedupKey({ ...base, holderName: " a " }));
    expect(insiderDedupKey(base)).not.toBe(insiderDedupKey({ ...base, currentShares: 3 }));
    const dup = normalizeInsiders({ ...body, items: [body.items[0], body.items[0]] }, "BBCA");
    expect(dup.rows).toHaveLength(1);
  });
  it("angka tidak berformat → null, bukan 0; kode lain ditolak", () => {
    expect(parseFormatted("+317,892")).toBe(317892);
    expect(parseFormatted("-1,000")).toBe(-1000);
    expect(parseFormatted("")).toBeNull();
    expect(parseFormatted("n/a")).toBeNull();
    expect(normalizeInsiders({ ...body, stock_code: "BBRI" }, "BBCA").rows).toEqual([]);
  });
});

describe("olahan penyedia — akumulasi & seasonal", () => {
  it("akumulasi nyata: kumulatif = penjumlahan berjalan nval, baseline 0", () => {
    const { payload } = normalizeAccumulation(fixture("broker-accumulation-BBCA.json"), "BBCA", 5);
    expect(payload).toMatchObject({ startDate: "2026-09-01", endDate: "2026-10-02", checks: { cumulativeConsistent: true, baselineZero: true } });
    expect(payload!.series).toHaveLength(10);
  });
  it("kumulatif yang tidak konsisten ditandai", () => {
    const body = fixture("broker-accumulation-BBCA.json");
    body.series[0].points[1].cum_nval += 1_000_000;
    expect(normalizeAccumulation(body, "BBCA", 5).payload!.checks.cumulativeConsistent).toBe(false);
  });
  it("seasonal penyedia: persen per bulan/tahun, up_prob dibuang", () => {
    const { payload } = normalizeSeasonal(fixture("seasonal-BBCA.json"), "BBCA");
    expect(payload!.years).toHaveLength(7);
    expect(payload!.monthly["1"]!["2020"]).toBe(-3.14);
    expect(payload!.counts["1"]).toEqual({ up: 2, down: 5, total: 7 });
    expect(JSON.stringify(payload)).not.toContain("up_prob");
  });
});
