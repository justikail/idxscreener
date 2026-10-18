import { formatCompact, formatCompactIdr, formatNumber, formatPercent, formatRatio, formatTradingDate } from "@/lib/format";

/**
 * Kartu "Sekilas": ringkasan bahasa sehari-hari dari data yang SUDAH
 * tersimpan. Kalimatnya deskriptif (apa yang terjadi), tidak pernah saran
 * beli/jual. Bila data tidak ada, kartu tetap muncul dengan alasan yang
 * jujur, bukan disembunyikan.
 */
export type Insight = {
  id: string;
  label: string;
  value: string;
  sentence: string;
  tone: "up" | "down" | "neutral" | "muted";
  href: string;
};

type Metric = { value: number | null; status: string } | undefined;

export interface InsightInput {
  close: number | null;
  sma20: number | null;
  sma50: number | null;
  yearLow: number | null;
  yearHigh: number | null;
  sessionsInYear: number;
  per: Metric;
  pbv: Metric;
  roe: Metric;
  foreign: Array<{ tradingDate: string; volume: number | null; net: number | null }>;
  broker: { date: string; endDate: string; coverage: string; topBuyer: { code: string; name: string | null; value: number } | null; topSeller: { code: string; name: string | null; value: number } | null } | null;
  insiders: Array<{ txDate: string; actionType: string }>;
  profit: { label: string; value: number; yoyPct: number | null; verified: boolean } | null;
  volume: { last: number | null; avg20: number | null };
}

const pct = (v: number) => formatPercent(v, 1).replace("+", "");

export function buildInsights(x: InsightInput): Insight[] {
  const out: Insight[] = [];

  // 1. Tren harga terhadap rata-rata.
  if (x.close !== null && x.sma20 !== null) {
    const d20 = ((x.close - x.sma20) / x.sma20) * 100;
    const above20 = d20 >= 0;
    const above50 = x.sma50 !== null ? x.close >= x.sma50 : null;
    const sentence =
      above50 === null
        ? `Harga ${above20 ? "di atas" : "di bawah"} rata-rata 20 hari. Riwayat belum cukup untuk rata-rata 50 hari.`
        : above20 && above50
          ? "Harga di atas rata-rata 20 dan 50 hari — arah beberapa minggu terakhir cenderung naik."
          : !above20 && !above50
            ? "Harga di bawah rata-rata 20 dan 50 hari — arah beberapa minggu terakhir cenderung turun."
            : `Harga ${above20 ? "di atas" : "di bawah"} rata-rata 20 hari, tetapi ${above50 ? "di atas" : "di bawah"} rata-rata 50 hari — arahnya campuran.`;
    out.push({ id: "tren", label: "Arah harga", value: `${formatPercent(d20, 1)} vs MA20`, sentence, tone: above20 ? "up" : "down", href: "#teknikal" });
  } else {
    out.push({ id: "tren", label: "Arah harga", value: "—", sentence: "Riwayat harga belum cukup (butuh ≥ 20 sesi).", tone: "muted", href: "#teknikal" });
  }

  // 2. Posisi dalam rentang setahun.
  if (x.close !== null && x.yearLow !== null && x.yearHigh !== null && x.yearHigh > x.yearLow) {
    const pos = ((x.close - x.yearLow) / (x.yearHigh - x.yearLow)) * 100;
    const where = pos >= 80 ? "dekat titik tertinggi" : pos <= 20 ? "dekat titik terendah" : "di tengah rentang";
    out.push({
      id: "rentang",
      label: x.sessionsInYear >= 240 ? "Posisi 1 tahun" : `Posisi ${x.sessionsInYear} sesi`,
      value: `${formatNumber(pos, 0)}% rentang`,
      sentence: `Harga ${where}: terendah ${formatNumber(x.yearLow)}, tertinggi ${formatNumber(x.yearHigh)}.`,
      tone: "neutral",
      href: "#teknikal",
    });
  }

  // 3. Keramaian transaksi.
  if (x.volume.last !== null && x.volume.avg20 !== null && x.volume.avg20 > 0) {
    const rel = x.volume.last / x.volume.avg20;
    out.push({
      id: "volume",
      label: "Keramaian transaksi",
      value: `${formatNumber(rel, 2)}× rata-rata`,
      sentence:
        rel >= 1.5
          ? `Volume sesi terakhir ${formatCompact(x.volume.last, 1)} lembar — jauh lebih ramai dari biasanya (20 sesi).`
          : rel <= 0.6
            ? `Volume sesi terakhir ${formatCompact(x.volume.last, 1)} lembar — lebih sepi dari biasanya (20 sesi).`
            : `Volume sesi terakhir ${formatCompact(x.volume.last, 1)} lembar — sekitar rata-rata 20 sesi.`,
      tone: "neutral",
      href: "#grafik",
    });
  }

  // 4. Valuasi.
  const ok = (m: Metric) => m && m.status === "ok" && m.value !== null;
  if (ok(x.per) || ok(x.pbv)) {
    const parts = [ok(x.per) ? `PER ${formatRatio(x.per!.value!)}` : null, ok(x.pbv) ? `PBV ${formatRatio(x.pbv!.value!)}` : null].filter(Boolean);
    const sentence = ok(x.per)
      ? `Harga saham setara ±${formatNumber(x.per!.value!, 0)} kali laba bersih setahun terakhir.${ok(x.roe) ? ` ROE ${pct(x.roe!.value! * 100)}.` : ""}`
      : `Harga ${formatRatio(x.pbv!.value!)} nilai buku (ekuitas). PER belum dapat dihitung.`;
    out.push({ id: "valuasi", label: "Valuasi", value: parts.join(" · "), sentence, tone: "neutral", href: "#fundamental" });
  } else if (x.per?.status === "not_applicable") {
    out.push({ id: "valuasi", label: "Valuasi", value: "PER tidak bermakna", sentence: "Laba 12 bulan terakhir nol atau rugi, jadi PER tidak dihitung.", tone: "muted", href: "#fundamental" });
  } else {
    out.push({
      id: "valuasi",
      label: "Valuasi",
      value: "Belum tersedia",
      sentence: "Butuh laporan keuangan 4 kuartal yang terverifikasi dan jumlah saham tercatat.",
      tone: "muted",
      href: "#keuangan",
    });
  }

  // 4. Laba kuartal terakhir.
  if (x.profit) {
    const yoy = x.profit.yoyPct;
    out.push({
      id: "laba",
      label: `Laba ${x.profit.label}`,
      value: formatCompactIdr(x.profit.value),
      sentence:
        x.profit.value < 0
          ? `Rugi bersih pada ${x.profit.label}.`
          : yoy !== null
            ? `${yoy >= 0 ? "Naik" : "Turun"} ${pct(Math.abs(yoy))} dibanding kuartal yang sama tahun lalu.`
            : x.profit.verified
              ? "Belum ada kuartal yang sama tahun lalu untuk dibandingkan."
              : "Belum terbukti angka kuartal mandiri, jadi tidak dibandingkan.",
      tone: x.profit.value < 0 ? "down" : "neutral",
      href: "#keuangan",
    });
  }

  // 5. Investor asing 5 sesi.
  const withNet = x.foreign.filter((r) => r.net !== null);
  const last5 = withNet.slice(-5);
  if (last5.length === 5) {
    const net = last5.reduce((s, r) => s + r.net!, 0);
    const vol = last5.reduce((s, r) => s + (r.volume ?? 0), 0);
    const share = vol > 0 ? (Math.abs(net) / vol) * 100 : null;
    out.push({
      id: "asing",
      label: "Investor asing · 5 sesi",
      value: `${net >= 0 ? "+" : "−"}${formatCompact(Math.abs(net), 1)} lembar`,
      sentence:
        net === 0
          ? "Pembelian dan penjualan asing seimbang."
          : `Asing lebih banyak ${net > 0 ? "membeli" : "menjual"}${share !== null ? ` — selisihnya ${formatNumber(share, 1)}% dari volume` : ""}.`,
      tone: net > 0 ? "up" : net < 0 ? "down" : "neutral",
      href: "#asing",
    });
  } else {
    out.push({ id: "asing", label: "Investor asing", value: "—", sentence: "Data transaksi asing 5 sesi terakhir belum lengkap.", tone: "muted", href: "#asing" });
  }

  // 6. Broker.
  if (x.broker && (x.broker.topBuyer || x.broker.topSeller)) {
    const when =
      x.broker.date === x.broker.endDate
        ? formatTradingDate(x.broker.date, { weekday: false })
        : `${formatTradingDate(x.broker.date, { weekday: false })} – ${formatTradingDate(x.broker.endDate, { weekday: false })}`;
    const b = x.broker.topBuyer;
    const s = x.broker.topSeller;
    out.push({
      id: "broker",
      label: "Broker paling aktif",
      value: [b ? `▲ ${b.code}` : null, s ? `▼ ${s.code}` : null].filter(Boolean).join("  "),
      sentence: `${when}: ${b ? `${b.code} net beli terbesar (${formatCompactIdr(b.value)})` : "tidak ada net beli"}${s ? `, ${s.code} net jual terbesar (${formatCompactIdr(Math.abs(s.value))})` : ""}.${
        x.broker.coverage === "complete" ? "" : " Hanya broker teratas."
      }`,
      tone: "neutral",
      href: "#broker",
    });
  } else {
    out.push({ id: "broker", label: "Broker paling aktif", value: "—", sentence: "Ringkasan broker saham ini belum diambil.", tone: "muted", href: "#broker" });
  }

  // 7. Insider.
  if (x.insiders.length > 0) {
    const latest = x.insiders.reduce((a, r) => (r.txDate > a ? r.txDate : a), x.insiders[0]!.txDate);
    const sameDay = x.insiders.filter((r) => r.txDate === latest);
    const buys = sameDay.filter((r) => r.actionType === "buy").length;
    const sells = sameDay.filter((r) => r.actionType === "sell").length;
    const other = sameDay.length - buys - sells;
    out.push({
      id: "insider",
      label: "Laporan insider terakhir",
      value: formatTradingDate(latest, { weekday: false }),
      sentence: `${sameDay.length} laporan pada tanggal itu: ${[buys ? `${buys} beli` : null, sells ? `${sells} jual` : null, other ? `${other} lainnya` : null].filter(Boolean).join(", ")} (menurut sumber).`,
      tone: "neutral",
      href: "#insider",
    });
  } else {
    out.push({ id: "insider", label: "Laporan insider", value: "—", sentence: "Belum ada laporan kepemilikan insider yang tersimpan.", tone: "muted", href: "#insider" });
  }

  return out;
}
