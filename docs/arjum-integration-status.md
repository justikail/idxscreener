# Status Integrasi Arjum di Repository

## 0. Pembaruan 5–6 Oktober 2026 (malam) — dataset tambahan

Probe `pnpm arjum:probe-extended` 6 Okt 00.01 WIB: **20 panggilan** (batas sesi
30), semua HTTP 200; header penyedia 1.000 → 981 (health tidak dihitung
penyedia). Batch `arjum-probe-ext-1791219645912`; body disimpan di
`provider_raw_snapshots` lalu diputar ulang lewat pipeline yang sama
(`pnpm jobs:replay-probe`) **dua kali**: run kedua 0 baris baru, 0 revisi.

| Endpoint | Parameter didukung (✔ diuji live) | Disimpan & dipakai | Tabel | UI | Penyedia vs lokal | Status |
|---|---|---|---|---|---|---|
| financial-statements | report_type ×3 ✔, period quarterly/annually ✔, limit ✔, year ✔ (2024 → 4 kuartal) | laporan utuh; fakta terpetakan: laba induk/total, laba operasi & sebelum pajak, EPS dasar, pendapatan (nonbank), total aset/liabilitas/ekuitas, ekuitas induk | financial_reports, financial_facts | detail: tabel kuartal + laporan lengkap; rasio PER/PBV/ROE/ROA/NPM/DER; filter screener | angka penyedia; basis kuartal, TTM, rasio dihitung lokal | fixture ✔ live ✔ tersimpan ✔ (BBCA, TLKM) UI ✔ scheduler: nonaktif |
| broker-summary | start/end_date ✔, **all_data=true ✔** (63 broker), broker_limit=200 ✔ (sama) | per broker beli/jual/net nilai (Rp) & volume (lembar); cakupan | broker_summaries, broker_summary_rows | detail: pemilih rentang tersimpan, net beli/jual | agregat penyedia; kelengkapan & satuan diuji lokal | fixture ✔ live ✔ tersimpan ✔ (BBCA 2 rentang) UI ✔ scheduler: nonaktif |
| broker-accumulation | default ✔, start/end_date + top ✔ | deret harian nval/nvol/cum per broker teratas | provider_derived_snapshots | detail: sparkline per broker | olahan penyedia (kumulatif divalidasi lokal) | fixture ✔ live ✔ tersimpan ✔ UI ✔ scheduler: nonaktif |
| insiders | page ✔ (10/halaman, total_pages); action_type: belum diuji | nama, tanggal, aksi, kepemilikan sebelum/sesudah (lembar, %), harga | insider_transactions | detail: tabel berhalaman | data penyedia apa adanya | fixture ✔ live ✔ tersimpan ✔ (20 baris BBCA, 2/9 halaman) UI ✔ scheduler: nonaktif |
| seasonal | default ✔ | return %/bulan/tahun, naik/turun/total (up_prob dibuang) | provider_derived_snapshots | detail: tabel terlipat "versi Pihak Ketiga" | olahan penyedia, **metode tidak diketahui**; lokal dihitung terpisah | fixture ✔ live ✔ tersimpan ✔ UI ✔ scheduler: nonaktif |
| price | — ✔ | last_price, source_date, market_state/label, no_trade_today, quote_age_ms, fallback | latest_quotes | detail: "harga terakhir sumber" + waktu | data penyedia; status fallback lokal | fixture ✔ live ✔ tersimpan ✔ (BBCA, fallback) UI ✔ scheduler: nonaktif |
| health | — ✔ (`{ok:true,status:"healthy"}`, biaya 0) | reachable, HTTP, durasi | provider_health_checks | admin: Pemantauan | — | live ✔ scheduler **aktif** (3 jam) |
| market-cap (kolom tambahan) | sama seperti sebelumnya | close, listed_shares, market_cap, turnover_ratio + tanggal | market_cap_snapshots | detail: kapitalisasi, saham tercatat; PER/PBV; filter | data penyedia; kapitalisasi dihitung lokal | kode ✔ uji ✔ — **belum terisi**: menunggu perawatan mingguan berikutnya (20 request setelah pembaruan harian, bila sisa kuota > 30) |
| history f_buy/f_sell/n_foreign | sama | volume asing beli/jual/net (lembar) | daily_bars.foreign_* | detail: grafik net asing; metrik & filter `foreign_net_ratio_5d`, preset | data penyedia; rasio lokal | kode ✔ uji ✔ tersimpan ✔ 284.735/285.154 baris (backfill dari raw snapshot 5 Okt, 0 request); metrik ok untuk 831 saham |

**Temuan data (bukti, bukan asumsi):**
- BBCA: Σ laba Q1–Q4 2025 = tahunan 57,563 T → kuartal **mandiri** terverifikasi.
- TLKM: 2025Q4 tidak diterbitkan sumber; dengan 8 kuartal tidak ada tahun
  lengkap → basis **belum terverifikasi** → TTM/rasio TLKM tidak dihitung. Ke
  depan laba rugi kuartalan diambil 12 periode (Q4 turunan tahunan − Q1..Q3 bila
  basis terbukti).
- EPS sumber tidak andal: TLKM 2025Q2 −58,65 dengan laba +5,2 T; 2026Q1
  4,39×10⁻⁸ (salah skala ±10⁹); grup induk EPS selalu 0. EPS hanya ditampilkan
  bila konsisten dengan laba; PER memakai kapitalisasi ÷ laba TTM.
- Neraca bank memakai grup `liabilitas_dana_syirkah_temporer_dan_ekuitas`,
  nonbank `liabilitas_dan_ekuitas`; `simpanan_nasabah` BBCA bernilai null
  padahal total liabilitas terisi → hanya total yang dipakai.
- Broker `all_data`: Σ volume beli = Σ volume jual = volume `daily_bars` BBCA
  5 Okt (89.905.700) → lengkap, satuan lembar. Tanpa parameter: 20 broker
  (±79% volume) → parsial.
- Seasonal penyedia ≠ lokal (akhir bulan ÷ akhir bulan sebelumnya) dan ≠
  open→close (cocok 3/15 bulan); bulan berjalan ikut dihitung penyedia.

**Jadwal & kuota:** satu key (rotasi dihapus), budget dipotong ke 1.000, header
`x-ratelimit-*` direkonsiliasi. Dataset tambahan nonaktif (kecuali health)
karena OHLCV memakai ±959/1.000; aktifkan per kode di panel admin
"Dataset tambahan". Contoh anggaran: laporan keuangan 4 request/saham → 957
saham ≈ 3.828 request per putaran (±4 bulan bila hanya ±30 sisa/hari).

**Scheduler:** worker systemd di VPS menjalankan dataset aktif tiap 5 menit;
terbukti otomatis untuk health setelah deploy (lihat log worker). Dataset lain
belum pernah berjalan terjadwal karena nonaktif.


Diperiksa: 5 Oktober 2026 (kode, tests, database read-only). Pasangan dokumen:
`docs/arjum-capacity-audit.md` (kapasitas) dan `docs/arjum-endpoint-inventory.csv`.

Kolom status dipisah karena buktinya berbeda: kode ada ≠ diuji ≠ dipanggil live
≠ data tersimpan ≠ dipakai UI ≠ berjalan terjadwal.

## 1. Matriks endpoint

| Endpoint | Kode | Uji fixture/mock | Dipanggil live (aplikasi) | Data real tersimpan | Dipakai fitur/UI | Terjadwal & terbukti otomatis |
|---|---|---|---|---|---|---|
| `/api/history/{code}` | ✔ `adapter.history` | ✔ client 14, validasi 18, integrasi ingest 7 + harian 8 + backfill 4 | ✔ probe 4 Okt; ingest 50 saham 4 Okt; pembaruan manual 5 Okt (2×) | ✔ 14.945 baris `daily_bars`, 50 saham | ✔ dashboard, `/saham`, detail + grafik, indikator, screener, watchlist | ✘ **belum terbukti** (lihat §4) |
| `/api/market-cap` | ✔ `adapter.marketCap` | ✔ integrasi universe (fake) | ✔ probe; `ingest --top`; `jobs:universe` 5 Okt | ✔ hanya `instruments.code/name` (957 live) | ✔ nama saham, jumlah cakupan | ✘ (refresh mingguan oleh worker belum pernah terjadi otomatis) |
| `/api/financial-statements/{code}` | ✔ `adapter.financialStatements` | ✘ | ✔ probe 1 panggilan (4 Okt) | ✘ (hanya raw snapshot probe) | ✘ — panel "Laporan keuangan belum masuk" | ✘ |
| `/api/broker-summary/{code}` | ✔ `adapter.brokerSummary` | ✘ | ✔ probe | ✘ (raw snapshot probe) | ✘ | ✘ |
| `/api/price/{code}` | ✔ `adapter.price` | ✘ | ✔ probe | ✘ (raw snapshot probe) | ✘ | ✘ |
| `/api/health`, `/api/search`, `/api/broker-accumulation`, `/api/insiders`, `/api/done-details`, `/api/seasonal`, `/api/analysis`, `/api/screener/latest` | ✘ belum diimplementasikan (hanya langkah audit) | ✘ | hanya audit 5 Okt | ✘ | ✘ | ✘ |

Tidak ada endpoint yang dipanggil saat pengguna membuka halaman (UI hanya
membaca database).

## 2. Alur logic yang berjalan

### OHLCV harian (satu-satunya data Arjum yang dipakai fitur)

```
pemicu: CLI `pnpm ingest:arjum` | `pnpm jobs:daily` | worker (hari kerja ≥17.00 WIB,
        ulang tiap jam, maks 5×) | tombol admin → baris "requested" → worker
  → GET /api/history/{code}?limit=N&frame=daily
       N = 20 rutin, membesar menurut celah (≤500); 300 untuk backfill/ingest awal
       start_date/end_date TIDAK dikirim
  → validasi (src/server/ingestion/validate-arjum-history.ts): tanggal valid,
       bukan masa depan (WIB), tidak duplikat, close tidak kosong, tidak negatif,
       harga 0 dengan volume → karantina, high ≥ low, open/close dalam [low, high],
       volume bilangan bulat (lembar). Baris janggal → data_quality_issues, tidak diperbaiki.
  → candle hari ini tidak disimpan sebelum 16.30 WIB (asumsi finalitas)
  → simpan: provider_raw_snapshots (body mentah setiap respons),
       daily_bars upsert unik (instrument, tanggal, scope, adjusted),
       hanya menimpa baris source='arjum', revision+1,
       adjustment_method='unverified', volume=lembar, value=Rupiah
  → hitung lokal (src/jobs/run.ts + src/domain/indicators.ts):
       SMA20/50, EMA12/26, RSI14 Wilder, MACD 12/26/9, volume relatif 20 sesi
       sebelumnya, harga → metric_snapshots → preset screener
  → tampil: dashboard (perubahan = close / close sesi sebelumnya, breadth dan
       median hanya saham pada sesi terakhir), detail, screener, watchlist
```

### Daftar saham

`jobs:universe` → semua halaman `/api/market-cap?per_page=50` → kode + nama ke
`instruments` (live, aktif, tanpa harga); kode yang dipakai data demo dilewati
(6). `close`, `listed_shares`, `market_cap`, `turnover_ratio` **diabaikan**.

### Data mentah vs analisis penyedia vs perhitungan lokal

| Jenis | Isi |
|---|---|
| Data mentah Arjum yang dipakai | date, open, high, low, close, volume, value, freq dari `/api/history`; code, name dari `/api/market-cap` |
| Data mentah Arjum yang diabaikan | `change`, `change_pct`, `avg`, `f_buy`, `f_sell`, `n_foreign` (hanya di raw snapshot); kolom market-cap selain code/name |
| Analisis/skor jadi Arjum | **tidak dipakai** (`/api/analysis`, `/api/screener/latest`, `/api/seasonal` — metodologi penyedia belum diketahui) |
| Dihitung aplikasi | semua indikator, perubahan harian, breadth, median, peta pasar, evaluasi screener |
| Fundamental (PER/PBV/ROE/ROA/NPM/DER) | rumus lokal ada (`src/domain/fundamentals.ts`), **tetapi 0 fakta keuangan live** → status "data belum tersedia" untuk semua saham real |
| Foreign flow, broker accumulation, seasonality | **tidak dihitung dan tidak ditampilkan** |
| Demo | 24 instrumen + 6.283 bar sintetis; disembunyikan oleh `DATA_MODE=live` |

## 3. Verifikasi database (read-only, saat audit 5 Okt 2026 ±16.50 WIB)

| Pemeriksaan | Hasil |
|---|---|
| Instrumen live | 957 (963 daftar penyedia − 6 kode bentrok demo) |
| Instrumen live dengan harga | **50** |
| Baris `daily_bars` arjum | 14.945; 2025-07-08 … 2026-10-02 |
| Per saham | 300 baris kecuali EMAS 247 (listing 2025-09-23), CDIA 299 (listing 2025-07-09), BNLI 299 |
| Celah | 1: BNLI 2026-10-01 (dikarantina: open=0 sementara low 1.875) |
| Duplikat (instrument, tanggal) | 0 |
| Kolom kosong (open/volume/value/freq) | 0 |
| Tertinggal dari sesi terakhir | 0 saham |
| Fakta keuangan live / pengumuman live | 0 / 0 |
| `metric_snapshots` live | as_of 2026-10-02, 957 saham (907 hanya status "kosong"), 399 baris ok |
| Raw snapshot arjum | 159 baris, ±1,3 MB |
| Run arjum | daily_bars 4 sukses; daily_update 2 sukses (keduanya **manual**) + 1 waiting (CLI); probe 1; universe 1 |
| **Sesudah backfill (19.49 WIB)** | 851 saham berharga, 253.540 baris, sesi terakhir 2026-10-05, 0 duplikat; 106 saham menunggu kuota berikutnya; kuota aplikasi 980/990 |

## 4. Status scheduler

| Tahap | Status | Bukti |
|---|---|---|
| Fungsi job ditulis | ✔ | `src/jobs/daily-update.ts`, `src/jobs/universe.ts`, `src/jobs/worker.ts`; jadwal murni `src/server/jobs/daily-schedule.ts` (unit 12 test) |
| Pernah dijalankan manual | ✔ | run 94 & 116 (`daily-2026-10-05-manual`), run 80 (CLI), universe run 115 |
| Konfigurasi penjadwalan | ✔ lokal | `pnpm worker` (proses panjang) atau cron `*/10 * * * * pnpm jobs:daily --scheduled` (README) |
| Scheduler benar-benar terpasang | ✘ | worker hanya proses di laptop pengembang, bukan service; **mati ±16.50 WIB 5 Okt** (lease lock berakhir 16.53) sebelum jadwal 17.00; tidak ada hosting |
| Bukti eksekusi otomatis berhasil | ✘ (saat audit) | tidak ada run berlabel `daily-2026-10-05` sampai 18.17 WIB |

**Sesudah audit (5 Okt, 18.18–19.13 WIB)** — dicatat terpisah dari kondisi audit:
- Worker dihidupkan ulang terlepas dari sesi agen → **run terjadwal pertama
  sukses otomatis** (run 118, `daily-2026-10-05`): sesi 2026-10-05, 50/50 saham.
  Ini bukti eksekusi otomatis di **laptop pengembang**, bukan di hosting.
- Lalu ditemukan tiga cacat operasional, semuanya diperbaiki:
  1. Pool koneksi worker tersangkut (`FIN-WAIT-1`), query menunggu selamanya,
     SIGTERM ikut menggantung → watchdog (keluar bila lease worker tidak
     diperpanjang > 6 menit), shutdown dibatasi 5 detik, supervisor
     `pnpm worker:loop`.
  2. Satu `ECONNRESET` saat menulis menghentikan seluruh backfill (run 120
     tertinggal "running") → kegagalan database per saham kini dicatat lalu
     dilanjutkan (berhenti setelah 5 berturut-turut); run "running" sisa proses
     terputus ditandai gagal setiap kali lock ingest didapat.
  3. Lock ingest dengan lease 3 jam tertahan oleh proses yang sudah mati →
     lock ingest kini lease 10 menit yang diperpanjang berkala
     (`withRenewingLock`, diuji integrasi).
- Backfill: 803 saham dijadwalkan 18.32 WIB, terputus pada 163 saham berharga;
  dilanjutkan 19.13 WIB (645 dari 751 sisa) dengan sisa kuota hari itu.

Catatan pemicu manual: run 116 (14.06 WIB) berlabel manual dan tidak dipicu
kode/test; satu-satunya jalur adalah tombol admin. Permintaan manual **tidak
mencatat siapa** yang memintanya.

## 5. Celah dan pekerjaan berikutnya (prioritas)

| # | Celah | Dampak | Biaya request |
|---|---|---|---|
| 1 | Worker tidak terpasang sebagai service/cron; mati bersama sesi | data berhenti diperbarui tanpa terlihat (panel admin menampilkan "Tidak berjalan") | 0 |
| 2 | `adapter.history` tidak mengirim `start_date/end_date` → backfill hanya ≤300/500 sesi terakhir, padahal data tersedia sejak 2020 | histori tidak lengkap (indikator jangka panjang, rentang 52 minggu aman; ≥2020 hilang) | 981–3.920 (satu kali) |
| 3 | Rotasi acak 5 key (`createRandomKeyPicker`) | bertentangan dengan arahan "jangan rotasi key untuk melewati pembatasan"; budget total sudah ≤ satu akun, tetapi pemakaian tersebar ke 5 penghitung | 0 |
| 4 | Counter kuota aplikasi tidak tahu pemakaian lain pada key yang sama (mis. audit 75 panggilan) | bisa salah membaca sisa kuota | 0 (baca `x-ratelimit-remaining`) |
| 5 | Laporan keuangan tidak di-ingest | semua rasio fundamental kosong untuk saham real | 1.926 per putaran (2 jenis kuartalan) |
| 6 | `listed_shares` dari market-cap diabaikan (gratis bersama daftar) | PER/PBV butuh jumlah saham | 0 tambahan |
| 7 | `f_buy/f_sell/n_foreign` tidak diproses (sudah ada di respons history) | foreign flow gratis tidak dipakai; satuan f_buy/f_sell belum dikonfirmasi | 0 tambahan |
| 8 | Patokan pembaruan harian diambil dua kali (cek + ingest) | 1 request terbuang per hari | 1/hari |
| 9 | Raw snapshot menyimpan seluruh body setiap respons | ±1,3 MB untuk 159 respons; backfill 957 × 300 baris akan jauh lebih besar di Neon | 0 |
| 10 | Permintaan manual tanpa jejak pengguna | tidak dapat diaudit siapa memakai kuota | 0 |
| 11 | Dokumentasi berbeda dengan fakta: `audit-dashboard-invezgo-arjum.md` dan `docs/data-sources.md` menyebut history tanpa rentang tanggal | keputusan backfill keliru | — (diperbarui) |

Fitur yang masih bergantung pada demo: tidak ada di mode live; data demo hanya
tampil bila `DATA_MODE` mencakup demo (E2E memakai demo). Pengumuman dan sektor
untuk saham real belum punya sumber.
