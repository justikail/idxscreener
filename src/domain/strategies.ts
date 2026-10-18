import type { FilterCondition, FilterField, FilterGroup } from "./filter-ast";

/**
 * Strategi menu Rekomendasi. Aturan disusun tim aplikasi (keputusan client
 * 12 Okt 2026) dan SELURUHNYA tertulis di sini: teks yang dibaca pengguna
 * dibangkitkan dari aturan yang sama dengan yang dievaluasi, jadi keduanya
 * tidak bisa berbeda. Semua memakai data HARIAN (penutupan) — tidak ada data
 * intraday. Hasil adalah daftar saham yang memenuhi aturan, BUKAN ajakan
 * membeli atau menjual.
 */

export type FieldFormat = "pct" | "pos" | "x" | "idr" | "num";

export const FIELD_META: Partial<Record<FilterField, { label: string; format: FieldFormat; hint?: string }>> = {
  price: { label: "Harga", format: "idr" },
  rsi14: { label: "RSI 14", format: "num", hint: "Kekuatan momentum 0–100; di atas 70 sering disebut jenuh beli" },
  volume_relative_20d: { label: "Volume vs rata-rata 20 hari", format: "x" },
  change_1d: { label: "Perubahan sesi terakhir", format: "pct" },
  return_5d: { label: "Kenaikan 5 hari", format: "pct" },
  return_20d: { label: "Kenaikan 20 hari (±1 bulan)", format: "pct" },
  close_position: { label: "Posisi penutupan di rentang hari itu", format: "pos", hint: "0% = tutup di harga terendah, 100% = di harga tertinggi" },
  value_avg_20d: { label: "Rata-rata nilai transaksi 20 hari", format: "idr", hint: "Ukuran likuiditas: makin besar, makin mudah jual-beli" },
  close_vs_sma20: { label: "Harga vs rata-rata 20 hari", format: "pct" },
  close_vs_sma50: { label: "Harga vs rata-rata 50 hari", format: "pct" },
  sma20_vs_sma50: { label: "Rata-rata 20 hari vs 50 hari", format: "pct", hint: "Positif = tren jangka pendek di atas tren menengah" },
  range_position_52w: { label: "Posisi di rentang 1 tahun", format: "pos", hint: "0% = di harga terendah setahun, 100% = tertinggi" },
  foreign_net_ratio_5d: { label: "Net beli asing 5 hari", format: "pct", hint: "Selisih beli−jual asing ÷ volume 5 hari" },
  broker_top3_net_ratio: { label: "Net beli 3 broker teratas", format: "pct", hint: "Dibanding nilai transaksi sesi terakhir" },
  per: { label: "PER", format: "x", hint: "Harga dibanding laba 12 bulan; makin kecil makin murah" },
  pbv: { label: "PBV", format: "x", hint: "Harga dibanding nilai buku" },
  roe: { label: "ROE", format: "pct", hint: "Laba dibanding modal sendiri" },
  der: { label: "DER", format: "x" },
  net_income_growth_yoy: { label: "Pertumbuhan laba 12 bulan", format: "pct" },
  revenue_growth_yoy: { label: "Pertumbuhan pendapatan 12 bulan", format: "pct" },
  market_cap: { label: "Kapitalisasi", format: "idr" },
};

export interface StrategyVariant {
  key: string;
  label: string;
  /** Satu kalimat: apa yang dicari varian ini. */
  idea: string;
  rules: FilterCondition[];
  sort: { field: FilterField; dir: "asc" | "desc" };
  /** Kolom yang ditampilkan di tabel hasil (selain kode & harga). */
  columns: FilterField[];
}

export interface Strategy {
  slug: string;
  name: string;
  /** Kepanjangan / nama populer. */
  alias: string;
  short: string;
  /** Penjelasan untuk pemula, 2–3 kalimat. */
  explain: string;
  /** Kapan daftar dihitung dan kapan dipakai. */
  timing: string;
  /** Batasan khusus strategi ini (selain disclaimer umum). */
  caveat: string;
  variants: StrategyVariant[];
}

const c = (field: FilterField, operator: FilterCondition["operator"], value: number): FilterCondition => ({ type: "condition", field, operator, value });

export const STRATEGIES: Strategy[] = [
  {
    slug: "bpjs",
    name: "BPJS",
    alias: "Beli Pagi Jual Sore",
    short: "Saham yang kemarin naik kuat dengan volume melonjak — untuk dipantau sejak pembukaan.",
    explain:
      "Mencari saham likuid yang pada sesi terakhir naik cukup kuat, volumenya jauh di atas biasanya, dan ditutup dekat harga tertinggi. Pola seperti ini menunjukkan minat beli yang besar dan kadang berlanjut di pagi berikutnya.",
    timing: "Dihitung setelah bursa tutup (±17.00 WIB) dari data penutupan. Dipakai sebagai daftar pantau untuk pembukaan sesi berikutnya.",
    caveat:
      "Data yang tersedia adalah penutupan harian, bukan harga berjalan. Daftar ini tidak memberi sinyal saat jam bursa; harga pembukaan bisa sudah berbeda jauh.",
    variants: [
      {
        key: "harian",
        label: "Sesi berikutnya",
        idea: "Momentum kuat di sesi terakhir.",
        rules: [
          c("value_avg_20d", "gte", 5e9),
          c("price", "gte", 100),
          c("change_1d", "gte", 0.02),
          c("change_1d", "lte", 0.2),
          c("close_position", "gte", 0.7),
          c("volume_relative_20d", "gte", 1.5),
          c("rsi14", "lte", 80),
        ],
        sort: { field: "volume_relative_20d", dir: "desc" },
        columns: ["change_1d", "volume_relative_20d", "close_position", "value_avg_20d"],
      },
    ],
  },
  {
    slug: "bsjp",
    name: "BSJP",
    alias: "Beli Sore Jual Pagi",
    short: "Saham yang ditutup sangat kuat (di dekat harga tertinggi) — pola yang dicari pemburu kenaikan pagi.",
    explain:
      "Mencari saham likuid yang ditutup di dekat harga tertinggi harinya dengan kenaikan wajar dan volume di atas biasanya, sementara investor asing tidak sedang menjual bersih. Penutupan yang kuat sering diikuti pembukaan yang lebih tinggi.",
    timing:
      "Dihitung setelah bursa tutup dari data penutupan. Karena harga final baru tersedia setelah tutup, daftar ini dipakai untuk menyiapkan pantauan sore berikutnya — cek ulang harga menjelang penutupan.",
    caveat: "Bukan sinyal menjelang penutupan hari ini: data sore hari berjalan belum tersedia di aplikasi.",
    variants: [
      {
        key: "harian",
        label: "Sesi berikutnya",
        idea: "Penutupan kuat di sesi terakhir.",
        rules: [
          c("value_avg_20d", "gte", 5e9),
          c("price", "gte", 100),
          c("change_1d", "gte", 0.01),
          c("change_1d", "lte", 0.15),
          c("close_position", "gte", 0.9),
          c("volume_relative_20d", "gte", 1.2),
          c("foreign_net_ratio_5d", "gte", 0),
        ],
        sort: { field: "close_position", dir: "desc" },
        columns: ["change_1d", "close_position", "volume_relative_20d", "foreign_net_ratio_5d"],
      },
    ],
  },
  {
    slug: "bandarmologi",
    name: "Bandarmologi",
    alias: "Jejak broker besar",
    short: "Saham yang dibeli bersih dalam jumlah besar oleh segelintir broker pada sesi terakhir.",
    explain:
      "Melihat ringkasan broker: bila tiga broker pembeli terbesar membeli bersih senilai minimal 5% dari seluruh transaksi hari itu, ada pihak yang sedang mengumpulkan saham. Harga juga harus belum jatuh jauh di bawah rata-rata 20 hari.",
    timing: "Dihitung setelah ringkasan broker sesi terakhir tersimpan (setelah penutupan).",
    caveat:
      "Broker adalah perusahaan sekuritas yang melayani banyak nasabah — ini bukan identitas “bandar”. Hanya saham yang ringkasan brokernya sudah diambil untuk sesi terakhir yang bisa diuji.",
    variants: [
      {
        key: "harian",
        label: "Sesi terakhir",
        idea: "Konsentrasi beli broker di sesi terakhir.",
        rules: [c("broker_top3_net_ratio", "gte", 0.05), c("value_avg_20d", "gte", 1e9), c("close_vs_sma20", "gte", -0.05)],
        sort: { field: "broker_top3_net_ratio", dir: "desc" },
        columns: ["broker_top3_net_ratio", "foreign_net_ratio_5d", "change_1d", "value_avg_20d"],
      },
    ],
  },
  {
    slug: "growth",
    name: "Growth",
    alias: "Saham bertumbuh",
    short: "Saham dengan tren naik (mingguan, bulanan) atau laba yang tumbuh cepat (jangka panjang).",
    explain:
      "Growth mencari saham yang sedang tumbuh. Untuk jangka pendek, yang dilihat adalah tren harga yang naik dengan dukungan volume. Untuk jangka panjang, yang dilihat adalah laba perusahaan yang tumbuh dan pengembalian modal yang tinggi.",
    timing: "Dihitung ulang setiap hari setelah pembaruan harga. Versi jangka panjang berubah saat laporan keuangan baru masuk.",
    caveat: "Versi jangka panjang butuh laporan keuangan 8 kuartal berturut-turut; saham yang laporannya belum lengkap tidak bisa diuji.",
    variants: [
      {
        key: "mingguan",
        label: "Mingguan",
        idea: "Tren naik 1 minggu terakhir dengan volume mendukung.",
        rules: [
          c("value_avg_20d", "gte", 1e9),
          c("return_5d", "gte", 0.03),
          c("close_vs_sma20", "gte", 0),
          c("rsi14", "gte", 55),
          c("rsi14", "lte", 75),
          c("volume_relative_20d", "gte", 1.2),
        ],
        sort: { field: "return_5d", dir: "desc" },
        columns: ["return_5d", "rsi14", "volume_relative_20d", "close_vs_sma20"],
      },
      {
        key: "bulanan",
        label: "Bulanan",
        idea: "Tren naik ±1 bulan, rata-rata jangka pendek di atas jangka menengah.",
        rules: [c("value_avg_20d", "gte", 1e9), c("return_20d", "gte", 0.08), c("close_vs_sma50", "gte", 0), c("sma20_vs_sma50", "gte", 0), c("rsi14", "lte", 75)],
        sort: { field: "return_20d", dir: "desc" },
        columns: ["return_20d", "close_vs_sma50", "sma20_vs_sma50", "rsi14"],
      },
      {
        key: "panjang",
        label: "Jangka panjang",
        idea: "Laba 12 bulan tumbuh ≥ 15% dengan ROE tinggi.",
        rules: [c("net_income_growth_yoy", "gte", 0.15), c("roe", "gte", 0.12), c("value_avg_20d", "gte", 5e8)],
        sort: { field: "net_income_growth_yoy", dir: "desc" },
        columns: ["net_income_growth_yoy", "revenue_growth_yoy", "roe", "per"],
      },
    ],
  },
  {
    slug: "value",
    name: "Value Investing",
    alias: "Saham murah berkualitas",
    short: "Saham yang harganya murah dibanding laba dan nilai bukunya, dengan kinerja yang sehat.",
    explain:
      "Value investing mencari saham yang dihargai pasar lebih rendah dari nilainya. Ukuran utamanya PER (harga dibanding laba) dan PBV (harga dibanding nilai buku), disaring dengan ROE agar yang murah tetap perusahaan yang menghasilkan laba.",
    timing: "Dihitung ulang setiap hari setelah pembaruan harga; berubah juga saat laporan keuangan baru masuk.",
    caveat: "Butuh laporan keuangan 4 kuartal terakhir dan jumlah saham tercatat; saham yang datanya belum lengkap tidak bisa diuji. Saham murah bisa tetap murah lama.",
    variants: [
      {
        key: "mingguan",
        label: "Mingguan",
        idea: "Murah dan sedang tertekan — kandidat pantulan jangka pendek.",
        rules: [c("per", "lte", 12), c("pbv", "lte", 1.5), c("range_position_52w", "lte", 0.35), c("rsi14", "lte", 45), c("value_avg_20d", "gte", 5e8)],
        sort: { field: "pbv", dir: "asc" },
        columns: ["per", "pbv", "range_position_52w", "rsi14"],
      },
      {
        key: "bulanan",
        label: "Bulanan",
        idea: "Murah, menguntungkan, dan harga mulai berbalik naik.",
        rules: [c("per", "lte", 12), c("pbv", "lte", 1.5), c("roe", "gte", 0.08), c("return_20d", "gte", 0), c("value_avg_20d", "gte", 5e8)],
        sort: { field: "per", dir: "asc" },
        columns: ["per", "pbv", "roe", "return_20d"],
      },
      {
        key: "panjang",
        label: "Jangka panjang",
        idea: "Wajar harganya, ROE tinggi, laba tidak menyusut.",
        rules: [c("per", "lte", 15), c("pbv", "lte", 2), c("roe", "gte", 0.12), c("net_income_growth_yoy", "gte", 0), c("value_avg_20d", "gte", 5e8)],
        sort: { field: "per", dir: "asc" },
        columns: ["per", "pbv", "roe", "net_income_growth_yoy"],
      },
    ],
  },
];

export function strategyFilter(v: StrategyVariant): FilterGroup {
  return { type: "group", operator: "and", children: v.rules };
}

export function findStrategy(slug: string): Strategy | undefined {
  return STRATEGIES.find((s) => s.slug === slug);
}

const OP_TEXT: Record<string, string> = { gte: "minimal", lte: "maksimal", gt: "lebih dari", lt: "kurang dari", eq: "sama dengan" };

export function formatFieldValue(field: FilterField, v: number | null): string {
  if (v === null) return "—";
  const fmt = FIELD_META[field]?.format ?? "num";
  const id = (n: number, d = 0) => n.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
  switch (fmt) {
    case "pct":
      return `${v > 0 ? "+" : v < 0 ? "−" : ""}${id(Math.abs(v * 100), 1)}%`;
    case "pos":
      return `${id(v * 100, 0)}%`;
    case "x":
      return `${id(v, 2)}×`;
    case "idr":
      if (Math.abs(v) >= 1e12) return `Rp${id(v / 1e12, 1)} T`;
      if (Math.abs(v) >= 1e9) return `Rp${id(v / 1e9, 1)} M`;
      if (Math.abs(v) >= 1e6) return `Rp${id(v / 1e6, 1)} jt`;
      return `Rp${id(v)}`;
    default:
      return id(v, 1);
  }
}

/** "Rata-rata nilai transaksi 20 hari minimal Rp5,0 M" — dari aturan yang sama dengan yang dievaluasi. */
export function describeRule(r: FilterCondition): string {
  const label = FIELD_META[r.field]?.label ?? r.field;
  const val = typeof r.value === "number" ? formatFieldValue(r.field, r.value).replace(/^\+/, "") : String(r.value);
  return `${label} ${OP_TEXT[r.operator] ?? r.operator} ${val}`;
}
