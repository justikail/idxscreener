"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { changeColor } from "@/lib/color";
import { formatCompact, formatCompactIdr, formatNumber } from "@/lib/format";
import { squarify } from "@/lib/treemap";

export type HeatRow = {
  code: string;
  name: string;
  board: string;
  close: number | null;
  /** Semua perubahan dalam PERSEN (1,5 = 1,5%). */
  change1d: number | null;
  change5d: number | null;
  change20d: number | null;
  foreign5d: number | null;
  value: number | null;
  volume: number | null;
  marketCap: number | null;
};

const SIZE = {
  value: { label: "Nilai transaksi", get: (r: HeatRow) => r.value, fmt: (v: number) => formatCompactIdr(v) },
  volume: { label: "Volume", get: (r: HeatRow) => r.volume, fmt: (v: number) => `${formatCompact(v, 1)} lbr` },
  marketCap: { label: "Kapitalisasi", get: (r: HeatRow) => r.marketCap, fmt: (v: number) => formatCompactIdr(v) },
} as const;
const COLOR = {
  change1d: { label: "Hari ini", get: (r: HeatRow) => r.change1d, sat: 4 },
  change5d: { label: "5 hari", get: (r: HeatRow) => r.change5d, sat: 10 },
  change20d: { label: "20 hari", get: (r: HeatRow) => r.change20d, sat: 20 },
  foreign5d: { label: "Net asing 5 hari", get: (r: HeatRow) => r.foreign5d, sat: 20 },
} as const;
type SizeKey = keyof typeof SIZE;
type ColorKey = keyof typeof COLOR;
const COUNTS = [30, 60, 100, 200] as const;
const BOARD_LABEL: Record<string, string> = { utama: "Utama", pengembangan: "Pengembangan", akselerasi: "Akselerasi", ekonomi_baru: "Ekonomi Baru", pemantauan_khusus: "Pemantauan Khusus" };

const pct = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("id-ID", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`);

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ v: T; t: string; disabled?: boolean }>; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-600">{label}</span>
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-ink-300 bg-card p-1">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            disabled={o.disabled}
            aria-pressed={value === o.v}
            onClick={() => onChange(o.v)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors disabled:opacity-35 ${value === o.v ? "bg-ink-900 text-paper" : "text-ink-700 hover:bg-ink-100"}`}
          >
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Heatmap pasar: luas kotak & warna bisa dipilih, saham bisa difilter dan
 * diurutkan, dengan tampilan peta atau daftar. Semua dihitung di browser dari
 * data yang sudah dimuat — tidak ada pengambilan data tambahan.
 */
export function HeatmapExplorer({ rows }: { rows: HeatRow[] }) {
  const [size, setSize] = useState<SizeKey>("value");
  const [color, setColor] = useState<ColorKey>("change1d");
  const [count, setCount] = useState<number>(60);
  const [board, setBoard] = useState<string>("semua");
  const [dir, setDir] = useState<"semua" | "naik" | "turun">("semua");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"peta" | "daftar">("peta");
  const [sortKey, setSortKey] = useState<"size" | "color" | "code">("size");
  const [sortDesc, setSortDesc] = useState(true);

  const boards = useMemo(() => [...new Set(rows.map((r) => r.board))].sort(), [rows]);
  const hasCap = rows.some((r) => r.marketCap !== null);
  const hasForeign = rows.some((r) => r.foreign5d !== null);
  const S = SIZE[size];
  const C = COLOR[color];

  const filtered = useMemo(() => {
    const term = q.trim().toUpperCase();
    return rows.filter((r) => {
      if (board !== "semua" && r.board !== board) return false;
      const c = C.get(r);
      if (dir === "naik" && !(c !== null && c > 0)) return false;
      if (dir === "turun" && !(c !== null && c < 0)) return false;
      if (term && !r.code.includes(term) && !r.name.toUpperCase().includes(term)) return false;
      return true;
    });
  }, [rows, board, dir, q, C]);

  // Pilih N saham teratas menurut ukuran kotak (yang punya nilai ukuran).
  const top = useMemo(() => filtered.filter((r) => (S.get(r) ?? 0) > 0).sort((a, b) => S.get(b)! - S.get(a)!).slice(0, count), [filtered, S, count]);

  const listed = useMemo(() => {
    const val = (r: HeatRow) => (sortKey === "size" ? S.get(r) : sortKey === "color" ? C.get(r) : null);
    return [...top].sort((a, b) => {
      if (sortKey === "code") return sortDesc ? b.code.localeCompare(a.code) : a.code.localeCompare(b.code);
      const x = val(a) ?? -Infinity;
      const y = val(b) ?? -Infinity;
      return sortDesc ? y - x : x - y;
    });
  }, [top, sortKey, sortDesc, S, C]);

  const sortBy = (k: typeof sortKey) => {
    if (sortKey === k) setSortDesc(!sortDesc);
    else {
      setSortKey(k);
      setSortDesc(k !== "code");
    }
  };
  const up = top.filter((r) => (C.get(r) ?? 0) > 0).length;
  const down = top.filter((r) => (C.get(r) ?? 0) < 0).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-md border border-ink-200 bg-card/60 p-4">
        <Segmented label="Warna kotak = perubahan" value={color} onChange={setColor} options={(Object.keys(COLOR) as ColorKey[]).map((k) => ({ v: k, t: COLOR[k].label, disabled: k === "foreign5d" && !hasForeign }))} />
        <Segmented label="Besar kotak = " value={size} onChange={setSize} options={(Object.keys(SIZE) as SizeKey[]).map((k) => ({ v: k, t: SIZE[k].label, disabled: k === "marketCap" && !hasCap }))} />
        <Segmented label="Jumlah saham" value={String(count)} onChange={(v) => setCount(Number(v))} options={COUNTS.map((n) => ({ v: String(n), t: String(n) }))} />
        <Segmented label="Arah" value={dir} onChange={setDir} options={[{ v: "semua", t: "Semua" }, { v: "naik", t: "▲ Naik" }, { v: "turun", t: "▼ Turun" }]} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-600">Papan</span>
          <select value={board} onChange={(e) => setBoard(e.target.value)} className="rounded-full border border-ink-300 bg-card px-3 py-1.5 text-sm">
            <option value="semua">Semua papan</option>
            {boards.map((b) => (
              <option key={b} value={b}>
                {BOARD_LABEL[b] ?? b}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-600">Cari</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kode / nama" className="w-36 rounded-full border border-ink-300 bg-card px-3 py-1.5 text-sm" />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.9375rem] text-ink-800">
          <strong>{top.length}</strong> saham dengan {S.label.toLowerCase()} terbesar
          {board !== "semua" && ` di papan ${BOARD_LABEL[board] ?? board}`}: <span className="text-up-700">▲ {up}</span> · <span className="text-down-600">▼ {down}</span>{" "}
          ({C.label.toLowerCase()}).
        </p>
        <div role="group" aria-label="Tampilan" className="inline-flex rounded-full border border-ink-300 bg-card p-1 text-sm">
          {(["peta", "daftar"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-full px-4 py-1 font-medium ${view === v ? "bg-ink-900 text-paper" : "text-ink-700"}`}>
              {v === "peta" ? "Peta" : "Daftar"}
            </button>
          ))}
        </div>
      </div>

      {top.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-300 p-6 text-center text-ink-600">Tidak ada saham yang cocok dengan filter ini.</p>
      ) : view === "peta" ? (
        <Map rows={top} size={size} color={color} />
      ) : (
        <div className="overflow-x-auto rounded-md border border-ink-200 bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-600">
                <Th onClick={() => sortBy("code")} active={sortKey === "code"} desc={sortDesc}>
                  Saham
                </Th>
                <th className="px-3 py-2 text-right font-medium">Harga</th>
                <Th onClick={() => sortBy("color")} active={sortKey === "color"} desc={sortDesc} right>
                  {C.label}
                </Th>
                <Th onClick={() => sortBy("size")} active={sortKey === "size"} desc={sortDesc} right>
                  {S.label}
                </Th>
              </tr>
            </thead>
            <tbody>
              {listed.map((r) => {
                const cv = C.get(r);
                return (
                  <tr key={r.code} className="border-b border-ink-100 last:border-0 hover:bg-paper">
                    <td className="px-3 py-2">
                      <Link href={`/saham/${r.code}`} className="num font-bold hover:text-kunyit-700">
                        {r.code}
                      </Link>
                      <span className="block max-w-[14rem] truncate text-xs text-ink-500">{r.name}</span>
                    </td>
                    <td className="num px-3 py-2 text-right">{r.close !== null ? formatNumber(r.close) : "—"}</td>
                    <td className={`num px-3 py-2 text-right font-semibold ${cv === null ? "text-ink-400" : cv > 0 ? "text-up-700" : cv < 0 ? "text-down-600" : ""}`}>{pct(cv)}</td>
                    <td className="num px-3 py-2 text-right text-ink-700">{S.get(r) !== null ? S.fmt(S.get(r)!) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-600">
        <span>
          Besar kotak = {S.label.toLowerCase()} · warna = {C.label.toLowerCase()}. Ketuk kotak untuk membuka detail saham.
        </span>
        <span className="flex items-center gap-2" aria-hidden>
          <span className="num">−{C.sat}%</span>
          <span className="h-2 w-36 rounded-full" style={{ background: "linear-gradient(90deg,#a93220,#e4dccd 50%,#0c5636)" }} />
          <span className="num">+{C.sat}%</span>
        </span>
      </div>
    </div>
  );
}

function Th({ children, onClick, active, desc, right }: { children: React.ReactNode; onClick: () => void; active: boolean; desc: boolean; right?: boolean }) {
  return (
    <th className={`px-3 py-2 font-medium ${right ? "text-right" : ""}`} aria-sort={active ? (desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 hover:text-ink-900 ${active ? "text-ink-900" : ""}`}>
        {children}
        <span aria-hidden className="text-xs">{active ? (desc ? "▼" : "▲") : "↕"}</span>
      </button>
    </th>
  );
}

const LAYOUTS = [
  { aspect: 2.1, approxWidthPx: 1100, className: "hidden sm:block aspect-[2.1/1]" },
  { aspect: 0.72, approxWidthPx: 360, className: "block sm:hidden aspect-[0.72/1]" },
];

function Map({ rows, size, color }: { rows: HeatRow[]; size: SizeKey; color: ColorKey }) {
  const S = SIZE[size];
  const C = COLOR[color];
  const inputs = rows.map((r) => ({ weight: S.get(r)!, item: r }));
  return (
    <div>
      {LAYOUTS.map((layout) => {
        const tiles = squarify(inputs, layout.aspect);
        const heightPx = layout.approxWidthPx / layout.aspect;
        return (
          <div key={layout.aspect} className={`relative w-full overflow-hidden rounded-md bg-ink-900 ${layout.className}`}>
            {tiles.map((t) => {
              const cv = C.get(t.item);
              const { bg, fg } = changeColor(cv === null ? null : (cv / C.sat) * 4);
              const wPx = (t.w / 100) * layout.approxWidthPx;
              const hPx = (t.h / 100) * heightPx;
              const showCode = wPx >= 30 && hPx >= 20;
              const showPct = wPx >= 48 && hPx >= 38;
              const big = wPx >= 140 && hPx >= 84;
              const label = `${t.item.code} · ${t.item.name} · ${C.label}: ${pct(cv)} · ${S.label}: ${S.fmt(S.get(t.item)!)}`;
              return (
                <Link
                  key={t.item.code}
                  href={`/saham/${t.item.code}`}
                  title={label}
                  aria-label={label}
                  className="absolute flex flex-col items-center justify-center overflow-hidden border border-ink-900/70 p-1 text-center hover:z-10 hover:shadow-[inset_0_0_0_2px_#e3a826] hover:brightness-110 focus-visible:z-10"
                  style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%`, backgroundColor: bg, color: fg }}
                >
                  {showCode && <span className={`num font-semibold leading-none ${big ? "text-2xl" : "text-[11px] sm:text-xs"}`}>{t.item.code}</span>}
                  {showPct && <span className={`num mt-1 leading-none opacity-90 ${big ? "text-base" : "text-[10px] sm:text-[11px]"}`}>{pct(cv)}</span>}
                  {big && <span className="num mt-1 text-[11px] opacity-75">{S.fmt(S.get(t.item)!)}</span>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
