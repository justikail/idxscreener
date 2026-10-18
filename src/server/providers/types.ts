// Interface provider per kapabilitas (AGENTS.md §6): satu provider tidak
// harus memenuhi semua kapabilitas. M3 baru mengimplementasikan dailyBars
// untuk provider "idx". Kapabilitas lain (fundamental, profil, pengumuman)
// menyusul setelah alur ini terbukti stabil dengan data aktual.

export interface RawDailyBarRow {
  /** Kode saham persis seperti dilaporkan sumber (belum dinormalisasi/divalidasi). */
  stockCode: string;
  stockName: string | null;
  tradingDate: string; // YYYY-MM-DD, dari field tanggal sumber (bukan tanggal request)
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  previous: number | null;
  volume: number | null;
  value: number | null;
  frequency: number | null;
  /** Field mentah tambahan yang dilaporkan sumber tapi belum ada arti/unit
   * terverifikasi (mis. ForeignBuy/Sell, TradebleShares, Remarks). Disimpan
   * apa adanya untuk audit, TIDAK diinterpretasikan sebagai metrik baru
   * secara diam-diam (AGENTS.md §5, §6). */
  extra: Record<string, unknown>;
}

export interface DailyBarsFetchResult {
  requestedDate: string; // YYYY-MM-DD yang diminta
  rows: RawDailyBarRow[];
  fetchedAt: Date;
  /** true bila sumber mengembalikan array kosong. TIDAK secara otomatis berarti
   * hari libur — pemanggil (validasi) yang memutuskan berdasarkan kalender
   * bursa eksplisit, bukan diasumsikan di sini (AGENTS.md §6). */
  isEmpty: boolean;
}

export interface DailyBarsProvider {
  readonly name: string;
  fetchDailyBars(dateYmd: string): Promise<DailyBarsFetchResult>;
}
