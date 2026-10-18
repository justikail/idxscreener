import { describe, expect, it } from "vitest";

import {
  der,
  discreteQuarterFromYtd,
  npm,
  per,
  pbv,
  roa,
  roe,
  ttmFromQuarters,
} from "@/domain/fundamentals";

describe("per", () => {
  it("null bila salah satu input null", () => {
    expect(per(null, 100)).toEqual({ value: null, status: "null_missing" });
    expect(per(1000, null)).toEqual({ value: null, status: "null_missing" });
  });

  it("not_applicable bila EPS <= 0", () => {
    expect(per(1000, 0)).toEqual({ value: null, status: "not_applicable" });
    expect(per(1000, -50)).toEqual({ value: null, status: "not_applicable" });
  });

  it("menghitung PER dengan benar", () => {
    expect(per(1000, 100)).toEqual({ value: 10, status: "ok" });
  });
});

describe("pbv", () => {
  it("not_applicable bila ekuitas per lembar <= 0", () => {
    expect(pbv(1000, 0)).toEqual({ value: null, status: "not_applicable" });
    expect(pbv(1000, -10)).toEqual({ value: null, status: "not_applicable" });
  });
});

describe("roe/roa/npm", () => {
  it("null vs zero berbeda: null input -> null_missing, bukan 0", () => {
    expect(roe(null, 1000)).toEqual({ value: null, status: "null_missing" });
    expect(roa(500, null)).toEqual({ value: null, status: "null_missing" });
    expect(npm(null, null)).toEqual({ value: null, status: "null_missing" });
  });

  it("pembagi 0 -> not_applicable, bukan Infinity", () => {
    expect(roe(100, 0)).toEqual({ value: null, status: "not_applicable" });
    expect(npm(100, 0)).toEqual({ value: null, status: "not_applicable" });
  });

  it("menghitung rasio bila valid", () => {
    expect(roe(100, 1000)).toEqual({ value: 0.1, status: "ok" });
  });
});

describe("der", () => {
  it("not_applicable bila ekuitas <= 0 (mis. ekuitas negatif)", () => {
    expect(der(500, -100)).toEqual({ value: null, status: "not_applicable" });
  });

  it("menghitung DER normal", () => {
    expect(der(500, 250)).toEqual({ value: 2, status: "ok" });
  });
});

describe("ttmFromQuarters", () => {
  it("null bila bukan 4 kuartal", () => {
    expect(ttmFromQuarters([{ fiscalYear: 2025, fiscalQuarter: 1, value: 10 }])).toBeNull();
  });

  it("null bila ada gap kuartal", () => {
    const quarters = [
      { fiscalYear: 2025, fiscalQuarter: 1, value: 10 },
      { fiscalYear: 2025, fiscalQuarter: 2, value: 10 },
      { fiscalYear: 2025, fiscalQuarter: 4, value: 10 }, // Q3 hilang
      { fiscalYear: 2026, fiscalQuarter: 1, value: 10 },
    ];
    expect(ttmFromQuarters(quarters)).toBeNull();
  });

  it("null bila ada nilai null di salah satu kuartal", () => {
    const quarters = [
      { fiscalYear: 2025, fiscalQuarter: 1, value: 10 },
      { fiscalYear: 2025, fiscalQuarter: 2, value: null },
      { fiscalYear: 2025, fiscalQuarter: 3, value: 10 },
      { fiscalYear: 2025, fiscalQuarter: 4, value: 10 },
    ];
    expect(ttmFromQuarters(quarters)).toBeNull();
  });

  it("menjumlahkan 4 kuartal berurutan yang valid, termasuk lintas tahun", () => {
    const quarters = [
      { fiscalYear: 2025, fiscalQuarter: 3, value: 10 },
      { fiscalYear: 2025, fiscalQuarter: 4, value: 20 },
      { fiscalYear: 2026, fiscalQuarter: 1, value: 30 },
      { fiscalYear: 2026, fiscalQuarter: 2, value: 40 },
    ];
    expect(ttmFromQuarters(quarters)).toBe(100);
  });
});

describe("discreteQuarterFromYtd", () => {
  it("Q1 sama dengan YTD", () => {
    expect(discreteQuarterFromYtd(50, null, 1)).toBe(50);
  });

  it("kuartal > 1 butuh YTD sebelumnya", () => {
    expect(discreteQuarterFromYtd(120, null, 2)).toBeNull();
    expect(discreteQuarterFromYtd(120, 50, 2)).toBe(70);
  });
});
