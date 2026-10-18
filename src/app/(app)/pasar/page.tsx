import Link from "next/link";

import { Term } from "@/components/Term";
import { BreadthBar } from "@/components/market/BreadthBar";
import { Delta } from "@/components/market/Delta";
import { TickerTape } from "@/components/market/TickerTape";
import { EmptyState } from "@/components/ui/section";
import { Pagination } from "@/components/Pagination";
import { MarketListTable, type ListMeta, type ListRow } from "@/features/market/market-list-table";
import { paginate, type SearchParamsRecord } from "@/lib/pagination";
import { formatCompact, formatCompactIdr, formatTradingDate } from "@/lib/format";
import { getDashboardRows, getForeignSession, getSparklines, type DashboardRow } from "@/server/db/queries";

export const dynamic = "force-dynamic";

/**
 * Kalimat judul diturunkan dari breadth dengan aturan tetap (bukan teks
 * generatif): rasio naik:turun ≥ 1,5 → menguat, ≤ 1/1,5 → melemah.
 */
function headline(up: number, down: number): { lead: string; accent: string } {
  if (up === 0 && down === 0) return { lead: "Pasar", accent: "tanpa perubahan" };
  if (up >= down * 1.5) return { lead: "Pasar ditutup", accent: "menguat" };
  if (down >= up * 1.5) return { lead: "Pasar ditutup", accent: "melemah" };
  return { lead: "Pasar bergerak", accent: "campuran" };
}

export default async function MarketSummaryPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const params = await searchParams;
  const [rows, foreign] = await Promise.all([getDashboardRows(), getForeignSession()]);
  if (rows.length === 0) {
    return <EmptyState title="Data pasar belum diambil." icon="▁">Halaman ini terisi setelah pembaruan data harian berikutnya.</EmptyState>;
  }

  const focusMode: "demo" | "live" = rows.some((r) => r.dataMode === "live" && r.close !== null) ? "live" : "demo";
  const scope = rows.filter((r) => r.close !== null && r.dataMode === focusMode);
  const lastDate = scope.map((r) => r.tradingDate).filter(Boolean).sort().at(-1) ?? null;
  const current = scope.filter((r) => r.tradingDate === lastDate);
  const withChange = current.filter((r) => r.changePct !== null);
  const up = withChange.filter((r) => r.changePct! > 0).length;
  const down = withChange.filter((r) => r.changePct! < 0).length;
  const flat = withChange.length - up - down;
  const sorted = [...withChange].sort((a, b) => b.changePct! - a.changePct!);
  const totalValue = current.reduce((s, r) => s + (r.value ?? 0), 0);
  const byValue = [...current].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const medianChange = (() => {
    const v = withChange.map((r) => r.changePct!).sort((a, b) => a - b);
    if (v.length === 0) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
  })();

  const fSorted = [...foreign].sort((a, b) => b.foreignNet - a.foreignNet);
  const fNetAll = foreign.reduce((s, r) => s + r.foreignNet, 0);
  const byCode = new Map(current.map((r) => [r.code, r]));

  // Satu tabel, lima daftar. Setiap daftar berisi SEMUA saham yang relevan,
  // dipotong per halaman (?daftar=, ?hal=, ?hal_per=).
  type Item = { kind: "price"; row: DashboardRow } | { kind: "foreign"; row: (typeof foreign)[number] };
  const price = (rows: DashboardRow[]): Item[] => rows.map((row) => ({ kind: "price", row }));
  const fx = (rows: typeof foreign): Item[] => rows.map((row) => ({ kind: "foreign", row }));
  const LISTS: Array<ListMeta & { items: Item[] }> = [
    { key: "ramai", label: "Paling ramai", metricLabel: "Nilai transaksi", note: "Nilai transaksi terbesar sesi terakhir", items: price(byValue) },
    { key: "naik", label: "Naik paling tinggi", metricLabel: "Nilai transaksi", note: "Kenaikan harga terbesar sesi terakhir", items: price(sorted.filter((r) => r.changePct! > 0)) },
    { key: "turun", label: "Turun paling dalam", metricLabel: "Nilai transaksi", note: "Penurunan harga terbesar sesi terakhir", items: price([...sorted].reverse().filter((r) => r.changePct! < 0)) },
    { key: "asing-beli", label: "Net beli asing terbesar", metricLabel: "Net asing (lembar)", note: "Investor asing sesi terakhir", items: fx(fSorted.filter((r) => r.foreignNet > 0)) },
    { key: "asing-jual", label: "Net jual asing terbesar", metricLabel: "Net asing (lembar)", note: "Investor asing sesi terakhir", items: fx([...fSorted].reverse().filter((r) => r.foreignNet < 0)) },
  ];
  const list = LISTS.find((l) => l.key === params.daftar) ?? LISTS[0]!;
  const page = paginate(list.items, params, "hal", 10);
  const idOf = (it: Item) => (it.kind === "price" ? it.row.instrumentId : byCode.get(it.row.code)?.instrumentId);
  const sparks = await getSparklines(page.items.map(idOf).filter((x): x is string => Boolean(x)));
  const tableRows: ListRow[] = page.items.map((it) => {
    const spark = sparks.get(idOf(it) ?? "") ?? [];
    if (it.kind === "price") {
      const r = it.row;
      return { code: r.code, name: r.name, close: r.close, changePct: r.changePct, spark, metric: r.value !== null ? formatCompactIdr(r.value) : "—", href: `/saham/${r.code}` };
    }
    const f = it.row;
    return {
      code: f.code,
      name: f.name,
      close: f.close,
      changePct: f.changePct,
      spark,
      metric: `${f.foreignNet >= 0 ? "+" : "−"}${formatCompact(Math.abs(f.foreignNet), 1)}`,
      metricTone: f.foreignNet >= 0 ? "up" : "down",
      href: `/saham/${f.code}/bandarmologi`,
    };
  });
  const h = headline(up, down);

  return (
    <div className="flex flex-col gap-10">
      <div className="-mx-4 -mt-6 sm:-mx-6 lg:-mt-8">
        <TickerTape label="Pergerakan harga penutupan terakhir" items={byValue.slice(0, 40).map((r) => ({ code: r.code, close: r.close, changePct: r.changePct }))} />
      </div>

      <section className="grid animate-rise gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-end">
        <div>
          <p className="text-sm text-ink-600">
            Penutupan {lastDate ? formatTradingDate(lastDate) : "—"} · <Term k="realtime">bukan realtime</Term>
          </p>
          <h1 className="mt-3 font-display text-5xl font-semibold leading-[0.95] tracking-tight sm:text-6xl">
            {h.lead}{" "}
            <em className={`font-normal ${h.accent === "menguat" ? "text-up-600" : h.accent === "melemah" ? "text-down-500" : "text-kunyit-600"}`}>{h.accent}</em>.
          </h1>
          <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-ink-800">
            <strong className="num">{up}</strong> saham naik, <strong className="num">{down}</strong> turun, <strong className="num">{flat}</strong> tetap dari{" "}
            {withChange.length} saham yang diperdagangkan. Total nilai transaksi <strong className="num">{formatCompactIdr(totalValue)}</strong>.
          </p>
        </div>
        <div className="rounded-md border border-ink-200 bg-card p-5">
          <p className="mb-3 text-sm text-ink-600">
            <Term k="breadth">Perbandingan naik vs turun</Term>
          </p>
          <BreadthBar up={up} flat={flat} down={down} />
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-ink-200 pt-4">
            <div>
              <dt className="text-sm text-ink-600">
                <Term k="median">Median perubahan</Term>
              </dt>
              <dd className="mt-1 text-2xl">
                <Delta value={medianChange} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-600">Net asing (lembar)</dt>
              <dd className={`num mt-1 text-2xl font-semibold ${fNetAll >= 0 ? "text-up-700" : "text-down-600"}`}>
                {foreign.length ? `${fNetAll >= 0 ? "+" : "−"}${formatCompact(Math.abs(fNetAll), 1)}` : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <Link
        href="/pasar/heatmap"
        className="group flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink-900 bg-ink-900 px-5 py-4 text-paper transition-colors hover:bg-ink-800"
      >
        <span>
          <span className="block text-lg font-semibold">Lihat heatmap pasar</span>
          <span className="block text-sm text-ink-300">Peta warna semua saham — bisa difilter dan diurutkan.</span>
        </span>
        <span className="font-semibold text-kunyit-400 group-hover:translate-x-0.5">Buka →</span>
      </Link>

      <MarketListTable
        options={LISTS}
        current={list}
        rows={tableRows}
        startRank={page.from}
        top={<Pagination variant="top" state={page} path="/pasar" params={params} paramKey="hal" defaultSize={10} unit="saham" anchor="daftar" />}
        bottom={<Pagination variant="bottom" state={page} path="/pasar" params={params} paramKey="hal" defaultSize={10} unit="saham" anchor="daftar" />}
      />
    </div>
  );
}

