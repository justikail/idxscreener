import { BarSeries } from "@/components/charts/BarSeries";
import { Term } from "@/components/Term";
import { EmptyState, FreshnessChip, HowToRead, SectionHeader, StatTile } from "@/components/ui/section";
import { formatCompact, formatNumber, formatTradingDate } from "@/lib/format";

type Row = { tradingDate: string; volume: bigint | null; foreignBuy: bigint | null; foreignSell: bigint | null; foreignNet: bigint | null };

const lembar = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatCompact(Math.abs(v), 1)}`;

/** Volume beli/jual investor asing per sesi (lembar). Bukan nilai Rupiah. */
export function ForeignSection({ id, rows, today }: { id: string; rows: Row[]; today: string }) {
  const withData = rows.filter((r) => r.foreignNet !== null);
  if (withData.length === 0) {
    return (
      <>
        <SectionHeader id={id} eyebrow="Siapa yang bertransaksi" title="Investor asing" />
        <EmptyState title="Data transaksi asing belum tersedia untuk saham ini." icon="⇄">
          Data ini ikut terisi saat harga harian diperbarui.
        </EmptyState>
      </>
    );
  }
  const sum = (list: Row[]) => list.reduce((s, r) => s + Number(r.foreignNet), 0);
  const last5 = withData.slice(-5);
  const net5 = sum(last5);
  const vol5 = last5.reduce((s, r) => s + Number(r.volume ?? 0n), 0);
  const ratio5 = last5.length === 5 && vol5 > 0 ? (net5 / vol5) * 100 : null;
  const netAll = sum(withData);
  const buyDays = withData.filter((r) => Number(r.foreignNet) > 0).length;
  const last = withData.at(-1)!;

  const takeaway =
    last5.length < 5 ? (
      "Data asing 5 sesi terakhir belum lengkap."
    ) : (
      <>
        Dalam 5 sesi terakhir investor asing lebih banyak <strong>{net5 >= 0 ? "membeli" : "menjual"}</strong>: selisih{" "}
        <strong className="num">{formatCompact(Math.abs(net5), 1)} lembar</strong>
        {ratio5 !== null && <> atau {formatNumber(Math.abs(ratio5), 1)}% dari seluruh volume</>}. Dalam {withData.length} sesi, asing net beli pada{" "}
        {buyDays} hari dan net jual pada {withData.length - buyDays} hari.
      </>
    );

  return (
    <>
      <SectionHeader id={id} eyebrow="Siapa yang bertransaksi" title="Investor asing" takeaway={takeaway} chips={<FreshnessChip date={last.tradingDate} today={today} />} />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Net asing 5 sesi" value={`${lembar(net5)} lbr`} tone={net5 >= 0 ? "up" : "down"} sub={net5 >= 0 ? "Beli lebih banyak dari jual" : "Jual lebih banyak dari beli"} />
        <StatTile
          label={<Term k="asing_net">Porsi dari volume</Term>}
          value={ratio5 === null ? "—" : `${ratio5 >= 0 ? "+" : "−"}${formatNumber(Math.abs(ratio5), 1)}%`}
          tone={ratio5 === null ? "muted" : ratio5 >= 0 ? "up" : "down"}
          sub="Net asing ÷ volume 5 sesi"
        />
        <StatTile label={`Net asing ${withData.length} sesi`} value={`${lembar(netAll)} lbr`} tone={netAll >= 0 ? "up" : "down"} sub={`${formatTradingDate(withData[0]!.tradingDate, { weekday: false })} – ${formatTradingDate(last.tradingDate, { weekday: false })}`} />
      </dl>

      <div className="mt-5 rounded-md border border-ink-200 bg-card p-4 sm:p-5">
        <BarSeries
          format="lembar"
          title="Net asing per sesi (beli − jual)"
          height={160}
          data={withData.map((r) => ({
            key: r.tradingDate,
            label: formatTradingDate(r.tradingDate, { weekday: false }).replace(/ \d{4}$/, ""),
            value: Number(r.foreignNet),
            detail: [
              formatTradingDate(r.tradingDate),
              `Beli asing ${formatCompact(Number(r.foreignBuy), 1)} · jual ${formatCompact(Number(r.foreignSell), 1)}`,
              r.volume !== null && Number(r.volume) > 0 ? `${formatNumber((Math.abs(Number(r.foreignNet)) / Number(r.volume)) * 100, 1)}% dari volume sesi` : "",
            ].filter(Boolean),
          }))}
        />
      </div>

      <HowToRead>
        <ul>
          <li>Batang hijau di atas garis = asing membeli lebih banyak dari menjual pada sesi itu; merah di bawah garis = sebaliknya.</li>
          <li>Satuan lembar saham, bukan Rupiah. Nilai Rupiah tidak kami taksir dari harga penutupan karena harga transaksi asing bisa berbeda.</li>
          <li>&ldquo;Asing&rdquo; mengikuti klasifikasi sumber data. Aktivitas asing adalah catatan transaksi, bukan sinyal beli atau jual.</li>
        </ul>
      </HowToRead>
    </>
  );
}
