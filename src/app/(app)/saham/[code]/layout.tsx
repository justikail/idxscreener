import { notFound } from "next/navigation";

import { DataModeBadge } from "@/components/DataModeBadge";
import { Term } from "@/components/Term";
import { Delta } from "@/components/market/Delta";
import { Chip } from "@/components/ui/section";
import { loadBars, loadInstrument } from "@/features/stock/load";
import { StockTabs } from "@/features/stock/stock-tabs";
import { formatNumber, formatTradingDate } from "@/lib/format";

/** Kepala detail saham dipakai semua tab: kode, nama, harga terakhir, perubahan. */
export default async function StockLayout({ children, params }: { children: React.ReactNode; params: Promise<{ code: string }> }) {
  const { code } = await params;
  const instrument = await loadInstrument(code);
  if (!instrument) notFound();
  const { bars } = await loadBars(instrument.id);
  const last = bars.at(-1) ?? null;
  const prev = bars.at(-2) ?? null;
  const changePct = last && prev && prev.close !== 0 ? ((last.close - prev.close) / prev.close) * 100 : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-500">
            {instrument.sectorName ?? "Sektor belum tersedia"} · <Term k="papan">Papan {instrument.board}</Term>
          </p>
          <h1 className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="num text-5xl font-bold leading-none tracking-tight sm:text-6xl">{instrument.code}</span>
            <span className="font-display text-xl italic text-ink-600 sm:text-2xl">{instrument.name}</span>
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <DataModeBadge mode={instrument.dataMode} />
            {instrument.isBank && <Chip>Bank</Chip>}
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="num text-4xl font-semibold leading-none sm:text-5xl">
            <span className="mr-1 align-top text-lg text-ink-400">Rp</span>
            {last ? formatNumber(last.close) : "—"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 sm:justify-end">
            <Delta value={changePct} variant="pill" />
            {last && prev && (
              <span className="num text-sm text-ink-600">
                {last.close - prev.close >= 0 ? "+" : "−"}
                {formatNumber(Math.abs(last.close - prev.close))}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-500">Penutupan {last ? formatTradingDate(last.time, { weekday: false }) : "—"} · bukan realtime</p>
        </div>
      </header>
      <StockTabs code={instrument.code} />
      {children}
    </div>
  );
}
