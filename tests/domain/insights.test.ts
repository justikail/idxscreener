import { describe, expect, it } from "vitest";

import { buildInsights, type InsightInput } from "@/features/market-data/insights";

const base: InsightInput = {
  close: 6175,
  sma20: 6288,
  sma50: 6365,
  yearLow: 4820,
  yearHigh: 8750,
  sessionsInYear: 250,
  per: { value: null, status: "null_missing" },
  pbv: { value: null, status: "null_missing" },
  roe: { value: 0.2182, status: "ok" },
  foreign: Array.from({ length: 5 }, (_, i) => ({ tradingDate: `2026-10-0${i + 1}`, volume: 100, net: -10 })),
  broker: { date: "2026-10-05", endDate: "2026-10-05", coverage: "complete", topBuyer: { code: "AK", name: null, value: 2e11 }, topSeller: { code: "DX", name: null, value: -8e10 } },
  insiders: [
    { txDate: "2026-03-25", actionType: "buy" },
    { txDate: "2026-03-25", actionType: "sell" },
    { txDate: "2026-01-02", actionType: "buy" },
  ],
  profit: { label: "Q2 2026", value: 14.85e12, yoyPct: -0.14, verified: true },
  volume: { last: 90, avg20: 128 },
};

describe("kartu Sekilas", () => {
  it("deskriptif, tidak pernah menyarankan beli/jual", () => {
    const text = buildInsights(base).map((i) => `${i.value} ${i.sentence}`).join(" ").toLowerCase();
    expect(text).not.toMatch(/sebaiknya|rekomendasi|layak (beli|jual)|saatnya|segera/);
  });

  it("isi kartu sesuai data: tren turun, asing net jual 10% volume, insider tanggal terbaru", () => {
    const byId = Object.fromEntries(buildInsights(base).map((i) => [i.id, i]));
    expect(byId.tren!.tone).toBe("down");
    expect(byId.tren!.sentence).toContain("di bawah rata-rata 20 dan 50 hari");
    expect(byId.asing!.sentence).toContain("menjual");
    expect(byId.asing!.sentence).toContain("10,0% dari volume");
    expect(byId.insider!.value).toContain("25 Mar 2026");
    expect(byId.insider!.sentence).toContain("1 beli, 1 jual");
    expect(byId.volume!.value).toContain("0,70×");
  });

  it("laba turun sedikit tetap netral (merah hanya untuk rugi)", () => {
    const laba = buildInsights(base).find((i) => i.id === "laba")!;
    expect(laba.tone).toBe("neutral");
    expect(laba.sentence).toContain("Turun");
    const rugi = buildInsights({ ...base, profit: { label: "Q1 2026", value: -1e9, yoyPct: null, verified: true } }).find((i) => i.id === "laba")!;
    expect(rugi.tone).toBe("down");
  });

  it("data kosong tidak disembunyikan: kartu tetap ada dengan alasan", () => {
    const empty = buildInsights({ ...base, close: null, sma20: null, sma50: null, foreign: [], broker: null, insiders: [], profit: null, volume: { last: null, avg20: null } });
    const byId = Object.fromEntries(empty.map((i) => [i.id, i]));
    expect(byId.tren!.tone).toBe("muted");
    expect(byId.asing!.sentence).toContain("belum lengkap");
    expect(byId.broker!.sentence).toContain("belum diambil");
    expect(byId.valuasi!.value).toBe("Belum tersedia");
  });

  it("PER tidak bermakna dijelaskan, bukan diberi angka", () => {
    const v = buildInsights({ ...base, per: { value: null, status: "not_applicable" } }).find((i) => i.id === "valuasi")!;
    expect(v.value).toBe("PER tidak bermakna");
  });
});
