import Link from "next/link";
import { notFound } from "next/navigation";

import { MetricTooltip } from "@/components/MetricTooltip";
import { Term } from "@/components/Term";
import { RangeBar, RsiScale } from "@/components/market/Gauges";
import { FreshnessChip, HowToRead, SectionHeader, StatTile } from "@/components/ui/section";
import { loadBars, loadInstrument, loadSnapshots, snapHelpers } from "@/features/stock/load";
import { formatNumber, formatPercent } from "@/lib/format";
import { quotaDateWib } from "@/server/quota/budget";

export const dynamic = "force-dynamic";

export default async function StockTechnicalPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const instrument = await loadInstrument(code);
  if (!instrument) notFound();
  const [{ bars }, { asOf, snapshots }] = await Promise.all([loadBars(instrument.id), loadSnapshots(instrument.id)]);
  const { num } = snapHelpers(snapshots);
  const last = bars.at(-1) ?? null;
  const year = bars.slice(-250);
  const rsi = num("rsi14");
  const s20 = num("sma20");
  const s50 = num("sma50");
  const macd = num("macd_histogram");
  const relVol = num("volume_relative_20d");
  const r5 = num("return_5d");
  const r20 = num("return_20d");
  const diff = (ma: number | null) => (ma !== null && last ? ((last.close - ma) / ma) * 100 : null);
  const d20 = diff(s20);
  const d50 = diff(s50);

  const trend =
    d20 === null || d50 === null
      ? "Riwayat harga belum cukup untuk menilai tren."
      : d20 >= 0 && d50 >= 0
        ? "Harga di atas rata-rata 20 dan 50 hari: tren beberapa minggu terakhir cenderung naik."
        : d20 < 0 && d50 < 0
          ? "Harga di bawah rata-rata 20 dan 50 hari: tren beberapa minggu terakhir cenderung turun."
          : "Harga di antara rata-rata 20 dan 50 hari: arahnya belum jelas.";

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Teknikal" eyebrow="Dihitung dari pergerakan harga" takeaway={trend} chips={asOf ? <FreshnessChip date={asOf} today={quotaDateWib()} label="Dihitung" /> : undefined} />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Kenaikan 5 hari" value={r5 === null ? "—" : formatPercent(r5 * 100, 1)} tone={r5 === null ? "muted" : r5 >= 0 ? "up" : "down"} sub="Dibanding 5 sesi lalu" />
        <StatTile label="Kenaikan 20 hari" value={r20 === null ? "—" : formatPercent(r20 * 100, 1)} tone={r20 === null ? "muted" : r20 >= 0 ? "up" : "down"} sub="Dibanding ±1 bulan lalu" />
        <StatTile
          label={<Term k="volume_relatif">Volume vs biasanya</Term>}
          value={relVol === null ? "—" : `${formatNumber(relVol, 2)}×`}
          tone={relVol === null ? "muted" : "neutral"}
          sub={relVol === null ? "Riwayat belum cukup" : relVol >= 1.5 ? "Jauh lebih ramai" : relVol <= 0.6 ? "Lebih sepi" : "Sekitar biasanya"}
        />
        <StatTile
          label={<>Histogram <Term k="macd" /></>}
          value={macd === null ? "—" : `${macd >= 0 ? "+" : "−"}${formatNumber(Math.abs(macd), 2)}`}
          tone={macd === null ? "muted" : macd >= 0 ? "up" : "down"}
          sub={macd === null ? "Riwayat belum cukup" : macd >= 0 ? "Momentum menguat" : "Momentum melemah"}
        />
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-ink-200 bg-card p-4">
          <p className="mb-2 text-sm text-ink-600">
            <MetricTooltip metric="rsi14" />
          </p>
          <RsiScale value={rsi} />
        </div>
        {year.length > 0 && last && (
          <div className="rounded-md border border-ink-200 bg-card p-4">
            <RangeBar
              low={Math.min(...year.map((b) => b.low))}
              high={Math.max(...year.map((b) => b.high))}
              current={last.close}
              label={<Term k="rentang_52">{`Rentang ${year.length} sesi terakhir (≈1 tahun)`}</Term>}
            />
          </div>
        )}
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <StatTile
          label={<>Harga vs <Term k="sma20" /></>}
          value={d20 === null ? "—" : formatPercent(d20, 1)}
          tone={d20 === null ? "muted" : d20 >= 0 ? "up" : "down"}
          sub={s20 === null ? "Riwayat belum cukup" : `Rata-rata 20 hari: ${formatNumber(s20)}`}
        />
        <StatTile
          label={<>Harga vs <Term k="sma50" /></>}
          value={d50 === null ? "—" : formatPercent(d50, 1)}
          tone={d50 === null ? "muted" : d50 >= 0 ? "up" : "down"}
          sub={s50 === null ? "Riwayat belum cukup" : `Rata-rata 50 hari: ${formatNumber(s50)}`}
        />
      </dl>

      <HowToRead>
        <ul>
          <li>Semua indikator dihitung dari harga penutupan tersimpan. Zona RSI 30/70 adalah konvensi umum, bukan sinyal beli/jual.</li>
          <li>
            Rumus lengkap ada di{" "}
            <Link href="/tentang#perhitungan" className="underline underline-offset-2">
              Tentang & metodologi
            </Link>
            .
          </li>
        </ul>
      </HowToRead>
    </div>
  );
}
