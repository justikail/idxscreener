function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(r1, r2)}, ${c(g1, g2)}, ${c(b1, b2)})`;
}

const NEUTRAL = "#e4dccd";
const UP_DEEP = "#0c5636";
const DOWN_DEEP = "#a93220";

/**
 * Skala divergen untuk Peta Pasar: netral (kertas gelap) → hijau tua untuk
 * naik, → vermilion untuk turun. Jenuh pada ±`saturateAt` persen. Warna tidak
 * menjadi satu-satunya penanda — tile juga menampilkan angka bertanda.
 */
export function changeColor(changePct: number | null, saturateAt = 4): { bg: string; fg: string } {
  if (changePct === null || !Number.isFinite(changePct)) return { bg: "#d8cfbf", fg: "#433b30" };
  const t = Math.min(Math.abs(changePct) / saturateAt, 1);
  const eased = Math.sqrt(t); // perubahan kecil tetap terlihat
  const bg = changePct === 0 ? NEUTRAL : mix(NEUTRAL, changePct > 0 ? UP_DEEP : DOWN_DEEP, eased);
  return { bg, fg: eased > 0.45 ? "#faf7f1" : "#17140f" };
}
