/**
 * Glosarium istilah untuk tooltip <Term>. Ditulis untuk pemula: kepanjangan
 * (bila singkatan), arti dalam satu-dua kalimat, dan cara membacanya. Definisi
 * rumus harus sama dengan src/domain/* dan halaman /tentang — jangan menulis
 * rumus berbeda di sini.
 */
export type GlossaryEntry = {
  label: string;
  /** Kepanjangan singkatan, bila ada. */
  full?: string;
  meaning: string;
  /** Cara membaca angka / catatan penting. */
  read?: string;
};

export const GLOSSARY = {
  per: {
    label: "PER",
    full: "Price to Earnings Ratio",
    meaning: "Kapitalisasi pasar (harga × saham tercatat) dibagi laba bersih milik entitas induk 12 bulan terakhir (jumlah empat kuartal mandiri).",
    read: "Makin kecil, makin murah dibanding labanya. Bila laba ≤ 0, PER ditandai tidak bermakna — bukan berarti murah.",
  },
  pbv: {
    label: "PBV",
    full: "Price to Book Value",
    meaning: "Kapitalisasi pasar (harga × saham tercatat) dibagi ekuitas milik entitas induk pada neraca terakhir.",
    read: "PBV 1x artinya harga sama dengan nilai buku. Bila ekuitas ≤ 0, PBV tidak bermakna.",
  },
  roe: {
    label: "ROE",
    full: "Return on Equity",
    meaning: "Laba bersih milik entitas induk 12 bulan terakhir dibagi rata-rata ekuitas milik entitas induk (awal dan akhir periode 12 bulan itu).",
    read: "Mengukur seberapa efisien perusahaan menghasilkan laba dari modalnya. ROE 15% = laba Rp15 untuk setiap Rp100 modal.",
  },
  roa: {
    label: "ROA",
    full: "Return on Assets",
    meaning: "Laba bersih 12 bulan terakhir dibagi rata-rata total aset.",
    read: "Bank wajar punya ROA kecil karena asetnya sangat besar.",
  },
  npm: {
    label: "NPM",
    full: "Net Profit Margin",
    meaning: "Laba bersih dibagi pendapatan, sama-sama 12 bulan terakhir.",
    read: "NPM 10% = dari setiap Rp100 penjualan, tersisa Rp10 sebagai laba bersih.",
  },
  der: {
    label: "DER",
    full: "Debt to Equity Ratio",
    meaning: "Total liabilitas (utang dan kewajiban lain) dibagi total ekuitas.",
    read: "Makin tinggi, makin besar porsi pendanaan dari utang. Bank tidak dibandingkan dengan nonbank untuk angka ini.",
  },
  ttm: {
    label: "TTM",
    full: "Trailing Twelve Months",
    meaning: "Jumlah 4 kuartal terakhir yang berurutan — gambaran kinerja setahun penuh terakhir.",
    read: "Bila salah satu kuartal hilang, angka TTM tidak dihitung (tidak ditebak).",
  },
  rsi14: {
    label: "RSI 14",
    full: "Relative Strength Index, 14 sesi",
    meaning: "Skala 0–100 yang membandingkan besarnya kenaikan dan penurunan harga dalam 14 sesi terakhir.",
    read: "Di atas 70 sering disebut jenuh beli, di bawah 30 jenuh jual. Ini konvensi, bukan sinyal beli/jual.",
  },
  sma: {
    label: "SMA",
    full: "Simple Moving Average",
    meaning: "Rata-rata harga penutupan selama sejumlah sesi terakhir. SMA20 = rata-rata 20 sesi.",
    read: "Harga di atas SMA menandakan harga sedang lebih tinggi dari rata-rata periode itu.",
  },
  sma20: {
    label: "SMA20",
    full: "Simple Moving Average 20 sesi",
    meaning: "Rata-rata harga penutupan 20 sesi terakhir (± 1 bulan bursa).",
    read: "Menggambarkan arah harga jangka pendek.",
  },
  sma50: {
    label: "SMA50",
    full: "Simple Moving Average 50 sesi",
    meaning: "Rata-rata harga penutupan 50 sesi terakhir (± 2,5 bulan bursa).",
    read: "Menggambarkan arah harga jangka menengah.",
  },
  macd: {
    label: "MACD",
    full: "Moving Average Convergence Divergence",
    meaning: "Selisih rata-rata harga eksponensial 12 dan 26 sesi. Garis sinyalnya adalah rata-rata 9 sesi dari MACD.",
    read: "Histogram positif = MACD di atas garis sinyal (momentum menguat); negatif = sebaliknya.",
  },
  volume: {
    label: "Volume",
    meaning: "Jumlah saham yang berpindah tangan dalam satu sesi, dihitung dalam lembar.",
    read: "1 lot = 100 lembar. Volume 1 jt lembar = 10.000 lot.",
  },
  lot: {
    label: "Lot",
    meaning: "Satuan minimum jual-beli saham di Bursa Efek Indonesia.",
    read: "1 lot = 100 lembar saham.",
  },
  volume_relatif: {
    label: "Volume relatif",
    meaning: "Volume hari ini dibagi rata-rata volume 20 sesi sebelumnya.",
    read: "1,5x artinya transaksi 50% lebih ramai dari biasanya.",
  },
  volume_avg20: {
    label: "Rata-rata volume 20 sesi",
    meaning: "Rata-rata jumlah lembar yang diperdagangkan per sesi selama 20 sesi terakhir.",
  },
  nilai_transaksi: {
    label: "Nilai transaksi",
    meaning: "Total rupiah yang diperdagangkan: jumlah dari harga × lembar setiap transaksi dalam satu sesi.",
    read: "Menunjukkan seberapa ramai dan likuid sebuah saham diperdagangkan.",
  },
  sesi: {
    label: "Sesi",
    meaning: "Satu hari perdagangan bursa. Akhir pekan dan hari libur bursa tidak dihitung.",
  },
  ohlc: {
    label: "OHLC",
    full: "Open, High, Low, Close",
    meaning: "Harga pembukaan, tertinggi, terendah, dan penutupan dalam satu sesi.",
  },
  candlestick: {
    label: "Candlestick",
    meaning: "Grafik batang yang menampilkan OHLC satu sesi. Badan hijau = ditutup naik, merah = ditutup turun.",
    read: "Garis tipis di atas/bawah badan menunjukkan harga tertinggi dan terendah sesi itu.",
  },
  median: {
    label: "Median perubahan",
    meaning: "Nilai tengah perubahan harga semua saham yang diperdagangkan pada sesi terakhir, setelah diurutkan.",
    read: "Lebih tahan pencilan daripada rata-rata: satu saham yang melonjak tidak menarik angkanya.",
  },
  breadth: {
    label: "Breadth",
    meaning: "Perbandingan jumlah saham yang menguat, tetap, dan melemah pada sesi terakhir.",
    read: "Menunjukkan apakah kenaikan/penurunan terjadi merata atau hanya pada sedikit saham.",
  },
  peta_pasar: {
    label: "Peta pasar",
    meaning: "Setiap kotak adalah satu saham (60 saham paling ramai). Luas kotak sebanding dengan nilai transaksi, warna menunjukkan perubahan harga.",
    read: "Hijau naik, merah turun; makin pekat makin besar perubahannya.",
  },
  rentang_52: {
    label: "Rentang 52 minggu",
    meaning: "Harga terendah dan tertinggi selama ± setahun terakhir (250 sesi), dan posisi harga sekarang di antaranya.",
  },
  papan: {
    label: "Papan pencatatan",
    meaning: "Kelompok pencatatan saham di BEI, misalnya Papan Utama, Papan Pengembangan, atau Papan Akselerasi.",
    read: "Tiap papan punya syarat pencatatan berbeda.",
  },
  tertinggal: {
    label: "Tertinggal",
    meaning: "Data terakhir saham ini lebih lama dari tanggal data terbaru saham lain.",
    read: "Bisa karena saham tidak diperdagangkan, disuspensi, atau datanya belum masuk.",
  },
  tidak_bermakna: {
    label: "Tidak bermakna",
    meaning: "Rasio sengaja tidak ditampilkan karena angkanya menyesatkan, misalnya PER saat perusahaan rugi.",
  },
  preset: {
    label: "Preset",
    meaning: "Kumpulan aturan penyaringan yang sudah disiapkan. Setiap aturan ditampilkan apa adanya beserta ambang batasnya.",
    read: "Ambang batas adalah contoh edukatif, bukan rekomendasi.",
  },
  data_real: {
    label: "Data real",
    meaning: "Data pasar dari Pihak Ketiga yang sudah lolos pemeriksaan kami. Harga penutupan harian, bukan realtime.",
  },
  data_demo: {
    label: "Data demo",
    meaning: "Data buatan untuk pengembangan dan uji coba — bukan harga pasar sungguhan.",
  },
  eps: {
    label: "EPS",
    full: "Earnings per Share",
    meaning: "Laba bersih milik pemegang saham induk dibagi rata-rata tertimbang jumlah saham, per kuartal.",
    read: "Angka dari laporan keuangan apa adanya; bila sumber tidak melaporkan, ditampilkan kosong.",
  },
  kapitalisasi_pasar: {
    label: "Kapitalisasi pasar",
    meaning: "Nilai seluruh saham perusahaan di bursa: harga penutupan × jumlah saham tercatat.",
    read: "Jumlah saham tercatat diambil dari daftar saham Pihak Ketiga pada tanggal yang disebut; bisa berubah setelah aksi korporasi.",
  },
  asing_net: {
    label: "Net asing",
    meaning: "Volume saham yang dibeli investor asing dikurangi yang dijual, dalam lembar. Rasio = net asing 5 sesi ÷ volume total 5 sesi.",
    read: "Positif = asing lebih banyak membeli. Ini volume, bukan nilai Rupiah, dan bukan jaminan arah harga.",
  },
  broker_summary: {
    label: "Ringkasan broker",
    meaning: "Total beli dan jual per perusahaan sekuritas (broker) untuk satu rentang tanggal.",
    read: "Broker mewakili banyak nasabah; datanya tidak menunjukkan siapa pemilik akhir atau niat \"bandar\".",
  },
  seasonality: {
    label: "Pola bulanan",
    meaning: "Return tiap bulan kalender di tahun-tahun sebelumnya: penutupan akhir bulan ÷ penutupan akhir bulan sebelumnya − 1.",
    read: "Catatan masa lalu. Proporsi tahun naik bukan peluang naik di masa depan.",
  },
  harga_terakhir: {
    label: "Harga terakhir sumber",
    meaning: "Harga terakhir menurut Pihak Ketiga saat diambil oleh sistem kami, beserta tanggal transaksinya.",
    read: "Bukan realtime. Bila belum ada transaksi hari ini, yang tampil adalah penutupan sesi sebelumnya.",
  },
  insider: {
    label: "Transaksi insider",
    meaning: "Laporan perubahan kepemilikan oleh direksi, komisaris, atau pemegang saham besar sesuai sumber.",
    read: "Perubahan kepemilikan tidak selalu berarti beli/jual di pasar reguler (bisa hibah, konversi, dll.).",
  },
  realtime: {
    label: "Bukan realtime",
    meaning: "Harga yang ditampilkan adalah harga penutupan sesi terakhir, bukan harga yang bergerak saat bursa buka.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

export function isGlossaryKey(key: string): key is GlossaryKey {
  return Object.prototype.hasOwnProperty.call(GLOSSARY, key);
}
