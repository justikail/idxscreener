import Link from "next/link";

import { SectionHeader } from "@/components/ui/section";
import { STRATEGIES } from "@/domain/strategies";
import { DisclaimerBanner, DisclaimerFull } from "@/features/recommendations/disclaimer";
import { evaluateVariant } from "@/features/recommendations/evaluate";
import { formatTradingDate } from "@/lib/format";
import { getScreenerCandidates } from "@/server/db/queries";

export const dynamic = "force-dynamic";

export default async function RecommendationsPage() {
  const candidates = await getScreenerCandidates();
  const results = STRATEGIES.map((s) => ({ s, variants: s.variants.map((v) => ({ v, r: evaluateVariant(candidates, v) })) }));
  const asOf = results.flatMap((x) => x.variants.map((v) => v.r.asOf)).filter(Boolean).sort().at(-1) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Rekomendasi"
        eyebrow={asOf ? `Data penutupan ${formatTradingDate(asOf)}` : "Strategi"}
        takeaway="Pilih strategi sesuai gaya Anda. Setiap strategi menyaring semua saham dengan aturan tertulis, lalu menunjukkan saham yang memenuhi syarat beserta angkanya."
      />
      <DisclaimerBanner />
      <ul className="grid gap-4 md:grid-cols-2">
        {results.map(({ s, variants }) => (
          <li key={s.slug}>
            <Link href={`/rekomendasi/${s.slug}`} className="group flex h-full flex-col rounded-md border border-ink-200 bg-card p-5 transition-colors hover:border-ink-900">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-2xl font-bold">{s.name}</span>
                <span className="text-sm text-ink-500">{s.alias}</span>
              </span>
              <span className="mt-2 flex-1 text-[0.9375rem] leading-relaxed text-ink-800">{s.short}</span>
              <span className="mt-4 flex flex-wrap gap-2">
                {variants.map(({ v, r }) => (
                  <span key={v.key} className={`rounded-full px-3 py-1 text-sm ${r.testable === 0 ? "border border-dashed border-ink-300 text-ink-500" : "bg-ink-900 text-paper"}`}>
                    {s.variants.length > 1 ? `${v.label}: ` : ""}
                    {r.testable === 0 ? "data belum cukup" : <strong>{r.passed.length} saham</strong>}
                  </span>
                ))}
              </span>
              <span className="mt-3 text-sm font-semibold text-kunyit-800 group-hover:underline">Lihat daftar &amp; aturannya →</span>
            </Link>
          </li>
        ))}
      </ul>
      <DisclaimerFull />
    </div>
  );
}
