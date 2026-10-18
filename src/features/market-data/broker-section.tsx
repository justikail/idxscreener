import Link from "next/link";

import { TugOfWar } from "@/components/charts/TugOfWar";
import { Term } from "@/components/Term";
import { CoverageChip, EmptyState, FetchedChip, HowToRead, RequestLink, SectionHeader, type Coverage } from "@/components/ui/section";
import { formatCompact, formatCompactIdr, formatTradingDate } from "@/lib/format";

type Range = {
  id: number;
  startDate: string;
  endDate: string;
  brokerCount: number;
  coverage: string;
  coverageNote: string | null;
  meta: unknown;
  fetchedAt: Date;
};

type Row = {
  brokerCode: string;
  brokerName: string | null;
  buyValue: string | null;
  sellValue: string | null;
  netValue: string | null;
  buyVolume: string | null;
  sellVolume: string | null;
  netVolume: string | null;
};

const n = (v: string | null) => (v === null ? null : Number(v));

const COVERAGE_RANK: Record<string, number> = { complete: 0, unknown: 1, partial: 2 };

/** Satu snapshot per rentang tanggal: cakupan lengkap diutamakan, lalu yang terbaru diambil. */
export function preferredRanges<T extends { startDate: string; endDate: string; coverage: string; fetchedAt: Date }>(ranges: readonly T[]): T[] {
  const best = new Map<string, T>();
  for (const r of ranges) {
    const key = `${r.startDate}|${r.endDate}`;
    const cur = best.get(key);
    const better = !cur || (COVERAGE_RANK[r.coverage] ?? 9) < (COVERAGE_RANK[cur.coverage] ?? 9) || ((COVERAGE_RANK[r.coverage] ?? 9) === (COVERAGE_RANK[cur.coverage] ?? 9) && r.fetchedAt > cur.fetchedAt);
    if (better) best.set(key, r);
  }
  return [...best.values()].sort((a, b) => (a.endDate !== b.endDate ? (a.endDate < b.endDate ? 1 : -1) : a.startDate < b.startDate ? 1 : -1));
}

/** Pemenang net beli & net jual untuk ringkasan "Sekilas". */
export function brokerHeadline(rows: Row[]) {
  const withNet = rows.filter((r) => n(r.netValue) !== null);
  const top = (sign: 1 | -1) =>
    withNet
      .filter((r) => sign * n(r.netValue)! > 0)
      .sort((a, b) => sign * (n(b.netValue)! - n(a.netValue)!))
      .map((r) => ({ code: r.brokerCode, name: r.brokerName, value: n(r.netValue)! }))[0] ?? null;
  return { topBuyer: top(1), topSeller: top(-1) };
}

const rangeLabel = (r: { startDate: string; endDate: string }) =>
  r.startDate === r.endDate
    ? formatTradingDate(r.startDate, { weekday: false })
    : `${formatTradingDate(r.startDate, { weekday: false })} – ${formatTradingDate(r.endDate, { weekday: false })}`;

/**
 * Ringkasan broker untuk rentang TERSIMPAN yang dipilih (?broker=<id>).
 * Rentang yang belum tersimpan tidak diambil saat kunjungan — hanya worker
 * yang mengambil sesuai jadwal.
 */
export function BrokerSection({
  id,
  path,
  ranges,
  selected,
  rows,
  baseParams,
  children,
  requestable = false,
}: {
  id: string;
  path: string;
  ranges: Range[];
  selected: Range | null;
  rows: Row[];
  baseParams: Record<string, string>;
  children?: React.ReactNode;
  requestable?: boolean;
}) {
  if (ranges.length === 0 || !selected) {
    return (
      <>
        <SectionHeader id={id} eyebrow="Siapa yang bertransaksi" title="Broker (perusahaan sekuritas)" />
        <EmptyState title="Ringkasan broker saham ini belum tersedia." icon="⚖">
          Diambil terjadwal untuk saham terpilih sesuai kuota harian. Membuka halaman ini tidak memicu pengambilan data baru.
          {requestable && (
            <span className="block">
              <RequestLink />
            </span>
          )}
        </EmptyState>
        {children}
      </>
    );
  }
  const unit = (selected.meta as { volumeUnit?: string } | null)?.volumeUnit ?? "unknown";
  const volumeLabel = unit === "shares" ? "lembar" : unit === "lots" ? "lot" : null;
  const withNet = rows.filter((r) => n(r.netValue) !== null);
  const toTug = (r: Row) => ({
    code: r.brokerCode,
    name: r.brokerName,
    value: n(r.netValue)!,
    sub: volumeLabel && n(r.netVolume) !== null ? `${formatCompact(Math.abs(n(r.netVolume)!), 1)} ${volumeLabel}` : undefined,
  });
  const buyers = withNet.filter((r) => n(r.netValue)! > 0).sort((a, b) => n(b.netValue)! - n(a.netValue)!);
  const sellers = withNet.filter((r) => n(r.netValue)! < 0).sort((a, b) => n(a.netValue)! - n(b.netValue)!);
  const { topBuyer, topSeller } = brokerHeadline(rows);
  const coverage = (["complete", "partial", "unknown"].includes(selected.coverage) ? selected.coverage : "unknown") as Coverage;
  const totalBuy = rows.reduce((s, r) => s + (n(r.buyValue) ?? 0), 0);

  const href = (rid: number) => {
    const sp = new URLSearchParams(baseParams);
    sp.set("broker", String(rid));
    return `${path}?${sp.toString()}#${id}`;
  };

  return (
    <>
      <SectionHeader
        id={id}
        eyebrow="Siapa yang bertransaksi"
        title="Broker (perusahaan sekuritas)"
        takeaway={
          <>
            Pada <strong>{rangeLabel(selected)}</strong>
            {topBuyer && (
              <>
                , <strong className="num">{topBuyer.code}</strong>
                {topBuyer.name ? ` (${titleCase(topBuyer.name)})` : ""} paling banyak membeli bersih{" "}
                <span className="num">{formatCompactIdr(topBuyer.value)}</span>
              </>
            )}
            {topSeller && (
              <>
                {topBuyer ? ", sedangkan " : ", "}
                <strong className="num">{topSeller.code}</strong>
                {topSeller.name ? ` (${titleCase(topSeller.name)})` : ""} paling banyak menjual bersih{" "}
                <span className="num">{formatCompactIdr(Math.abs(topSeller.value))}</span>
              </>
            )}
            .
          </>
        }
        chips={
          <>
            <CoverageChip coverage={coverage} detail={`${selected.brokerCount} broker`} />
            <FetchedChip at={selected.fetchedAt} />
          </>
        }
      />

      {ranges.length > 1 && (
        <div className="mb-5">
          <p className="mb-2 text-sm text-ink-600">Pilih tanggal yang sudah tersimpan:</p>
          <div className="flex flex-wrap gap-2">
            {ranges.slice(0, 12).map((r) => {
              const active = r.id === selected.id;
              return active ? (
                <span key={r.id} aria-current="true" className="num rounded-full bg-ink-900 px-3.5 py-1.5 text-sm font-semibold text-paper">
                  {rangeLabel(r)}
                </span>
              ) : (
                <Link key={r.id} href={href(r.id)} scroll={false} className="num rounded-full border border-ink-300 px-3.5 py-1.5 text-sm text-ink-700 hover:border-ink-900 hover:text-ink-900">
                  {rangeLabel(r)}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {coverage !== "complete" && (
        <p className="mb-4 rounded-md border border-kunyit-300 bg-kunyit-50 px-4 py-3 text-sm text-kunyit-900">
          <strong>Hanya broker teratas.</strong> {selected.coverageNote ?? ""} Total pasar tidak dihitung dari daftar ini.
        </p>
      )}

      <div className="rounded-md border border-ink-200 bg-card p-4 sm:p-5">
        <p className="mb-4 text-sm font-medium text-ink-700">10 broker dengan selisih beli−jual terbesar (Rupiah)</p>
        {buyers.length + sellers.length === 0 ? (
          <p className="text-sm text-ink-500">Tidak ada broker dengan net beli/jual.</p>
        ) : (
          <TugOfWar buyers={buyers.slice(0, 10).map(toTug)} sellers={sellers.slice(0, 10).map(toTug)} format={(v) => formatCompactIdr(v)} />
        )}
      </div>

      <details className="group mt-3 rounded-md border border-ink-200 bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-ink-800 [&::-webkit-details-marker]:hidden">
          Semua {rows.length} broker pada tanggal ini
          <span aria-hidden className="font-mono text-xs text-ink-400 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="max-h-[28rem] overflow-auto border-t border-ink-200">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-ink-200 text-left text-ink-600">
                <th className="px-4 py-2 font-medium">Broker</th>
                <th className="px-3 py-2 text-right font-medium">Beli (Rp)</th>
                <th className="px-3 py-2 text-right font-medium">Jual (Rp)</th>
                <th className="px-3 py-2 text-right font-medium">Net (Rp)</th>
                <th className="px-4 py-2 text-right font-medium">Net {volumeLabel ?? "volume"}</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => (n(b.netValue) ?? 0) - (n(a.netValue) ?? 0))
                .map((r) => {
                  const net = n(r.netValue);
                  return (
                    <tr key={r.brokerCode} className="border-b border-ink-100 last:border-0">
                      <td className="px-4 py-1.5">
                        <span className="num font-semibold">{r.brokerCode}</span> <span className="text-xs text-ink-500">{r.brokerName ? titleCase(r.brokerName) : ""}</span>
                      </td>
                      <td className="num px-3 py-1.5 text-right">{n(r.buyValue) !== null ? formatCompact(n(r.buyValue)!, 1) : "—"}</td>
                      <td className="num px-3 py-1.5 text-right">{n(r.sellValue) !== null ? formatCompact(n(r.sellValue)!, 1) : "—"}</td>
                      <td className={`num px-3 py-1.5 text-right font-medium ${net === null ? "" : net >= 0 ? "text-up-700" : "text-down-600"}`}>
                        {net === null ? "—" : `${net >= 0 ? "+" : "−"}${formatCompact(Math.abs(net), 1)}`}
                      </td>
                      <td className="num px-4 py-1.5 text-right text-ink-600">{volumeLabel && n(r.netVolume) !== null ? formatCompact(n(r.netVolume)!, 1) : "—"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </details>

      {children}

      <HowToRead>
        <ul>
          <li>
            <Term k="broker_summary">Ringkasan broker</Term> adalah total transaksi per perusahaan sekuritas. Satu broker melayani banyak
            nasabah, jadi ini <strong>bukan</strong> identitas pemilik akhir dan bukan bukti aktivitas &ldquo;bandar&rdquo;.
          </li>
          <li>
            &ldquo;Lengkap&rdquo; berarti jumlah volume beli semua broker sama dengan volume pasar sesi itu. Total nilai beli tercatat{" "}
            {formatCompactIdr(totalBuy)}.
          </li>
          <li>Rentang tanggal yang berbeda tidak dijumlahkan karena bisa tumpang tindih.</li>
          {volumeLabel === null && <li>Satuan volume belum terverifikasi, jadi kolom volume tidak ditampilkan.</li>}
        </ul>
      </HowToRead>
    </>
  );
}

/** "UBS SEKURITAS INDONESIA" → "UBS Sekuritas Indonesia" (singkatan ≤ 3 huruf tetap kapital). */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length <= 3 && !["dan"].includes(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/\bTbk\.?/i, "Tbk");
}
