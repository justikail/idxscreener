import { describe, expect, it } from "vitest";

import { evaluateFilter } from "@/domain/filter-ast";
import { describeRule, FIELD_META, STRATEGIES, strategyFilter } from "@/domain/strategies";
import { brokerTop3NetRatio, priceMetrics, ttmGrowth } from "@/domain/strategy-metrics";

const bar = (close: number, extra: Partial<{ high: number; low: number; value: number }> = {}) => ({ close, high: extra.high ?? close, low: extra.low ?? close, value: extra.value ?? 1e9 });

describe("metrik strategi (v3)", () => {
  it("return, perubahan harian, posisi penutupan, likuiditas", () => {
    const bars = [...Array.from({ length: 30 }, (_, i) => bar(100 + i)), bar(140, { high: 145, low: 135, value: 3e9 })];
    const m = priceMetrics(bars);
    expect(m.change1d).toBeCloseTo(140 / 129 - 1, 6);
    expect(m.return5d).toBeCloseTo(140 / 125 - 1, 6);
    expect(m.closePosition).toBeCloseTo(0.5, 6);
    expect(m.valueAvg20).toBeCloseTo((19 * 1e9 + 3e9) / 20, 0);
    expect(m.rangePosition52w).toBeNull(); // < 120 sesi
    expect(m.closeVsSma50).toBeNull(); // < 50 sesi
  });

  it("data kurang menghasilkan null, bukan 0", () => {
    const m = priceMetrics([bar(100), { close: 101, high: null, low: null, value: null }]);
    expect(m.return5d).toBeNull();
    expect(m.closePosition).toBeNull();
    expect(m.valueAvg20).toBeNull();
  });

  it("pertumbuhan TTM: butuh 8 kuartal berurutan; dari rugi = tidak bermakna", () => {
    const q = (y: number, k: number, v: number | null) => ({ fiscalYear: y, fiscalQuarter: k, value: v });
    const eight = [q(2024, 3, 10), q(2024, 4, 10), q(2025, 1, 10), q(2025, 2, 10), q(2025, 3, 12), q(2025, 4, 12), q(2026, 1, 12), q(2026, 2, 12)];
    expect(ttmGrowth(eight)).toEqual({ value: expect.closeTo(0.2, 6), status: "ok" });
    expect(ttmGrowth(eight.filter((x) => !(x.fiscalYear === 2025 && x.fiscalQuarter === 1)))).toMatchObject({ value: null, status: "null_missing" });
    expect(ttmGrowth(eight.map((x, i) => (i < 4 ? { ...x, value: -5 } : x)))).toMatchObject({ value: null, status: "not_applicable" });
  });

  it("konsentrasi broker: 3 pembeli bersih terbesar ÷ nilai transaksi", () => {
    expect(brokerTop3NetRatio([5e9, 3e9, 2e9, 1e9, -4e9, null], 100e9)).toBeCloseTo(0.1, 6);
    expect(brokerTop3NetRatio([-1e9], 10e9)).toBe(0);
    expect(brokerTop3NetRatio([1e9], 0)).toBeNull();
  });
});

describe("strategi Rekomendasi", () => {
  it("setiap aturan punya label & teks yang bisa dibaca pemula", () => {
    for (const s of STRATEGIES)
      for (const v of s.variants) {
        expect(v.rules.length).toBeGreaterThan(0);
        for (const r of v.rules) {
          expect(FIELD_META[r.field], `${s.slug}/${v.key}: ${r.field}`).toBeDefined();
          expect(describeRule(r)).not.toMatch(/undefined|NaN/);
        }
        for (const col of v.columns) expect(FIELD_META[col]).toBeDefined();
      }
    expect(describeRule({ type: "condition", field: "value_avg_20d", operator: "gte", value: 5e9 })).toBe("Rata-rata nilai transaksi 20 hari minimal Rp5,0 M");
  });

  it("BPJS: kandidat yang memenuhi lolos; data kosong = belum bisa diuji, bukan lolos", () => {
    const bpjs = STRATEGIES.find((s) => s.slug === "bpjs")!.variants[0]!;
    const good = { value_avg_20d: 8e9, price: 1500, change_1d: 0.05, close_position: 0.9, volume_relative_20d: 2.4, rsi14: 68 };
    expect(evaluateFilter(strategyFilter(bpjs), { instrumentId: "x", values: good }).passed).toBe(true);
    const ara = evaluateFilter(strategyFilter(bpjs), { instrumentId: "x", values: { ...good, change_1d: 0.25 } });
    expect(ara.passed).toBe(false);
    const missing = evaluateFilter(strategyFilter(bpjs), { instrumentId: "x", values: { ...good, close_position: null } });
    expect(missing).toMatchObject({ passed: false, missingFields: ["close_position"] });
  });
});
