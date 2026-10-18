import Link from "next/link";

import { Pagination } from "@/components/Pagination";
import { Delta } from "@/components/market/Delta";
import { EmptyState, HowToRead, SectionHeader } from "@/components/ui/section";
import { formatCompact, formatNumber, formatTradingDate } from "@/lib/format";
import { paginate, type SearchParamsRecord } from "@/lib/pagination";
import { getForeignSession, getScreenerCandidates } from "@/server/db/queries";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

export default async function ForeignMarketPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const params = await searchParams;
  const arah = params.arah === "jual" ? "jual" : "beli";
  const [rows, candidates] = await Promise.all([getForeignSession(), getScreenerCandidates()]);
  if (rows.length === 0) {
    return (
      <>
        <SectionHeader title="Investor asing" eyebrow="Kondisi Market" />
        <EmptyState title="Data transaksi asing belum tersedia." icon="⇄" />
      </>
    );
  }
  const ratio5 = new Map(candidates.map((c) => [c.code, typeof c.values.foreign_net_ratio_5d === "number" ? c.values.foreign_net_ratio_5d : null]));
  const date = rows[0]!.tradingDate;
  const buyers = rows.filter((r) => r.foreignNet > 0).sort((a, b) => b.foreignNet - a.foreignNet);
  const sellers = rows.filter((r) => r.foreignNet < 0).sort((a, b) => a.foreignNet - b.foreignNet);
  const list = arah === "beli" ? buyers : sellers;
  const page = paginate(list, params, "hal", PER_PAGE);
  const net = rows.reduce((s, r) => s + r.foreignNet, 0);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Investor asing"
        eyebrow={`Penutupan ${formatTradingDate(date)} · satuan lembar saham`}
        takeaway={
          <>
            Secara total asing <strong>{net >= 0 ? "membeli" : "menjual"} bersih {formatCompact(Math.abs(net), 1)} lembar</strong>. Net beli di{" "}
            <strong>{buyers.length}</strong> saham, net jual di <strong>{sellers.length}</strong> saham.
          </>
        }
      />
      <div role="group" aria-label="Arah" className="inline-flex w-fit rounded-full border border-ink-300 bg-card p-1 text-sm">
        {(
          [
            ["beli", `Net beli (${buyers.length})`],
            ["jual", `Net jual (${sellers.length})`],
          ] as const
        ).map(([k, t]) =>
          k === arah ? (
            <span key={k} aria-current="true" className="rounded-full bg-ink-900 px-4 py-1.5 font-medium text-paper">
              {t}
            </span>
          ) : (
            <Link key={k} href={`/pasar/asing?arah=${k}`} className="rounded-full px-4 py-1.5 font-medium text-ink-700 hover:bg-ink-100">
              {t}
            </Link>
          ),
        )}
      </div>
      <Pagination variant="top" state={page} path="/pasar/asing" params={{ arah }} paramKey="hal" defaultSize={PER_PAGE} unit="saham" />
      <div className="overflow-x-auto rounded-md border border-ink-200 bg-card">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-600">
              <th className="px-4 py-2 font-medium">Saham</th>
              <th className="px-3 py-2 text-right font-medium">Harga</th>
              <th className="px-3 py-2 text-right font-medium">Net asing</th>
              <th className="px-3 py-2 text-right font-medium">% volume</th>
              <th className="px-3 py-2 text-right font-medium">Beli / jual asing</th>
              <th className="px-4 py-2 text-right font-medium">Net 5 hari</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((r) => {
              const r5 = ratio5.get(r.code) ?? null;
              return (
                <tr key={r.code} className="border-b border-ink-100 last:border-0 hover:bg-paper">
                  <td className="px-4 py-2">
                    <Link href={`/saham/${r.code}/bandarmologi`} className="num font-bold hover:text-kunyit-700">
                      {r.code}
                    </Link>
                    <span className="block max-w-[14rem] truncate text-xs text-ink-500">{r.name}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="num block">{r.close !== null ? formatNumber(r.close) : "—"}</span>
                    <Delta value={r.changePct} className="text-xs" />
                  </td>
                  <td className={`num px-3 py-2 text-right font-semibold ${r.foreignNet >= 0 ? "text-up-700" : "text-down-600"}`}>
                    {r.foreignNet >= 0 ? "+" : "−"}
                    {formatCompact(Math.abs(r.foreignNet), 1)}
                  </td>
                  <td className="num px-3 py-2 text-right">{r.volume ? `${((Math.abs(r.foreignNet) / r.volume) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : "—"}</td>
                  <td className="num px-3 py-2 text-right text-ink-600">
                    {r.foreignBuy !== null ? formatCompact(r.foreignBuy, 1) : "—"} / {r.foreignSell !== null ? formatCompact(r.foreignSell, 1) : "—"}
                  </td>
                  <td className={`num px-4 py-2 text-right ${r5 === null ? "text-ink-400" : r5 >= 0 ? "text-up-700" : "text-down-600"}`}>
                    {r5 === null ? "—" : `${r5 >= 0 ? "+" : "−"}${Math.abs(r5 * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination variant="bottom" state={page} path="/pasar/asing" params={{ arah }} paramKey="hal" defaultSize={PER_PAGE} unit="saham" />
      <HowToRead>
        <ul>
          <li>Net asing = volume beli asing − volume jual asing pada sesi itu, dalam lembar saham (bukan Rupiah).</li>
          <li>% volume = besar net asing dibanding seluruh volume saham itu. Net 5 hari = net asing 5 sesi ÷ volume 5 sesi.</li>
          <li>&ldquo;Asing&rdquo; mengikuti klasifikasi sumber data. Aktivitas asing adalah catatan transaksi, bukan sinyal beli atau jual.</li>
        </ul>
      </HowToRead>
    </div>
  );
}
