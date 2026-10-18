import { notFound } from "next/navigation";

import { Pagination } from "@/components/Pagination";
import { AccumulationSection } from "@/features/market-data/accumulation-section";
import { BrokerSection, preferredRanges } from "@/features/market-data/broker-section";
import { ForeignSection } from "@/features/market-data/foreign-section";
import { InsidersSection, insiderSummary } from "@/features/market-data/insiders-section";
import { loadInstrument } from "@/features/stock/load";
import { FEATURES } from "@/lib/features";
import { paginate, type SearchParamsRecord } from "@/lib/pagination";
import type { AccumulationPayload } from "@/server/ingestion/arjum-derived";
import { getBrokerSummaryRanges, getBrokerSummaryRows, getDerivedSnapshot, getForeignFlow, getInsiders } from "@/server/db/arjum-queries";
import { quotaDateWib } from "@/server/quota/budget";

export const dynamic = "force-dynamic";

/** Bandarmologi: jejak asing dan broker. Transaksi insider ikut tampil bila fiturnya diaktifkan. */
export default async function StockBandarPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SearchParamsRecord> }) {
  const { code } = await params;
  const query = await searchParams;
  const instrument = await loadInstrument(code);
  if (!instrument) notFound();
  const path = `/saham/${instrument.code}/bandarmologi`;
  const [foreign, ranges, accumulation, insiders] = await Promise.all([
    getForeignFlow(instrument.id, 20),
    getBrokerSummaryRanges(instrument.id),
    getDerivedSnapshot(instrument.id, "broker_accumulation"),
    FEATURES.insider ? getInsiders(instrument.id) : Promise.resolve([]),
  ]);
  const shown = preferredRanges(ranges);
  const brokerParam = typeof query.broker === "string" ? Number.parseInt(query.broker, 10) : NaN;
  const selected = ranges.find((r) => r.id === brokerParam) ?? shown[0] ?? null;
  const rows = selected ? await getBrokerSummaryRows(selected.id) : [];
  const insiderPage = paginate(insiders, query, "insider", 10);

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="asing">
        <ForeignSection id="asing" rows={foreign} today={quotaDateWib()} />
      </section>
      <section aria-labelledby="broker">
        <BrokerSection id="broker" path={path} ranges={shown} selected={selected} rows={rows} baseParams={{}} requestable={FEATURES.permintaanData}>
          <AccumulationSection payload={(accumulation?.payload as AccumulationPayload | undefined) ?? null} fetchedAt={accumulation?.fetchedAt ?? null} />
        </BrokerSection>
      </section>
      {FEATURES.insider && (
        <section aria-labelledby="insider">
          <InsidersSection
            id="insider"
            rows={insiderPage.items}
            summary={insiderSummary(insiders)}
            fetchedNote={null}
            top={<Pagination variant="top" state={insiderPage} path={path} params={query} paramKey="insider" defaultSize={10} unit="laporan" anchor="insider" />}
            bottom={<Pagination variant="bottom" state={insiderPage} path={path} params={query} paramKey="insider" defaultSize={10} unit="laporan" anchor="insider" />}
          />
        </section>
      )}
    </div>
  );
}
