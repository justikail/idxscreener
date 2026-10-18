import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { Pagination } from "@/components/Pagination";
import { Term } from "@/components/Term";
import { Delta } from "@/components/market/Delta";
import { Sparkline } from "@/components/market/Sparkline";
import { Chip, EmptyState, SectionHeader } from "@/components/ui/section";
import { getMyAlerts } from "@/features/alerts/actions";
import { AlertList } from "@/features/alerts/alert-builder";
import { FollowToggle } from "@/features/requests/buttons";
import { getMyWatchlist } from "@/features/watchlist/actions";
import { db } from "@/server/db/client";
import { myFollows } from "@/server/requests/core";
import { formatNumber, formatTradingDate } from "@/lib/format";
import { paginate, type SearchParamsRecord } from "@/lib/pagination";
import { auth } from "@/server/auth/config";
import { getDashboardRows, getSparklines } from "@/server/db/queries";

import { RemoveWatchlistButton } from "./remove-button";
import { FEATURES } from "@/lib/features";

export const dynamic = "force-dynamic";

const PER_PAGE = 24;
const SORTS = [
  { id: "kode", label: "Kode A–Z" },
  { id: "naik", label: "Naik terbesar" },
  { id: "turun", label: "Turun terbesar" },
  { id: "baru", label: "Baru ditambah" },
] as const;

export default async function WatchlistPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  // Dinonaktifkan sementara (src/lib/features.ts) — kode tetap untuk pengembangan berikutnya.
  if (!FEATURES.watchlist) notFound();
  const params = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/masuk");

  const [items, myAlerts, rows, follows] = await Promise.all([getMyWatchlist(), getMyAlerts(), getDashboardRows(), session.user.id ? myFollows(db, session.user.id) : Promise.resolve([])]);
  const followed = new Set(follows.map((f) => f.instrumentId));
  const rowById = new Map(rows.map((r) => [r.instrumentId, r]));
  const sort = SORTS.find((s) => s.id === params.urut)?.id ?? "kode";
  const enriched = items.map((item, i) => ({ item, row: rowById.get(item.instrumentId), order: i }));
  enriched.sort((a, b) => {
    const ca = a.row?.changePct ?? null;
    const cb = b.row?.changePct ?? null;
    if (sort === "naik") return (cb ?? -Infinity) - (ca ?? -Infinity);
    if (sort === "turun") return (ca ?? Infinity) - (cb ?? Infinity);
    if (sort === "baru") return b.order - a.order;
    return a.item.code.localeCompare(b.item.code);
  });
  const up = enriched.filter((e) => (e.row?.changePct ?? 0) > 0).length;
  const down = enriched.filter((e) => (e.row?.changePct ?? 0) < 0).length;
  const flat = enriched.length - up - down;
  const lastDate = enriched.map((e) => e.row?.tradingDate).filter(Boolean).sort().at(-1) ?? null;
  const itemPage = paginate(enriched, params, "hal", PER_PAGE);
  const sparks = await getSparklines(itemPage.items.map((e) => e.item.instrumentId));
  const sortHref = (id: string) => {
    const sp = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== "urut" && e[0] !== "hal"));
    if (id !== "kode") sp.set("urut", id);
    const q = sp.toString();
    return `/watchlist${q ? `?${q}` : ""}#dipantau`;
  };

  return (
    <div className="flex flex-col gap-10">
      <section className="animate-rise">
        <p className="kicker">Milik {session.user.name}</p>
        <h1 className="mt-3 font-display text-5xl font-semibold leading-none tracking-tight sm:text-6xl">
          Watchlist <em className="font-normal text-kunyit-600">saya</em>
        </h1>
        {items.length > 0 ? (
          <p className="mt-4 max-w-2xl text-[1.1875rem] leading-relaxed text-ink-800">
            Anda memantau <strong>{items.length} saham</strong>.{lastDate && <> Pada penutupan {formatTradingDate(lastDate, { weekday: false })}: </>}
            <span className="text-up-700">▲ {up} naik</span>, <span className="text-down-600">▼ {down} turun</span>
            {flat > 0 && <>, {flat} tetap/tanpa data</>}.
          </p>
        ) : (
          <p className="mt-4 max-w-2xl text-[1.1875rem] leading-relaxed text-ink-800">Simpan saham yang ingin Anda ikuti agar tidak perlu mencarinya lagi.</p>
        )}
      </section>

      <section aria-labelledby="dipantau-judul" id="dipantau" className="scroll-mt-6">
        <SectionHeader
          id="dipantau-judul"
          title="Dipantau"
          chips={
            <span className="text-sm text-ink-500">
              Harga penutupan · <Term k="realtime">bukan realtime</Term>
            </span>
          }
        />
        {items.length === 0 ? (
          <EmptyState title="Belum ada saham yang dipantau." icon="☆">
            Buka saham dari{" "}
            <Link href="/" className="underline underline-offset-2">
              dashboard
            </Link>{" "}
            atau{" "}
            <Link href="/screener" className="underline underline-offset-2">
              screener
            </Link>
            , lalu tekan <strong>☆ Tambah ke watchlist</strong> di dekat nama saham.
          </EmptyState>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-600">Urutkan:</span>
              {SORTS.map((s) =>
                s.id === sort ? (
                  <span key={s.id} aria-current="true" className="rounded-full bg-ink-900 px-3.5 py-1.5 font-medium text-paper">
                    {s.label}
                  </span>
                ) : (
                  <Link key={s.id} href={sortHref(s.id)} className="rounded-full border border-ink-300 px-3.5 py-1.5 text-ink-700 hover:border-ink-900">
                    {s.label}
                  </Link>
                ),
              )}
            </div>
            <Pagination variant="top" state={itemPage} path="/watchlist" params={params} paramKey="hal" defaultSize={PER_PAGE} unit="saham" anchor="dipantau" />
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {itemPage.items.map(({ item, row }) => (
                <li key={item.itemId} className="group relative flex flex-col rounded-md border border-ink-200 bg-card p-4 transition-colors hover:border-ink-900">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/saham/${item.code}`} className="min-w-0 after:absolute after:inset-0 after:content-['']">
                      <span className="num text-xl font-bold text-ink-900">{item.code}</span>
                      <span className="block truncate text-sm text-ink-600">{item.name}</span>
                    </Link>
                    <Delta value={row?.changePct ?? null} variant="pill" className="text-sm" />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="num text-2xl font-semibold">{row?.close != null ? formatNumber(row.close) : "—"}</p>
                      <p className="text-xs text-ink-500">
                        {row?.tradingDate ? `Penutupan ${formatTradingDate(row.tradingDate, { weekday: false })}` : "Belum ada data harga"}
                        {row?.isStale && " · tertinggal"}
                      </p>
                    </div>
                    {row && <Sparkline values={sparks.get(item.instrumentId) ?? []} id={`w-${item.itemId}`} width={120} height={40} />}
                  </div>
                  <div className="relative z-[1] mt-3 flex items-center justify-between gap-2 border-t border-ink-100 pt-2">
                    {row?.dataMode === "live" ? <FollowToggle code={item.code} initial={followed.has(item.instrumentId)} compact /> : <span />}
                    <RemoveWatchlistButton itemId={item.itemId} code={item.code} />
                  </div>
                </li>
              ))}
            </ul>
            <Pagination variant="bottom" state={itemPage} path="/watchlist" params={params} paramKey="hal" defaultSize={PER_PAGE} unit="saham" anchor="dipantau" />
          </>
        )}
      </section>

      <section aria-labelledby="pengingat-judul" id="pengingat" className="scroll-mt-6">
        <SectionHeader
          id="pengingat-judul"
          title="Pengingat"
          takeaway={
            myAlerts.length > 0
              ? `${myAlerts.filter((a) => a.isActive).length} pengingat aktif. Dicek setiap selesai pembaruan harian; kabarnya masuk ke Notifikasi.`
              : undefined
          }
          chips={myAlerts.length > 0 ? <Chip>{myAlerts.length} pengingat</Chip> : undefined}
        />
        {myAlerts.length === 0 ? (
          <EmptyState title="Belum ada pengingat." icon="♪">
            Buka halaman saham, gulir ke <strong>Catatan &amp; pengingat</strong>, lalu tulis misalnya &ldquo;beri tahu saya bila harga turun ke
            5.800&rdquo; atau pilih saran cepat seperti &ldquo;RSI ≤ 30&rdquo;.
          </EmptyState>
        ) : (
          <AlertList
            alerts={myAlerts.map((a) => ({ id: a.id, code: a.code, metric: a.metric, operator: a.operator, threshold: a.threshold, isActive: a.isActive }))}
          />
        )}
      </section>
    </div>
  );
}
