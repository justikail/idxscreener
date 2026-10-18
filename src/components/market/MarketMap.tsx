import Link from "next/link";

import { changeColor } from "@/lib/color";
import { formatCompactIdr, formatPercent } from "@/lib/format";
import { squarify } from "@/lib/treemap";

interface MapItem {
  code: string;
  name: string;
  changePct: number | null;
  value: number | null;
}

interface Layout {
  aspect: number;
  /** Perkiraan lebar wadah dalam px, untuk memutuskan label mana yang muat. */
  approxWidthPx: number;
  className: string;
}

const LAYOUTS: Layout[] = [
  { aspect: 2.1, approxWidthPx: 1150, className: "hidden sm:block aspect-[2.1/1]" },
  { aspect: 0.78, approxWidthPx: 360, className: "block sm:hidden aspect-[0.78/1]" },
];

/**
 * Peta Pasar: luas kotak = nilai transaksi sesi terakhir (likuiditas, bukan
 * kapitalisasi), warna = perubahan harga. Saham tanpa nilai transaksi tidak
 * digambar (tidak dipalsukan menjadi kotak nol).
 */
export function MarketMap({ items }: { items: MapItem[] }) {
  const inputs = items.filter((i) => i.value !== null && i.value > 0).map((i) => ({ weight: i.value!, item: i }));
  const excluded = items.length - inputs.length;

  return (
    <div>
      {LAYOUTS.map((layout) => {
        const tiles = squarify(inputs, layout.aspect);
        const heightPx = layout.approxWidthPx / layout.aspect;
        return (
          <div key={layout.aspect} className={`relative w-full overflow-hidden rounded-sm bg-ink-900 ${layout.className}`}>
            {tiles.map((t) => {
              const { bg, fg } = changeColor(t.item.changePct);
              const wPx = (t.w / 100) * layout.approxWidthPx;
              const hPx = (t.h / 100) * heightPx;
              const showCode = wPx >= 34 && hPx >= 22;
              const showPct = wPx >= 52 && hPx >= 40;
              const big = wPx >= 150 && hPx >= 90;
              const label = `${t.item.code} · ${t.item.name} · ${t.item.changePct !== null ? formatPercent(t.item.changePct) : "tanpa perubahan"} · nilai ${formatCompactIdr(t.item.value!)}`;
              return (
                <Link
                  key={t.item.code}
                  href={`/saham/${t.item.code}`}
                  title={label}
                  aria-label={label}
                  className="group absolute flex flex-col items-center justify-center overflow-hidden border border-ink-900/70 p-1 text-center transition-[filter,box-shadow] hover:z-10 hover:shadow-[inset_0_0_0_2px_#e3a826] hover:brightness-110 focus-visible:z-10"
                  style={{
                    left: `${t.x}%`,
                    top: `${t.y}%`,
                    width: `${t.w}%`,
                    height: `${t.h}%`,
                    backgroundColor: bg,
                    color: fg,
                  }}
                >
                  {showCode && (
                    <span className={`num font-semibold leading-none tracking-wide ${big ? "text-2xl" : "text-[11px] sm:text-xs"}`}>
                      {t.item.code}
                    </span>
                  )}
                  {showPct && t.item.changePct !== null && (
                    <span className={`num mt-1 leading-none opacity-90 ${big ? "text-base" : "text-[10px] sm:text-[11px]"}`}>
                      {formatPercent(t.item.changePct)}
                    </span>
                  )}
                  {big && <span className="num mt-1 text-[11px] opacity-75">{formatCompactIdr(t.item.value!)}</span>}
                </Link>
              );
            })}
          </div>
        );
      })}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-500">
        <span>Luas kotak = nilai transaksi sesi terakhir · warna = perubahan harga harian.</span>
        <span className="flex items-center gap-2" aria-hidden>
          <span className="num">−4%</span>
          <span
            className="h-2 w-40 rounded-full"
            style={{ background: "linear-gradient(90deg,#a93220,#e4dccd 50%,#0c5636)" }}
          />
          <span className="num">+4%</span>
        </span>
        {excluded > 0 && <span>{excluded} saham tanpa transaksi tidak digambar.</span>}
      </div>
    </div>
  );
}
