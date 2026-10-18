import { describe, expect, it } from "vitest";

import { ema, macd, relativeVolume, rsi, sma } from "@/domain/indicators";

describe("sma", () => {
  it("mengembalikan null sebelum history cukup", () => {
    const result = sma([1, 2, 3], 5);
    expect(result).toEqual([null, null, null]);
  });

  it("menghitung rata-rata bergerak sederhana dengan benar", () => {
    const result = sma([1, 2, 3, 4, 5], 3);
    expect(result[2]).toBeCloseTo(2);
    expect(result[3]).toBeCloseTo(3);
    expect(result[4]).toBeCloseTo(4);
  });
});

describe("ema", () => {
  it("seed EMA memakai SMA dari period pertama", () => {
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const result = ema(closes, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo((10 + 11 + 12) / 3);
  });

  it("harga datar menghasilkan EMA sama dengan harga", () => {
    const closes = new Array(10).fill(100);
    const result = ema(closes, 5);
    expect(result[9]).toBeCloseTo(100);
  });
});

describe("rsi", () => {
  it("null sebelum seed period tersedia", () => {
    const closes = [1, 2, 3, 4, 5];
    const result = rsi(closes, 14);
    expect(result.every((v) => v === null)).toBe(true);
  });

  it("kenaikan terus-menerus menghasilkan RSI 100", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = rsi(closes, 14);
    expect(result[14]).toBeCloseTo(100);
  });

  it("harga datar menghasilkan RSI netral 50 (edge case)", () => {
    const closes = new Array(20).fill(100);
    const result = rsi(closes, 14);
    expect(result[14]).toBe(50);
  });
});

describe("macd", () => {
  it("null sebelum EMA lambat tersedia", () => {
    const closes = Array.from({ length: 10 }, (_, i) => 100 + i);
    const result = macd(closes, 3, 6, 3);
    expect(result.macd[4]).toBeNull();
  });

  it("menghasilkan nilai setelah history cukup", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const result = macd(closes);
    expect(result.macd[39]).not.toBeNull();
    expect(result.signal[39]).not.toBeNull();
    expect(result.histogram[39]).not.toBeNull();
  });
});

describe("relativeVolume", () => {
  it("null bila history kurang dari lookback", () => {
    const volumes = [100, 200, 300];
    expect(relativeVolume(volumes, 2, 20)).toBeNull();
  });

  it("menghitung rasio terhadap rata-rata lookback", () => {
    const volumes = new Array(20).fill(1000).concat([2000]);
    expect(relativeVolume(volumes, 20, 20)).toBeCloseTo(2);
  });
});
