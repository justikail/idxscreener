import { notFound } from "next/navigation";

import { MetricTooltip } from "@/components/MetricTooltip";
import { Term } from "@/components/Term";
import { Chip, HowToRead, SectionHeader } from "@/components/ui/section";
import { FinancialsSection } from "@/features/market-data/financials-section";
import { loadInstrument, loadSnapshots, snapHelpers, type Snap } from "@/features/stock/load";
import { FEATURES } from "@/lib/features";
import { formatPercent, formatRatio } from "@/lib/format";
import { getLatestFacts, getLatestReports } from "@/server/db/arjum-queries";

export const dynamic = "force-dynamic";

const METRICS = ["per", "pbv", "roe", "roa", "npm", "der"] as const;
const HINT: Record<string, string> = {
  per: "Berapa tahun laba untuk menebus harga — makin kecil makin murah",
  pbv: "Harga dibanding nilai buku perusahaan",
  roe: "Laba dari modal sendiri — makin besar makin efisien",
  roa: "Laba dari seluruh aset",
  npm: "Berapa persen pendapatan yang menjadi laba bersih",
  der: "Utang dibanding modal sendiri",
};
const STATUS: Record<string, string> = { null_missing: "Data belum tersedia", not_applicable: "Tidak bermakna", stale: "Data lampau", unavailable: "Tidak tersedia" };

function value(metric: string, v: number) {
  return ["per", "pbv", "der"].includes(metric) ? formatRatio(v) : formatPercent(v * 100).replace("+", "");
}

function Ratio({ metric, s }: { metric: string; s: Snap | undefined }) {
  const ok = s && s.status === "ok" && s.value !== null;
  return (
    <div className={`rounded-md border p-4 ${ok ? "border-ink-200 bg-card" : "border-dashed border-ink-300 bg-card/50"}`}>
      <dt className="text-sm text-ink-600">
        <MetricTooltip metric={metric} />
      </dt>
      <dd className={`mt-1.5 ${ok ? "num text-2xl font-semibold" : "text-sm font-medium text-ink-500"}`}>
        {ok ? value(metric, Number(s!.value)) : s?.status === "not_applicable" ? <Term k="tidak_bermakna">{STATUS.not_applicable}</Term> : STATUS[s?.status ?? "unavailable"]}
      </dd>
      <dd className="mt-1 text-xs leading-snug text-ink-500">{HINT[metric]}</dd>
    </div>
  );
}

export default async function StockFundamentalPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const instrument = await loadInstrument(code);
  if (!instrument) notFound();
  const [{ snapshots }, facts, reports] = await Promise.all([loadSnapshots(instrument.id), getLatestFacts(instrument.id), getLatestReports(instrument.id)]);
  const { snap } = snapHelpers(snapshots);
  const anyRatio = METRICS.some((m) => snap(m)?.status === "ok" || snap(m)?.status === "not_applicable");

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="rasio">
        <SectionHeader
          id="rasio"
          title="Rasio fundamental"
          eyebrow="Dari laporan keuangan · 12 bulan terakhir"
          chips={<Chip><Term k="ttm" /></Chip>}
          takeaway={anyRatio ? undefined : "Rasio dihitung setelah laporan keuangan 4 kuartal terverifikasi dan jumlah saham tercatat tersedia. Kami tidak menampilkan angka perkiraan."}
        />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {METRICS.map((m) => (
            <Ratio key={m} metric={m} s={snap(m)} />
          ))}
        </dl>
        <HowToRead>
          <ul>
            <li>PER &amp; PBV memakai harga × saham tercatat terbaru; ROE, ROA, NPM memakai laba 12 bulan terakhir (4 kuartal yang berdiri sendiri).</li>
            <li>&ldquo;Tidak bermakna&rdquo; = pembaginya nol atau negatif (mis. rugi), sehingga angkanya akan menyesatkan.</li>
            <li>Bank dan nonbank sebaiknya tidak dibandingkan untuk DER karena simpanan nasabah tercatat sebagai liabilitas.</li>
          </ul>
        </HowToRead>
      </section>

      <section aria-labelledby="keuangan">
        <FinancialsSection id="keuangan" facts={facts} reports={reports} requestable={FEATURES.permintaanData} />
      </section>
    </div>
  );
}
