/**
 * Saklar fitur. Keputusan client 12 Okt 2026: aplikasi fokus pada 3 menu —
 * Kondisi Market, Detail Saham, Rekomendasi. Fitur lain DINONAKTIFKAN di
 * sini (halaman, UI, dan pengambilan datanya), BUKAN dihapus: kodenya tetap
 * ada untuk pengembangan berikutnya. Untuk mengaktifkan lagi, ubah ke `true`.
 */
export const FEATURES = {
  /** Halaman /pengumuman + bagian pengumuman (belum ada sumber data real). */
  pengumuman: false,
  /** Watchlist pribadi (/watchlist, tombol tambah). Menu akun menyusul. */
  watchlist: false,
  /** Notifikasi in-app (/notifikasi). */
  notifikasi: false,
  /** Pengingat harga/RSI (alert) + evaluasinya di worker. */
  pengingat: false,
  /** Catatan pribadi per saham. */
  catatan: false,
  /** Permintaan data oleh pengguna (/permintaan, panel Kelengkapan data, antrean worker). */
  permintaanData: false,
  /** Screener filter bebas lama (/screener); diganti menu Rekomendasi. */
  screenerKustom: false,
  /** Tab pola bulanan (seasonality) di detail saham + dataset seasonal penyedia. */
  polaBulanan: false,
  /** Transaksi insider di detail saham + dataset insiders. */
  insider: false,
  /** "Harga terakhir sumber" (dataset price) di detail saham. */
  hargaTerkini: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;

/** Dataset worker yang bergantung pada fitur nonaktif tidak diambil. */
export const DATASET_FEATURE: Record<string, FeatureKey | undefined> = {
  seasonal: "polaBulanan",
  insiders: "insider",
  price: "hargaTerkini",
};

export function datasetEnabledByFeature(dataset: string): boolean {
  const f = DATASET_FEATURE[dataset];
  return f ? FEATURES[f] : true;
}
