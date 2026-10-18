import { formatCompactIdr, formatDateTimeWib, formatTradingDate } from "@/lib/format";
import type { AccumulationPayload } from "@/server/ingestion/arjum-derived";

import { FEATURES } from "@/lib/features";

import { AccumulationGrid } from "./accumulation-grid";

/**
 * Akumulasi net beli per broker (olahan Pihak Ketiga) sebagai grafik kecil
 * berjajar dengan SKALA SAMA, sehingga tinggi garis antarbroker bisa
 * dibandingkan langsung. Garis putus-putus = titik nol (awal rentang).
 */
export function AccumulationSection({ payload, fetchedAt }: { payload: AccumulationPayload | null; fetchedAt: Date | null }) {
  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-300 pb-2">
        <h3 className="text-lg font-semibold">Akumulasi broker dari waktu ke waktu</h3>
        <span className="text-xs text-ink-500">Olahan Pihak Ketiga{fetchedAt ? ` · diambil ${formatDateTimeWib(fetchedAt)}` : ""}</span>
      </div>
      <Body payload={payload} />
    </div>
  );
}

function Body({ payload }: { payload: AccumulationPayload | null }) {
  if (!payload || payload.series.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        Akumulasi broker saham ini belum diambil.
        {FEATURES.permintaanData && (
          <>
            {" "}
            <a href="#kelengkapan" className="font-semibold text-ink-900 underline underline-offset-4">
              Minta datanya ↑
            </a>
          </>
        )}
      </p>
    );
  }
  if (!payload.checks.cumulativeConsistent) {
    return (
      <p className="rounded-md border border-kunyit-300 bg-kunyit-50 px-4 py-3 text-sm text-kunyit-900">
        Deret dari sumber tidak konsisten (kumulatif ≠ penjumlahan harian), jadi tidak kami gambar.
      </p>
    );
  }
  const series = payload.series
    .filter((s) => s.points.length > 1)
    .map((s) => ({ ...s, last: s.points.at(-1)!.cum }))
    .sort((a, b) => b.last - a.last);
  const leader = series[0];

  return (
    <>
      <p className="mb-4 text-[1.0625rem] leading-relaxed text-ink-800">
        Sejak {formatTradingDate(payload.startDate, { weekday: false })}, akumulasi beli bersih terbesar dipegang{" "}
        <strong className="num">{leader?.brokerCode}</strong> ({formatCompactIdr(leader?.last ?? 0)}). Garis naik = broker terus membeli lebih
        banyak daripada menjual.
      </p>
      <AccumulationGrid series={series.map((s) => ({ brokerCode: s.brokerCode, brokerName: s.brokerName, last: s.last, points: s.points.map((p) => p.cum) }))} />
      <p className="mt-3 text-xs leading-relaxed text-ink-500">
        {formatTradingDate(payload.startDate, { weekday: false })} – {formatTradingDate(payload.endDate, { weekday: false })} · {payload.top ?? "beberapa"} broker net
        beli dan net jual terbesar menurut sumber. Broker lain tidak terlihat; ini bukan identitas pemilik akhir.
      </p>
    </>
  );
}
