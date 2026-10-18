import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccumulationSection } from "@/features/market-data/accumulation-section";
import { BrokerSection, preferredRanges } from "@/features/market-data/broker-section";
import { FinancialsSection } from "@/features/market-data/financials-section";
import { InsidersSection, insiderSummary } from "@/features/market-data/insiders-section";
import { QuoteAndCap } from "@/features/market-data/quote-cap";
import { normalizeAccumulation } from "@/server/ingestion/arjum-derived";

const text = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");
const fixture = (name: string) => JSON.parse(readFileSync(`fixtures/arjum/${name}`, "utf8"));
const NOW = new Date("2026-10-05T17:01:19Z");

describe("UI data pasar: kosong, parsial, real, tidak konsisten", () => {
  it("laporan keuangan kosong → pesan belum diambil, tanpa angka", () => {
    expect(text(createElement(FinancialsSection, { id: "keuangan", facts: [], reports: [] }))).toContain("belum diambil");
  });

  it("laporan keuangan: nilai kosong tampil '—', basis belum terverifikasi diberi keterangan", () => {
    const fact = (concept: string, value: string | null, basis = "quarter_unverified") => ({
      fiscal_year: 2026, fiscal_quarter: 2, period_basis: basis, concept, value, validation: value === null ? "eps_inconsistent" : "ok",
      provider_fetched_at: null, fetched_at: "2026-10-05 22:01:00+00", source: "arjum",
    });
    const out = text(createElement(FinancialsSection, { id: "keuangan", facts: [fact("net_income", "6279000000000"), fact("eps_basic", null)], reports: [] }));
    expect(out).toContain("Q2 2026");
    expect(out).toContain("—");
    expect(out).toContain("belum terbukti berdiri sendiri");
    expect(out).not.toMatch(/EPS[^—]*\b0\b/);
  });

  it("broker: tanpa rentang tersimpan → belum tersedia; parsial → label sebagian, bukan 'seluruh broker'", () => {
    expect(text(createElement(BrokerSection, { id: "broker", path: "/saham/X", ranges: [], selected: null, rows: [], baseParams: {} }))).toContain("belum tersedia");
    const partial = { id: 1, startDate: "2026-10-05", endDate: "2026-10-05", brokerCount: 20, coverage: "partial", coverageNote: "20 broker teratas.", meta: { volumeUnit: "shares" }, fetchedAt: NOW };
    const rows = [{ brokerCode: "AK", brokerName: null, buyValue: "1", sellValue: "0", netValue: "100", buyVolume: "1", sellVolume: "0", netVolume: "10" }];
    const out = text(createElement(BrokerSection, { id: "broker", path: "/saham/X", ranges: [partial], selected: partial, rows, baseParams: {} }));
    expect(out).toContain("Sebagian");
    expect(out).toContain("Hanya broker teratas");
    expect(out).toContain("Total pasar tidak dihitung");
    expect(out).not.toMatch(/Lengkap\s*·\s*\d+ broker/);
  });

  it("broker: rentang sama → snapshot lengkap diutamakan, tidak ditampilkan dobel", () => {
    const base = { startDate: "2026-10-05", endDate: "2026-10-05", fetchedAt: NOW };
    const picked = preferredRanges([{ ...base, id: 1, coverage: "partial" }, { ...base, id: 2, coverage: "complete" }, { ...base, id: 3, startDate: "2026-09-28", coverage: "partial" }]);
    expect(picked.map((r) => r.id)).toEqual([2, 3]);
  });

  it("akumulasi: data real tampil; kumulatif tidak konsisten → tidak digambar", () => {
    const ok = normalizeAccumulation(fixture("broker-accumulation-BBCA.json"), "BBCA", 5).payload!;
    expect(text(createElement(AccumulationSection, { payload: ok, fetchedAt: NOW }))).toContain("YU");
    const bad = { ...ok, checks: { ...ok.checks, cumulativeConsistent: false } };
    expect(text(createElement(AccumulationSection, { payload: bad, fetchedAt: NOW }))).toContain("tidak kami gambar");
    expect(text(createElement(AccumulationSection, { payload: null, fetchedAt: null }))).toContain("belum diambil");
  });

  it("insider: kosong vs berisi; perubahan negatif & nilai kosong tidak jadi 0", () => {
    expect(text(createElement(InsidersSection, { id: "insider", rows: [], summary: insiderSummary([]), fetchedNote: null }))).toContain("Belum ada laporan");
    const row = { id: 1, holderName: "A", txDate: "2026-03-25", actionType: "sell", badges: ["DIREKTUR"], previousShares: "1000", previousPct: null, currentShares: "400", currentPct: null, changeShares: "-600", price: null };
    const out = text(createElement(InsidersSection, { id: "insider", rows: [row], summary: insiderSummary([row]), fetchedNote: "Riwayat lama masih diambil bertahap." }));
    expect(out).toContain("Jual");
    expect(out).toContain("menurut sumber");
    expect(out).toContain("−600");
    expect(out).toContain("masih diambil bertahap");
  });

  it("harga: fallback penutupan tidak dilabeli transaksi hari ini / realtime", () => {
    const quote = { lastPrice: "6175", sourceDate: "2026-10-05", dataTs: null, marketLabel: "Market belum buka", noTradeToday: true, isFallbackClose: true, quoteAgeMs: null, fetchedAt: NOW };
    const out = text(createElement(QuoteAndCap, { quote, cap: null }));
    expect(out).toContain("belum ada transaksi hari ini");
    expect(out.toLowerCase()).not.toContain("realtime");
    expect(renderToStaticMarkup(createElement(QuoteAndCap, { quote: null, cap: null }))).toBe("");
  });
});
