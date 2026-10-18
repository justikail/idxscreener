export interface TreemapInput<T> {
  weight: number;
  item: T;
}

export interface TreemapTile<T> {
  item: T;
  /** Posisi dan ukuran dalam persen (0–100) terhadap wadah. */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function worstAspect(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  if (sum === 0 || side === 0) return Infinity;
  const max = Math.max(...row);
  const min = Math.min(...row);
  const s2 = side * side;
  const sum2 = sum * sum;
  return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
}

/**
 * Treemap "squarified" (Bruls, Huizing & van Wijk, 2000): kotak sedekat
 * mungkin dengan persegi agar label terbaca. Bobot <= 0 dibuang (tidak
 * ditampilkan sebagai kotak nol). `aspect` = lebar/tinggi wadah agar kotak
 * tampak persegi di layar, bukan hanya di ruang persen.
 */
export function squarify<T>(inputs: TreemapInput<T>[], aspect = 1): TreemapTile<T>[] {
  const items = inputs.filter((i) => Number.isFinite(i.weight) && i.weight > 0).sort((a, b) => b.weight - a.weight);
  if (items.length === 0) return [];

  // Hitung di ruang dengan rasio sebenarnya (W = aspect, H = 1), lalu skala ke persen.
  const W = aspect;
  const H = 1;
  const total = items.reduce((s, i) => s + i.weight, 0);
  const areas = items.map((i) => (i.weight / total) * W * H);

  const tiles: TreemapTile<T>[] = [];
  let rect: Rect = { x: 0, y: 0, w: W, h: H };
  let start = 0;

  while (start < items.length) {
    const side = Math.min(rect.w, rect.h);
    const row: number[] = [areas[start]!];
    let end = start + 1;
    while (end < items.length && worstAspect([...row, areas[end]!], side) <= worstAspect(row, side)) {
      row.push(areas[end]!);
      end += 1;
    }

    const rowSum = row.reduce((a, b) => a + b, 0);
    const horizontal = rect.w >= rect.h; // baris disusun sepanjang sisi pendek
    const thickness = rowSum / side;
    let offset = 0;

    for (let k = 0; k < row.length; k++) {
      const len = row[k]! / thickness;
      const t = horizontal
        ? { x: rect.x, y: rect.y + offset, w: thickness, h: len }
        : { x: rect.x + offset, y: rect.y, w: len, h: thickness };
      tiles.push({
        item: items[start + k]!.item,
        x: (t.x / W) * 100,
        y: (t.y / H) * 100,
        w: (t.w / W) * 100,
        h: (t.h / H) * 100,
      });
      offset += len;
    }

    rect = horizontal
      ? { x: rect.x + thickness, y: rect.y, w: rect.w - thickness, h: rect.h }
      : { x: rect.x, y: rect.y + thickness, w: rect.w, h: rect.h - thickness };
    start = end;
  }

  return tiles;
}
