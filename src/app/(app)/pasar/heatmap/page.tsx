import { HowToRead, SectionHeader } from "@/components/ui/section";
import { HeatmapExplorer, type HeatRow } from "@/features/market/heatmap-explorer";
import { formatTradingDate } from "@/lib/format";
import { getDashboardRows, getInstrumentsBasic, getScreenerCandidates } from "@/server/db/queries";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export default async function HeatmapPage() {
  const [rows, candidates, instruments] = await Promise.all([getDashboardRows(), getScreenerCandidates(), getInstrumentsBasic()]);
  const metricsById = new Map(candidates.map((c) => [c.instrumentId, c.values]));
  const boardById = new Map(instruments.map((i) => [i.id, i.board]));
  const lastDate = rows.map((r) => r.tradingDate).filter(Boolean).sort().at(-1) ?? null;
  const heat: HeatRow[] = rows
    .filter((r) => r.close !== null && r.tradingDate === lastDate)
    .map((r) => {
      const m = metricsById.get(r.instrumentId) ?? {};
      const p = (k: string) => (num(m[k]) === null ? null : num(m[k])! * 100);
      return {
        code: r.code,
        name: r.name,
        board: boardById.get(r.instrumentId) ?? "utama",
        close: r.close,
        change1d: r.changePct,
        change5d: p("return_5d"),
        change20d: p("return_20d"),
        foreign5d: p("foreign_net_ratio_5d"),
        value: r.value,
        volume: r.volume !== null ? Number(r.volume) : null,
        marketCap: num(m.market_cap),
      };
    });

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Heatmap pasar"
        eyebrow={lastDate ? `Penutupan ${formatTradingDate(lastDate)}` : "Kondisi Market"}
        takeaway="Setiap kotak adalah satu saham. Hijau berarti naik, merah turun; makin pekat makin besar perubahannya. Atur sendiri ukuran, warna, jumlah, dan filternya."
      />
      <HeatmapExplorer rows={heat} />
      <HowToRead>
        <ul>
          <li>Hanya saham yang diperdagangkan pada sesi terakhir yang digambar. Saham tanpa nilai untuk ukuran yang dipilih tidak digambar.</li>
          <li>&ldquo;5 hari&rdquo; dan &ldquo;20 hari&rdquo; = perubahan harga penutupan dibanding 5 / 20 sesi sebelumnya. &ldquo;Net asing 5 hari&rdquo; = selisih beli−jual asing ÷ volume 5 sesi.</li>
          <li>Kapitalisasi butuh data jumlah saham tercatat; bila belum tersedia, pilihannya nonaktif. Filter sektor menyusul setelah data sektor tersedia.</li>
        </ul>
      </HowToRead>
    </div>
  );
}
