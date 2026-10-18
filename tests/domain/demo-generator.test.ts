import { describe, expect, it } from "vitest";

import {
  DEMO_INSTRUMENTS,
  generateAnnouncements,
  generateDailyBars,
  generateFinancialFacts,
} from "@/server/providers/demo/generate";
import { rsi, relativeVolume } from "@/domain/indicators";
import { per, roe, ttmFromQuarters } from "@/domain/fundamentals";

// Memverifikasi bahwa provider DEMO deterministik (seed tetap -> hasil identik)
// dan bahwa kandidat "guaranteed_*" benar-benar lolos/gagal preset screener
// tanpa bergantung pada realisasi random walk populasi umum.

describe("determinisme generator demo", () => {
  it("generateDailyBars menghasilkan output identik pada dua pemanggilan berurutan", () => {
    const instrument = DEMO_INSTRUMENTS.find((i) => i.code === "DEMA")!;
    const first = generateDailyBars(instrument);
    const second = generateDailyBars(instrument);
    expect(second).toEqual(first);
  });

  it("generateFinancialFacts menghasilkan output identik pada dua pemanggilan berurutan", () => {
    const instrument = DEMO_INSTRUMENTS.find((i) => i.code === "BAJA")!;
    const first = generateFinancialFacts(instrument);
    const second = generateFinancialFacts(instrument);
    expect(second).toEqual(first);
  });

  it("generateAnnouncements menghasilkan output identik pada dua pemanggilan berurutan", () => {
    const instrument = DEMO_INSTRUMENTS.find((i) => i.code === "KONS")!;
    const first = generateAnnouncements(instrument);
    const second = generateAnnouncements(instrument);
    expect(second).toEqual(first);
  });

  it("seluruh 24 instrumen demo unik kodenya dan jumlahnya >= 20 (syarat M1)", () => {
    const codes = new Set(DEMO_INSTRUMENTS.map((i) => i.code));
    expect(codes.size).toBe(DEMO_INSTRUMENTS.length);
    expect(DEMO_INSTRUMENTS.length).toBeGreaterThanOrEqual(20);
  });
});

describe("kandidat preset yang dijamin (tidak bergantung random)", () => {
  it("VPAS (guaranteed_value_pass): PER<=15 dan ROE>=10% terpenuhi dengan data tersedia", () => {
    const instrument = DEMO_INSTRUMENTS.find((i) => i.code === "VPAS")!;
    const facts = generateFinancialFacts(instrument);
    const bars = generateDailyBars(instrument);
    const price = bars[bars.length - 1]!.close;

    const netIncomeQuarters = lastFourByConcept(facts, "net_income");
    const netIncomeTtm = ttmFromQuarters(netIncomeQuarters);
    const equity = latestValue(facts, "total_equity");
    const shares = latestValue(facts, "weighted_avg_shares");

    expect(netIncomeTtm).not.toBeNull();
    const epsTtm = netIncomeTtm! / shares!;
    const perResult = per(price, epsTtm);
    const roeResult = roe(netIncomeTtm, equity);

    expect(perResult.status).toBe("ok");
    expect(perResult.value).toBeLessThanOrEqual(15);
    expect(roeResult.status).toBe("ok");
    expect(roeResult.value).toBeGreaterThanOrEqual(0.1);
  });

  it("VFAI (guaranteed_value_fail): PER>15 dan ROE<10%, BUKAN unknown (data tersedia tapi gagal ambang)", () => {
    const instrument = DEMO_INSTRUMENTS.find((i) => i.code === "VFAI")!;
    const facts = generateFinancialFacts(instrument);
    const bars = generateDailyBars(instrument);
    const price = bars[bars.length - 1]!.close;

    const netIncomeQuarters = lastFourByConcept(facts, "net_income");
    const netIncomeTtm = ttmFromQuarters(netIncomeQuarters);
    const equity = latestValue(facts, "total_equity");
    const shares = latestValue(facts, "weighted_avg_shares");
    const epsTtm = netIncomeTtm! / shares!;

    const perResult = per(price, epsTtm);
    const roeResult = roe(netIncomeTtm, equity);

    expect(perResult.status).toBe("ok");
    expect(perResult.value).toBeGreaterThan(15);
    expect(roeResult.status).toBe("ok");
    expect(roeResult.value).toBeLessThan(0.1);
  });

  it("MPAS (guaranteed_momentum_pass): RSI14 tinggi dan volume relatif >= 1.2 pada sesi terakhir", () => {
    const instrument = DEMO_INSTRUMENTS.find((i) => i.code === "MPAS")!;
    const bars = generateDailyBars(instrument);
    const closes = bars.map((b) => b.close);
    const volumes = bars.map((b) => Number(b.volume));
    const lastIndex = bars.length - 1;

    const rsiValue = rsi(closes, 14)[lastIndex];
    const relVol = relativeVolume(volumes, lastIndex, 20);

    expect(rsiValue).not.toBeNull();
    expect(rsiValue!).toBeGreaterThanOrEqual(55);
    expect(relVol).not.toBeNull();
    expect(relVol!).toBeGreaterThanOrEqual(1.2);
  });

  it("MFAI (guaranteed_momentum_fail): harga datar -> RSI14 = 50 (netral, di bawah ambang 55)", () => {
    const instrument = DEMO_INSTRUMENTS.find((i) => i.code === "MFAI")!;
    const bars = generateDailyBars(instrument);
    const closes = bars.map((b) => b.close);
    const lastIndex = bars.length - 1;

    const rsiValue = rsi(closes, 14)[lastIndex];
    expect(rsiValue).toBe(50);
    expect(rsiValue!).toBeLessThan(55);
  });
});

function lastFourByConcept(
  facts: ReturnType<typeof generateFinancialFacts>,
  concept: string,
): Array<{ fiscalYear: number; fiscalQuarter: number; value: number | null }> {
  const filtered = facts
    .filter((f) => f.concept === concept)
    .sort((a, b) => (a.fiscalYear !== b.fiscalYear ? a.fiscalYear - b.fiscalYear : a.fiscalQuarter - b.fiscalQuarter));
  return filtered.slice(-4).map((f) => ({ fiscalYear: f.fiscalYear, fiscalQuarter: f.fiscalQuarter, value: f.value }));
}

function latestValue(facts: ReturnType<typeof generateFinancialFacts>, concept: string): number | null {
  const filtered = facts
    .filter((f) => f.concept === concept)
    .sort((a, b) => (a.fiscalYear !== b.fiscalYear ? a.fiscalYear - b.fiscalYear : a.fiscalQuarter - b.fiscalQuarter));
  return filtered.length > 0 ? filtered[filtered.length - 1]!.value : null;
}
