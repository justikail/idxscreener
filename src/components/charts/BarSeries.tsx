"use client";

import { useId, useRef, useState } from "react";

import { formatCompact, formatCompactIdr } from "@/lib/format";

const FORMATS = {
  idr: (v: number) => formatCompactIdr(v),
  lembar: (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatCompact(Math.abs(v), 1)} lembar`,
} as const;
export type BarFormat = keyof typeof FORMATS;

export type BarDatum = {
  key: string;
  /** Label sumbu (pendek), mis. "5 Okt" atau "Q2 '26". */
  label: string;
  value: number | null;
  /** Baris tooltip tambahan, sudah diformat. */
  detail?: string[];
  /** Diberi arsir: nilai tidak terverifikasi / turunan. */
  muted?: boolean;
};

/**
 * Batang vertikal dengan garis nol (positif ke atas, negatif ke bawah).
 * - Hover / sentuh / panah kiri-kanan menampilkan tooltip.
 * - Arah dikodekan lewat posisi terhadap garis nol DAN warna.
 * - Tombol "Tabel" menampilkan angka yang sama dalam tabel (aksesibilitas).
 */
export function BarSeries({
  data,
  format: formatKey,
  title,
  height = 180,
  unitNote,
}: {
  data: BarDatum[];
  format: BarFormat;
  title: string;
  height?: number;
  unitNote?: string;
}) {
  const format = FORMATS[formatKey];
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const tableId = useId();

  const values = data.map((d) => d.value).filter((v): v is number => v !== null);
  const maxPos = Math.max(0, ...values);
  const maxNeg = Math.max(0, ...values.map((v) => -v));
  const span = maxPos + maxNeg || 1;
  const zeroY = (maxPos / span) * 100; // % dari atas
  const n = data.length;

  const pick = (clientX: number) => {
    const el = wrap.current;
    if (!el || n === 0) return;
    const r = el.getBoundingClientRect();
    const i = Math.floor(((clientX - r.left) / r.width) * n);
    setActive(Math.min(Math.max(i, 0), n - 1));
  };

  const cur = active !== null ? data[active] : null;
  const labelEvery = Math.max(1, Math.ceil(n / 7));

  return (
    <figure className="w-full">
      <div className="mb-2 flex items-center justify-between gap-3">
        <figcaption className="text-sm font-medium text-ink-700">
          {title}
          {data.at(-1)?.value != null && (
            <span className="ml-2 font-normal text-ink-500">
              · terakhir <span className="num font-semibold text-ink-900">{format(data.at(-1)!.value!)}</span>
            </span>
          )}
        </figcaption>
        <button
          type="button"
          aria-expanded={table}
          aria-controls={tableId}
          onClick={() => setTable((t) => !t)}
          className="rounded-full border border-ink-300 px-3 py-1 text-xs font-medium text-ink-700 hover:border-ink-900 hover:text-ink-900"
        >
          {table ? "Lihat grafik" : "Lihat tabel"}
        </button>
      </div>

      {!table && (
        <div
          ref={wrap}
          tabIndex={0}
          role="img"
          aria-label={`${title}. Gunakan panah kiri/kanan untuk membaca tiap batang.`}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setActive((a) => Math.min((a ?? -1) + 1, n - 1));
            else if (e.key === "ArrowLeft") setActive((a) => Math.max((a ?? n) - 1, 0));
            else if (e.key === "Escape") setActive(null);
            else return;
            e.preventDefault();
          }}
          className="relative touch-pan-y select-none rounded-md outline-offset-4"
          style={{ height }}
        >
          {/* garis nol */}
          <div className="absolute inset-x-0 border-t border-ink-500" style={{ top: `${zeroY}%` }} aria-hidden />
          <div className="absolute inset-0 flex gap-[2px]" aria-hidden>
            {data.map((d, i) => {
              const v = d.value;
              const h = v === null ? 0 : (Math.abs(v) / span) * 100;
              const pos = v !== null && v >= 0;
              const isActive = active === i;
              return (
                <div key={d.key} className={`relative flex-1 ${isActive ? "bg-ink-900/[0.06]" : ""}`}>
                  {v === null ? (
                    <span className="absolute inset-x-[30%] h-[3px] rounded-full bg-ink-200" style={{ top: `calc(${zeroY}% - 1.5px)` }} />
                  ) : (
                    <span
                      className={`absolute inset-x-[12%] ${pos ? "rounded-t-[4px]" : "rounded-b-[4px]"} ${
                        pos ? "bg-up-500" : "bg-down-500"
                      } ${d.muted ? "opacity-45" : ""} ${active !== null && !isActive ? "opacity-60" : ""}`}
                      style={pos ? { bottom: `${100 - zeroY}%`, height: `max(${h}%, 2px)` } : { top: `${zeroY}%`, height: `max(${h}%, 2px)` }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {cur && active !== null && (
            <div
              className="pointer-events-none absolute z-10 w-max max-w-[15rem] rounded-md bg-ink-900 px-3 py-2 text-xs leading-relaxed text-paper shadow-lg"
              style={{ left: `clamp(7rem, ${((active + 0.5) / n) * 100}%, calc(100% - 7rem))`, top: -8, transform: "translate(-50%, -100%)" }}
            >
              <p className="font-semibold">{cur.label}</p>
              <p className="num text-sm">{cur.value === null ? "Tidak ada data" : format(cur.value)}</p>
              {cur.detail?.map((line) => (
                <p key={line} className="text-ink-300">
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {!table && (
        <div className="mt-2 flex gap-[2px] text-[11px] text-ink-500" aria-hidden>
          {data.map((d, i) => (
            <span key={d.key} className="num flex-1 truncate text-center">
              {i % labelEvery === 0 || i === n - 1 ? d.label : ""}
            </span>
          ))}
        </div>
      )}

      <div id={tableId} hidden={!table} className="max-h-80 overflow-auto rounded-md border border-ink-200">
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="sticky top-0 bg-card">
            <tr className="text-left text-ink-600">
              <th className="px-3 py-2 font-medium">Periode</th>
              <th className="px-3 py-2 text-right font-medium">Nilai</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">Rincian</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.key} className="border-t border-ink-100">
                <td className="px-3 py-1.5">{d.label}</td>
                <td className={`num px-3 py-1.5 text-right ${d.value === null ? "text-ink-400" : d.value >= 0 ? "text-up-700" : "text-down-600"}`}>
                  {d.value === null ? "—" : format(d.value)}
                </td>
                <td className="hidden px-3 py-1.5 text-xs text-ink-600 sm:table-cell">{d.detail?.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unitNote && <p className="mt-2 text-xs text-ink-500">{unitNote}</p>}
    </figure>
  );
}
