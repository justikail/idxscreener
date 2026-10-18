import { describe, expect, it } from "vitest";

import { squarify } from "@/lib/treemap";

const area = (t: { w: number; h: number }) => t.w * t.h;

describe("squarify", () => {
  it("luas setiap kotak sebanding dengan bobotnya dan totalnya memenuhi wadah", () => {
    const tiles = squarify([6, 6, 4, 3, 2, 2, 1].map((w, i) => ({ weight: w, item: i })), 1.6);
    const total = tiles.reduce((s, t) => s + area(t), 0);
    expect(total).toBeCloseTo(100 * 100, 6);
    for (const t of tiles) {
      const weight = [6, 6, 4, 3, 2, 2, 1][t.item]!;
      expect(area(t) / (100 * 100)).toBeCloseTo(weight / 24, 6);
    }
  });

  it("tidak ada kotak keluar wadah atau saling tumpang tindih", () => {
    const tiles = squarify(Array.from({ length: 50 }, (_, i) => ({ weight: 50 - i + (i % 7), item: i })), 2);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9);
      expect(t.y).toBeGreaterThanOrEqual(-1e-9);
      expect(t.x + t.w).toBeLessThanOrEqual(100 + 1e-9);
      expect(t.y + t.h).toBeLessThanOrEqual(100 + 1e-9);
    }
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i]!;
        const b = tiles[j]!;
        const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(overlapW > 1e-6 && overlapH > 1e-6).toBe(false);
      }
    }
  });

  it("bobot nol/negatif/NaN dibuang, bukan dijadikan kotak kosong", () => {
    const tiles = squarify(
      [
        { weight: 5, item: "a" },
        { weight: 0, item: "b" },
        { weight: -3, item: "c" },
        { weight: Number.NaN, item: "d" },
      ],
      1,
    );
    expect(tiles.map((t) => t.item)).toEqual(["a"]);
  });

  it("input kosong menghasilkan daftar kosong", () => {
    expect(squarify([], 1)).toEqual([]);
  });
});
