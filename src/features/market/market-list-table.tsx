import Link from "next/link";

import { Delta } from "@/components/market/Delta";
import { Sparkline } from "@/components/market/Sparkline";
import { formatNumber } from "@/lib/format";

import { ListSelect } from "./list-select";

export type ListRow = {
  code: string;
  name: string;
  close: number | null;
  changePct: number | null;
  spark: number[];
  /** Nilai kolom terakhir, sudah diformat. */
  metric: string;
  metricTone?: "up" | "down";
  href: string;
};

export type ListMeta = { key: string; label: string; metricLabel: string; note: string };

/**
 * Satu tabel untuk semua daftar ringkasan pasar. Pilihan daftar, jumlah baris,
 * dan halaman tersimpan di URL (?daftar=, ?hal=, ?hal_per=) — bisa dibagikan
 * dan tetap saat halaman dimuat ulang.
 */
export function MarketListTable({
  options,
  current,
  rows,
  startRank,
  top,
  bottom,
}: {
  options: ListMeta[];
  current: ListMeta;
  rows: ListRow[];
  startRank: number;
  top?: React.ReactNode;
  bottom?: React.ReactNode;
}) {
  return (
    <section aria-labelledby="daftar-pasar" id="daftar" className="scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink-900 pb-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-500">{current.note}</p>
          <h2 id="daftar-pasar" className="section-title">
            {current.label}
          </h2>
        </div>
        <ListSelect options={options.map((o) => ({ key: o.key, label: o.label }))} value={current.key} />
      </div>

      {top}

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-300 bg-card p-5 text-sm text-ink-600">Data untuk daftar ini belum tersedia.</p>
      ) : (
        <ul className="overflow-hidden rounded-md border border-ink-200 bg-card">
          <li aria-hidden className="hidden grid-cols-[2.25rem_1fr_7rem_6rem_6rem_7rem] gap-3 border-b border-ink-200 px-4 py-2 text-xs font-medium text-ink-500 sm:grid">
            <span>#</span>
            <span>Saham</span>
            <span>20 sesi</span>
            <span className="text-right">Harga</span>
            <span className="text-right">Perubahan</span>
            <span className="text-right">{current.metricLabel}</span>
          </li>
          {rows.map((r, i) => (
            <li key={r.code} className="border-b border-ink-100 last:border-0">
              <Link href={r.href} className="grid grid-cols-[2.25rem_1fr_auto_auto] items-center gap-3 px-4 py-2.5 hover:bg-paper sm:grid-cols-[2.25rem_1fr_7rem_6rem_6rem_7rem]">
                <span className="num text-sm text-ink-400">{startRank + i}</span>
                <span className="min-w-0">
                  <span className="num font-bold">{r.code}</span>
                  <span className="block truncate text-xs text-ink-500">{r.name}</span>
                </span>
                <span className="hidden sm:block">
                  <Sparkline values={r.spark} id={`l-${current.key}-${r.code}`} width={100} height={28} />
                </span>
                <span className="num hidden text-right sm:block">{r.close !== null ? formatNumber(r.close) : "—"}</span>
                <span className="text-right sm:block">
                  <span className="num block sm:hidden">{r.close !== null ? formatNumber(r.close) : "—"}</span>
                  <Delta value={r.changePct} />
                </span>
                <span
                  className={`num text-right text-sm ${r.metricTone === "up" ? "font-semibold text-up-700" : r.metricTone === "down" ? "font-semibold text-down-600" : "text-ink-600"} max-sm:col-span-2 max-sm:col-start-2 max-sm:-mt-1 max-sm:text-left max-sm:text-xs`}
                >
                  <span className="sm:hidden">{current.metricLabel}: </span>
                  {r.metric}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {bottom}
    </section>
  );
}
