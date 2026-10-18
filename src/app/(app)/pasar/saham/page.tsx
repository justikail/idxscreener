import type { Metadata } from "next";
import Link from "next/link";

import { Pagination } from "@/components/Pagination";
import { Term } from "@/components/Term";
import { Delta } from "@/components/market/Delta";
import { getMyWatchlistCodes } from "@/features/watchlist/actions";
import { FEATURES } from "@/lib/features";
import { formatCompactIdr, formatNumber, formatTradingDate, formatVolume } from "@/lib/format";
import { paginate, type SearchParamsRecord } from "@/lib/pagination";
import { getDashboardRows, type DashboardRow } from "@/server/db/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Semua Saham — Screener Saham ID",
  description: "Daftar semua saham dalam cakupan dengan harga penutupan terakhir, bisa dicari dan diurutkan.",
};

const PER_PAGE = 25;
const SORTS = {
  nilai: { label: "Nilai transaksi", fn: (a: DashboardRow, b: DashboardRow) => (b.value ?? -1) - (a.value ?? -1) },
  naik: { label: "Kenaikan", fn: (a: DashboardRow, b: DashboardRow) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity) },
  turun: { label: "Penurunan", fn: (a: DashboardRow, b: DashboardRow) => (a.changePct ?? Infinity) - (b.changePct ?? Infinity) },
  kode: { label: "Kode A–Z", fn: (a: DashboardRow, b: DashboardRow) => a.code.localeCompare(b.code) },
} as const;
type SortKey = keyof typeof SORTS;

export default async function AllStocksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 64);
  const urut = typeof params.urut === "string" ? params.urut : undefined;
  const sort: SortKey = urut && urut in SORTS ? (urut as SortKey) : "nilai";

  const [rows, watched] = await Promise.all([getDashboardRows(), FEATURES.watchlist ? getMyWatchlistCodes() : Promise.resolve(new Set<string>())]);
  const withData = rows.filter((r) => r.close !== null);
  const pending = rows.length - withData.length;
  const lastDate = withData.map((r) => r.tradingDate).filter(Boolean).sort().at(-1) ?? null;

  const needle = q.toUpperCase();
  const filtered = (needle ? withData.filter((r) => r.code.includes(needle) || r.name.toUpperCase().includes(needle)) : withData).sort(
    SORTS[sort].fn,
  );
  const pageState = paginate(filtered, params, "hal", PER_PAGE);
  const shown = pageState.items;
  const perParam = typeof params.hal_per === "string" ? params.hal_per : undefined;

  // Ganti urutan → kembali ke halaman 1, ukuran halaman dipertahankan.
  const href = (over: { urut: SortKey }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (over.urut !== "nilai") sp.set("urut", over.urut);
    if (perParam) sp.set("hal_per", perParam);
    const s = sp.toString();
    return s ? `/pasar/saham?${s}` : "/pasar/saham";
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="animate-rise">
        <p className="kicker">
          Penutupan {lastDate ? formatTradingDate(lastDate) : "—"} · <Term k="realtime">bukan realtime</Term>
        </p>
        <h1 className="mt-3 font-display text-5xl font-semibold leading-none tracking-tight sm:text-6xl">
          Semua <em className="font-normal text-kunyit-600">saham</em>
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-700">
          <span className="num font-semibold">{formatNumber(withData.length)}</span> saham dengan data harga.
          {pending > 0 && <span className="text-ink-500"> {formatNumber(pending)} saham lain masih menunggu data awal.</span>}
        </p>
      </section>

      <div className="flex flex-col gap-4 border-b border-ink-900 pb-4 md:flex-row md:items-end md:justify-between">
        <form action="/pasar/saham" className="flex w-full max-w-sm items-end gap-3 border-b-2 border-ink-900">
          {sort !== "nilai" && <input type="hidden" name="urut" value={sort} />}
          {perParam && <input type="hidden" name="hal_per" value={perParam} />}
          <label className="sr-only" htmlFor="filter-saham">Saring kode atau nama</label>
          <input
            id="filter-saham"
            name="q"
            defaultValue={q}
            placeholder="Saring kode atau nama…"
            className="w-full bg-transparent py-2 text-base outline-none placeholder:text-ink-400"
          />
          <button type="submit" className="pb-2 font-mono text-[12px] font-semibold uppercase tracking-[0.16em] hover:text-kunyit-700">
            Saring
          </button>
        </form>
        {/* Ponsel: pilihan lipat vertikal, bukan deretan tautan mendatar. */}
        <details className="group relative md:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between border border-ink-900 px-3 py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] [&::-webkit-details-marker]:hidden">
            <span>
              <span className="text-ink-500">Urutkan: </span>
              <span className="font-semibold">{SORTS[sort].label}</span>
            </span>
            <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
          </summary>
          <ul className="absolute inset-x-0 top-full z-30 border-x border-b border-ink-900 bg-paper">
            {(Object.keys(SORTS) as SortKey[]).map((key) => (
              <li key={key} className="border-t border-ink-200 first:border-t-0">
                <Link
                  href={href({ urut: key })}
                  aria-current={key === sort ? "true" : undefined}
                  className={`block px-3 py-3 font-mono text-[12px] uppercase tracking-[0.14em] ${key === sort ? "font-semibold text-ink-900" : "text-ink-600"}`}
                >
                  {SORTS[key].label}
                </Link>
              </li>
            ))}
          </ul>
        </details>
        <nav aria-label="Urutkan" className="hidden flex-wrap gap-x-5 gap-y-1 md:flex">
          <span className="kicker">Urutkan:</span>
          {(Object.keys(SORTS) as SortKey[]).map((key) => (
            <Link
              key={key}
              href={href({ urut: key })}
              aria-current={key === sort ? "true" : undefined}
              className={`kicker ${key === sort ? "text-ink-900 underline decoration-kunyit-500 decoration-2 underline-offset-4" : "hover:text-ink-900"}`}
            >
              {SORTS[key].label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="-mt-4">
      <Pagination variant="top" state={pageState} path="/pasar/saham" params={params} paramKey="hal" defaultSize={PER_PAGE} unit="saham" />
      {shown.length === 0 ? (
        <p className="py-10 text-center text-ink-500">Tidak ada saham yang cocok dengan “{q}”.</p>
      ) : (
        <>
          <ul className="sm:hidden">
            {shown.map((row) => (
              <li key={row.instrumentId} className="border-b border-ink-200">
                <Link href={`/saham/${row.code}`} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3">
                  <span className="min-w-0">
                    <span className="num font-semibold">
                      {watched.has(row.code) && <span aria-hidden className="mr-1 text-kunyit-500">★</span>}
                      {row.code}
                    </span>
                    <span className="block truncate text-xs text-ink-500">{row.name}</span>
                  </span>
                  <span className="text-right">
                    <span className="num block">{formatNumber(row.close!)}</span>
                    <Delta value={row.changePct} className="text-xs" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="relative hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="kicker border-b border-ink-300 text-left">
                  <th className="py-3 pr-4 font-normal">Saham</th>
                  <th className="py-3 pr-4 text-right font-normal">Harga</th>
                  <th className="py-3 pr-4 text-right font-normal">Perubahan</th>
                  <th className="py-3 pr-4 text-right font-normal"><Term k="volume">Volume (lembar)</Term></th>
                  <th className="py-3 pr-4 text-right font-normal"><Term k="nilai_transaksi">Nilai</Term></th>
                  <th className="py-3 font-normal">Data</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.instrumentId} className="group border-b border-ink-200 hover:bg-card">
                    <td className="py-2.5 pr-4">
                      <Link href={`/saham/${row.code}`} className="block">
                        <span className="num font-semibold group-hover:text-kunyit-700">
                          {watched.has(row.code) && (
                            <span className="relative mr-1 text-kunyit-500" title="Ada di watchlist Anda">
                              <span aria-hidden>★</span>
                              <span className="sr-only">Di watchlist: </span>
                            </span>
                          )}
                          {row.code}
                        </span>
                        <span className="block max-w-[18rem] truncate text-xs text-ink-500">{row.name}</span>
                      </Link>
                    </td>
                    <td className="num py-2.5 pr-4 text-right">{formatNumber(row.close!)}</td>
                    <td className="py-2.5 pr-4 text-right"><Delta value={row.changePct} /></td>
                    <td className="num py-2.5 pr-4 text-right text-ink-700">{row.volume !== null ? formatVolume(row.volume) : "—"}</td>
                    <td className="num py-2.5 pr-4 text-right text-ink-700">{row.value !== null ? formatCompactIdr(row.value) : "—"}</td>
                    <td className="py-2.5 text-xs text-ink-600">
                      {row.isStale ? (
                        <Term k="tertinggal">{row.tradingDate ? formatTradingDate(row.tradingDate, { weekday: false }) : "Tertinggal"}</Term>
                      ) : (
                        "Sesi terakhir"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Pagination variant="bottom" state={pageState} path="/pasar/saham" params={params} paramKey="hal" defaultSize={PER_PAGE} unit="saham" />
      </div>
    </div>
  );
}
