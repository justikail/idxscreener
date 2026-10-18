import { notFound } from "next/navigation";

import { Term } from "@/components/Term";
import { StockChart } from "@/components/market/StockChart";
import { EmptyState, HowToRead, SectionHeader } from "@/components/ui/section";
import { sma } from "@/domain/indicators";
import { brokerHeadline, preferredRanges } from "@/features/market-data/broker-section";
import { profitSummary } from "@/features/market-data/financials-section";
import { InsightGrid } from "@/features/market-data/insight-grid";
import { buildInsights } from "@/features/market-data/insights";
import { loadBars, loadInstrument, loadSnapshots, snapHelpers } from "@/features/stock/load";
import { formatCompact, formatCompactIdr, formatNumber, formatTradingDate } from "@/lib/format";
import { getBrokerSummaryRanges, getBrokerSummaryRows, getForeignFlow, getLatestFacts } from "@/server/db/arjum-queries";

export const dynamic = "force-dynamic";

/** Kartu Sekilas yang ditampilkan (6 = rapi di grid 3 kolom). */
const CARD_ORDER = ["tren", "volume", "valuasi", "laba", "rentang", "asing", "broker"];

export default async function StockSummaryPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const instrument = await loadInstrument(code);
  if (!instrument) notFound();
  const base = `/saham/${instrument.code}`;
  const [{ raw, bars }, { snapshots }, facts, foreign, ranges] = await Promise.all([
    loadBars(instrument.id),
    loadSnapshots(instrument.id),
    getLatestFacts(instrument.id),
    getForeignFlow(instrument.id, 20),
    getBrokerSummaryRanges(instrument.id),
  ]);
  const { num, metric } = snapHelpers(snapshots);
  const selected = preferredRanges(ranges)[0] ?? null;
  const brokerRows = selected ? await getBrokerSummaryRows(selected.id) : [];
  const closes = bars.map((b) => b.close);
  const last = bars.at(-1) ?? null;
  const lastRaw = raw.at(-1);
  const year = bars.slice(-250);
  const vols = bars.slice(-20).map((b) => b.volume).filter((x): x is number => x !== null);
  const avg20 = vols.length === 20 ? vols.reduce((a, b) => a + b, 0) / 20 : null;

  const insights = buildInsights({
    close: last?.close ?? null,
    sma20: num("sma20"),
    sma50: num("sma50"),
    yearLow: year.length ? Math.min(...year.map((b) => b.low)) : null,
    yearHigh: year.length ? Math.max(...year.map((b) => b.high)) : null,
    sessionsInYear: year.length,
    per: metric("per"),
    pbv: metric("pbv"),
    roe: metric("roe"),
    foreign: foreign.map((r) => ({ tradingDate: r.tradingDate, volume: r.volume === null ? null : Number(r.volume), net: r.foreignNet === null ? null : Number(r.foreignNet) })),
    broker: selected ? { date: selected.startDate, endDate: selected.endDate, coverage: selected.coverage, ...brokerHeadline(brokerRows) } : null,
    insiders: [],
    profit: profitSummary(facts),
    volume: { last: last?.volume ?? null, avg20 },
  });
  const TAB: Record<string, string> = { "#teknikal": "/teknikal", "#fundamental": "/fundamental", "#keuangan": "/fundamental", "#asing": "/bandarmologi", "#broker": "/bandarmologi", "#grafik": "#grafik" };
  const cards = CARD_ORDER.map((id) => insights.find((i) => i.id === id))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .slice(0, 6)
    .map((i) => ({ ...i, href: TAB[i.href]?.startsWith("#") ? TAB[i.href]! : `${base}${TAB[i.href] ?? ""}` }));

  const marketCap = num("market_cap");

  return (
    <div className="flex flex-col gap-8">
      <InsightGrid code={instrument.code} insights={cards} asOf={last ? formatTradingDate(last.time, { weekday: false }) : null} columns={3} />

      {lastRaw && (
        <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-ink-200 bg-card sm:grid-cols-3 lg:grid-cols-6">
          {[
            [<Term key="o" k="ohlc">Pembukaan</Term>, lastRaw.open !== null ? formatNumber(Number(lastRaw.open)) : "—"],
            ["Tertinggi", lastRaw.high !== null ? formatNumber(Number(lastRaw.high)) : "—"],
            ["Terendah", lastRaw.low !== null ? formatNumber(Number(lastRaw.low)) : "—"],
            [<Term key="v" k="volume">Volume</Term>, lastRaw.volume !== null ? `${formatCompact(Number(lastRaw.volume), 2)} lbr` : "—"],
            [<Term key="n" k="nilai_transaksi">Nilai transaksi</Term>, lastRaw.value !== null ? formatCompactIdr(Number(lastRaw.value)) : "—"],
            [<Term key="k" k="kapitalisasi_pasar">Kapitalisasi</Term>, marketCap !== null ? formatCompactIdr(marketCap) : "—"],
          ].map(([label, value], i) => (
            <div key={i} className="border-b border-r border-ink-100 px-4 py-3">
              <dt className="text-xs text-ink-600">{label}</dt>
              <dd className="num mt-1 whitespace-nowrap text-base font-medium sm:text-lg">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <section aria-labelledby="grafik" id="grafik" className="scroll-mt-24">
        <SectionHeader id="grafik-judul" title="Grafik harga" eyebrow="Candlestick harian · volume · rata-rata 20 & 50 hari" />
        {bars.length >= 2 ? (
          <StockChart bars={bars} sma20={sma(closes, 20)} sma50={sma(closes, 50)} code={instrument.code} />
        ) : (
          <EmptyState title="Data harga belum cukup untuk menggambar grafik." icon="▁" />
        )}
        <HowToRead>
          <ul>
            <li>
              <Term k="candlestick" />: badan hijau = ditutup lebih tinggi dari pembukaan, merah = lebih rendah. Batang bawah = volume.
            </li>
            <li>
              <Term k="sma" /> 20 dan 50 = rata-rata harga penutupan 20 dan 50 sesi terakhir.
            </li>
          </ul>
        </HowToRead>
      </section>
    </div>
  );
}
