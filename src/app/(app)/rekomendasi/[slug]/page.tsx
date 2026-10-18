import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState, SectionHeader } from "@/components/ui/section";
import { describeRule, FIELD_META, findStrategy, formatFieldValue } from "@/domain/strategies";
import { DisclaimerBanner, DisclaimerFull } from "@/features/recommendations/disclaimer";
import { evaluateVariant } from "@/features/recommendations/evaluate";
import { formatNumber, formatTradingDate } from "@/lib/format";
import { getScreenerCandidates } from "@/server/db/queries";

export const dynamic = "force-dynamic";

const toneOf = (format: string | undefined, v: number | null) =>
  v === null ? "text-ink-400" : format === "pct" ? (v > 0 ? "text-up-700" : v < 0 ? "text-down-600" : "") : "";

export default async function StrategyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ jangka?: string }> }) {
  const { slug } = await params;
  const { jangka } = await searchParams;
  const strategy = findStrategy(slug);
  if (!strategy) notFound();
  const variant = strategy.variants.find((v) => v.key === jangka) ?? strategy.variants[0]!;
  const candidates = await getScreenerCandidates();
  const r = evaluateVariant(candidates, variant);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={`${strategy.name} · ${strategy.alias}`}
        eyebrow={r.asOf ? `Rekomendasi · data penutupan ${formatTradingDate(r.asOf)}` : "Rekomendasi"}
        takeaway={strategy.explain}
      />
      <DisclaimerBanner />

      {strategy.variants.length > 1 && (
        <div role="group" aria-label="Jangka waktu" className="inline-flex w-fit flex-wrap gap-1 rounded-full border border-ink-300 bg-card p-1">
          {strategy.variants.map((v) =>
            v.key === variant.key ? (
              <span key={v.key} aria-current="true" className="rounded-full bg-ink-900 px-4 py-1.5 font-semibold text-paper">
                {v.label}
              </span>
            ) : (
              <Link key={v.key} href={`/rekomendasi/${strategy.slug}?jangka=${v.key}`} className="rounded-full px-4 py-1.5 font-medium text-ink-700 hover:bg-ink-100">
                {v.label}
              </Link>
            ),
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <section aria-labelledby="syarat" className="rounded-md border border-ink-200 bg-card p-4 sm:p-5">
          <h2 id="syarat" className="text-lg font-semibold">
            Syarat {strategy.variants.length > 1 ? `(${variant.label.toLowerCase()})` : ""}
          </h2>
          <p className="mt-1 text-[0.9375rem] text-ink-700">{variant.idea} Saham harus memenuhi <strong>semua</strong> syarat ini:</p>
          <ol className="mt-3 flex flex-col gap-2">
            {variant.rules.map((rule, i) => (
              <li key={i} className="flex gap-3 text-[0.9375rem]">
                <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-kunyit-300 text-xs font-bold text-ink-950">
                  {i + 1}
                </span>
                <span>
                  {describeRule(rule)}
                  {FIELD_META[rule.field]?.hint && <span className="block text-xs text-ink-500">{FIELD_META[rule.field]!.hint}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="kapan" className="flex flex-col gap-3 rounded-md border border-ink-200 bg-card p-4 sm:p-5">
          <h2 id="kapan" className="text-lg font-semibold">
            Kapan dipakai
          </h2>
          <p className="text-[0.9375rem] leading-relaxed text-ink-800">{strategy.timing}</p>
          <p className="rounded-md bg-paper px-3 py-2 text-sm leading-relaxed text-ink-700">
            <strong>Batasan:</strong> {strategy.caveat}
          </p>
          <p className="text-sm text-ink-600">
            Diuji {r.testable} saham · {r.untestable > 0 ? `${r.untestable} saham belum bisa diuji karena datanya kurang` : "semua saham berdata lengkap"}.
          </p>
        </section>
      </div>

      <section aria-labelledby="hasil">
        <h2 id="hasil" className="mb-3 flex flex-wrap items-baseline gap-3 border-b-2 border-ink-900 pb-2">
          <span className="text-2xl font-bold">{r.passed.length} saham memenuhi syarat</span>
          <span className="text-sm text-ink-500">diurutkan menurut {FIELD_META[variant.sort.field]?.label.toLowerCase()}</span>
        </h2>
        {r.testable === 0 ? (
          <EmptyState title="Data belum cukup untuk menjalankan strategi ini." icon="◌">
            Data yang masih kurang: {r.missing.slice(0, 4).map((m) => `${m.label} (${m.count} saham)`).join(", ")}. Strategi akan otomatis terisi setelah datanya
            tersedia.
          </EmptyState>
        ) : r.passed.length === 0 ? (
          <EmptyState title="Tidak ada saham yang memenuhi semua syarat pada sesi ini." icon="○">
            Ini normal pada hari pasar tenang. Daftar dihitung ulang setiap sesi.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-md border border-ink-200 bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-ink-600">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Saham</th>
                  <th className="px-3 py-2 text-right font-medium">Harga</th>
                  {variant.columns.map((c) => (
                    <th key={c} className="px-3 py-2 text-right font-medium" title={FIELD_META[c]?.hint}>
                      {FIELD_META[c]?.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.passed.map((p, i) => (
                  <tr key={p.code} className="border-b border-ink-100 last:border-0 hover:bg-paper">
                    <td className="num px-4 py-2 text-ink-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/saham/${p.code}`} className="num font-bold hover:text-kunyit-700">
                        {p.code}
                      </Link>
                      <span className="block max-w-[14rem] truncate text-xs text-ink-500">{p.name}</span>
                    </td>
                    <td className="num px-3 py-2 text-right">{p.price !== null ? formatNumber(p.price) : "—"}</td>
                    {variant.columns.map((c) => {
                      const v = typeof p.values[c] === "number" ? (p.values[c] as number) : null;
                      return (
                        <td key={c} className={`num px-3 py-2 text-right ${toneOf(FIELD_META[c]?.format, v)}`}>
                          {formatFieldValue(c, v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {r.untestable > 0 && r.testable > 0 && (
          <p className="mt-2 text-sm text-ink-600">
            {r.untestable} saham belum bisa diuji (data kurang: {r.missing.slice(0, 3).map((m) => m.label.toLowerCase()).join(", ")}). Saham tersebut tidak pernah dianggap lolos.
          </p>
        )}
      </section>

      <DisclaimerFull />
    </div>
  );
}
