"use client";

import { useState } from "react";

import { formatCompactIdr } from "@/lib/format";

const W = 200;
const H = 64;

export type AccSeries = { brokerCode: string; brokerName: string | null; points: number[]; last: number };

/**
 * Grafik kecil per broker. Bawaan: skala SAMA untuk semua kotak (besarnya bisa
 * dibandingkan). Pilihan "skala masing-masing" memperlihatkan bentuk tren
 * broker kecil; saat aktif, label peringatan menjelaskan bahwa tinggi garis
 * antarbroker tidak lagi sebanding.
 */
export function AccumulationGrid({ series }: { series: AccSeries[] }) {
  const [shared, setShared] = useState(true);
  const all = series.flatMap((s) => s.points);
  const gMax = Math.max(0, ...all);
  const gMin = Math.min(0, ...all);

  return (
    <div>
      <div role="group" aria-label="Skala grafik" className="mb-3 inline-flex rounded-full border border-ink-300 bg-card p-1 text-sm">
        {[
          { v: true, t: "Skala sama" },
          { v: false, t: "Skala masing-masing" },
        ].map((o) => (
          <button
            key={o.t}
            type="button"
            aria-pressed={shared === o.v}
            onClick={() => setShared(o.v)}
            className={`rounded-full px-3.5 py-1 font-medium ${shared === o.v ? "bg-ink-900 text-paper" : "text-ink-700 hover:bg-ink-100"}`}
          >
            {o.t}
          </button>
        ))}
      </div>
      {!shared && <p className="mb-3 text-sm text-kunyit-800">Tiap kotak memakai skalanya sendiri — bandingkan angka, bukan tinggi garis.</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {series.map((s) => {
          const max = shared ? gMax : Math.max(0, ...s.points);
          const min = shared ? gMin : Math.min(0, ...s.points);
          const span = max - min || 1;
          const y = (v: number) => 4 + (1 - (v - min) / span) * (H - 8);
          const up = s.last >= 0;
          const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${((i / (s.points.length - 1)) * W).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
          return (
            <li key={s.brokerCode} className="rounded-md border border-ink-200 bg-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="num text-base font-bold">{s.brokerCode}</span>
                <span className={`num text-sm font-semibold ${up ? "text-up-700" : "text-down-600"}`}>
                  {up ? "▲" : "▼"} {formatCompactIdr(Math.abs(s.last))}
                </span>
              </div>
              {s.brokerName && <p className="truncate text-[11px] text-ink-500">{s.brokerName}</p>}
              <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-16 w-full" preserveAspectRatio="none" role="img" aria-label={`${s.brokerCode}: akumulasi akhir ${formatCompactIdr(s.last)}`}>
                <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-ink-400" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                <path d={d} fill="none" className={up ? "stroke-up-600" : "stroke-down-500"} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
