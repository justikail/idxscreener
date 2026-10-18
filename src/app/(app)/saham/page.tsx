import Link from "next/link";
import { redirect } from "next/navigation";

import { Delta } from "@/components/market/Delta";
import { EmptyState, SectionHeader } from "@/components/ui/section";
import { formatNumber } from "@/lib/format";
import { getDashboardRows, searchInstruments } from "@/server/db/queries";

export const dynamic = "force-dynamic";

/** Menu Detail Saham: cari saham lalu buka halamannya. Kode persis langsung dibuka. */
export default async function StockPickerPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const [results, rows] = await Promise.all([query ? searchInstruments(query, 30) : Promise.resolve([]), getDashboardRows()]);
  const exact = results.find((r) => r.code.toUpperCase() === query.toUpperCase());
  if (exact) redirect(`/saham/${exact.code}`);
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const lastDate = rows.map((r) => r.tradingDate).filter(Boolean).sort().at(-1);
  const popular = rows
    .filter((r) => r.close !== null && r.tradingDate === lastDate)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 12);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader title="Detail saham" eyebrow="Cari saham" takeaway="Ketik kode (mis. BBCA) atau nama perusahaan. Kode yang tepat langsung membuka halamannya." />
      <form action="/saham" role="search" className="flex max-w-xl items-stretch overflow-hidden rounded-full border-2 border-ink-900 bg-card focus-within:border-kunyit-500">
        <label htmlFor="cari-saham" className="sr-only">
          Kode atau nama saham
        </label>
        <input id="cari-saham" name="q" defaultValue={query} autoFocus placeholder="Kode atau nama saham" className="min-w-0 flex-1 bg-transparent px-5 py-3 text-lg outline-none" />
        <button type="submit" className="bg-ink-900 px-6 font-semibold text-paper hover:bg-ink-700">
          Cari
        </button>
      </form>

      {query && (
        <section aria-labelledby="hasil">
          <h2 id="hasil" className="mb-3 text-lg font-semibold">
            {results.length ? `${results.length} hasil untuk “${query}”` : `Tidak ditemukan saham untuk “${query}”.`}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {results.map((r) => {
              const row = byCode.get(r.code);
              return (
                <li key={r.code}>
                  <Link href={`/saham/${r.code}`} className="flex items-center justify-between gap-3 rounded-md border border-ink-200 bg-card px-4 py-3 hover:border-ink-900">
                    <span className="min-w-0">
                      <span className="num text-lg font-bold">{r.code}</span>
                      <span className="block truncate text-sm text-ink-600">{r.name}</span>
                    </span>
                    {row?.close != null && (
                      <span className="text-right">
                        <span className="num block">{formatNumber(row.close)}</span>
                        <Delta value={row.changePct} className="text-xs" />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="populer">
        <h2 id="populer" className="mb-3 text-lg font-semibold">
          Paling ramai sesi terakhir
        </h2>
        {popular.length === 0 ? (
          <EmptyState title="Belum ada data." />
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {popular.map((r) => (
              <li key={r.code}>
                <Link href={`/saham/${r.code}`} className="flex items-center justify-between gap-2 rounded-md border border-ink-200 bg-card px-3 py-2.5 hover:border-ink-900">
                  <span className="num font-bold">{r.code}</span>
                  <Delta value={r.changePct} className="text-sm" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
