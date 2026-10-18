# Audit Kapasitas API Arjum

Tanggal audit: **5 Oktober 2026, 16.36–16.45 WIB** (Senin, setelah bursa tutup).
Dataset terbaru penyedia: **sesi 2026-10-02** (Jumat; sesi 2026-10-05 belum
tersedia saat audit). Key yang dipakai: **satu key (`key#1`)**, tanpa rotasi.

Bukti mentah yang disanitasi:
- `docs/arjum-audit/manifest.jsonl` — 75 entri: waktu, endpoint, parameter
  nonrahasia, HTTP status, jumlah baris, metadata pagination, durasi, header
  `x-ratelimit-*`, biaya kuota per panggilan.
- `docs/arjum-audit/checkpoint.json` — fakta per langkah (tanpa isi baris; hanya
  daftar kode saham yang publik).
- `docs/arjum-capacity-audit.json` — angka terstruktur dengan status
  `exact | lower_bound | upper_bound_conditional | estimate | unknown`.
- `docs/arjum-endpoint-inventory.csv` — kontrak dan biaya per endpoint.

Status angka di dokumen ini: **pasti** = diukur langsung; **batas bawah** =
terbukti minimal; **batas atas bersyarat** = berlaku hanya bila syarat yang
disebut benar; **perkiraan** = dihitung dari data tersimpan yang terbukti
mendekati tetapi tidak identik; **belum terukur** = tidak ada bukti.

---

## 1. Jumlah instrumen terverifikasi

| Ukuran | Nilai | Status | Dasar |
|---|---|---|---|
| Kode di daftar terkini (`/api/market-cap`, `date` 2026-10-02) | **963** | pasti | 20 halaman × per_page 50 = 963 baris, metadata `total` 963, `total_pages` 20, **0 duplikat** |
| Kode di daftar 2025-01-02 | 947 | pasti | 19 halaman, metadata total 947 |
| Daftar 2020-01-02 | 671 (metadata total) | pasti | hanya halaman 1 diambil |
| Ada di daftar 2025-01-02, tidak ada kini | 17 kode: CNTB, CNTX, FORZ, FREN, HDTX, JKSW, KPAL, KPAS, KRAH, MAMI, MAMIP, MASA, MFIN, MYRX, MYRXP, NIPS, PRAS | pasti | selisih dua daftar lengkap |
| Kode yang pernah tercatat sejak 2020 | ≥ **980** | batas bawah | gabungan dua daftar lengkap; tanggal lain belum diambil (20 panggilan per tanggal) |
| Histori kode yang sudah hilang dari daftar | dapat diambil | pasti (1 sampel) | FREN: `data_available` 2020-01-02 s.d. 2025-04-16 |
| Jenis instrumen (saham biasa/preferen/waran/ETF) | belum terukur | — | respons tidak memuat jenis; daftar memuat kode non-4-huruf (GOTOM, MAMIP, MYRXP) |
| Status suspensi/delisting | belum terukur | — | tidak ada field status; hilang dari daftar ≠ terbukti delisting |

**Yang terbukti:** 963 kode di **database Arjum** per 2026-10-02 — bukan bukti
"seluruh saham BEI". Tidak ada endpoint resmi yang mendaftar semua kode yang
pernah ada; inventaris historis hanya bisa dikumpulkan dengan mengambil daftar
per tanggal (20 panggilan/tanggal), dan kode yang listing–delisting di antara
dua tanggal sampel tidak akan tertangkap.

## 2. Kontrak dan biaya — temuan yang mengubah perhitungan

1. **Setiap panggilan data memotong tepat 1 unit kuota** (pasti; 72 selisih
   berurutan `x-ratelimit-remaining`, semuanya 1, termasuk respons kosong — done-details
   tanggal tanpa data tetap memotong 1). `/api/health` **tidak** memotong kuota
   (pasti: 900 → health → 899 hanya karena panggilan pembanding).
2. **`/api/history` menerima `start_date`/`end_date`** (pasti): jendela
   2020-01-02..2020-03-31 mengembalikan 63 baris tepat di rentang itu. Audit
   browser sebelumnya (`audit-dashboard-invezgo-arjum.md` C.2: "tidak ada
   parameter rentang tanggal") **keliru**. Seluruh histori daily sejak
   `data_available.start` dapat diambil per jendela ≤500 baris.
3. **`data_available` berbeda per saham**: 38 dari 50 saham tersimpan mulai
   2020-01-02; sisanya sesuai tanggal listing (mis. AMMN 2023-07-07, CDIA
   2025-07-09, EMAS 2025-09-23). Tidak ada saham teramati mulai sebelum
   2020-01-02 (52 saham diperiksa).
4. **Done details: retensi pendek** (pasti untuk BBCA): ada data 2026-09-01
   (34.083 transaksi), **kosong** 2026-06-02, 2026-03-02, 2025-10-02,
   2024-10-02, 2020-01-02. Batas awal retensi ada di (2026-06-02, 2026-09-01]
   — tanggal pastinya belum terukur. Data yang lebih tua dari retensi tidak bisa
   diambil kembali.
5. **Total done-details ≈ `freq` histori, tidak identik**: BBCA 2026-10-02
   27.304 vs freq 27.296; BBCA 2026-09-01 34.083 vs 34.039; BBRI 2026-10-02
   38.587 vs 38.582. Biaya done-details yang dihitung dari `freq` karena itu
   berstatus **perkiraan** (sedikit di bawah nyata).
6. **Laporan keuangan**: BBCA 18 kuartal (2022Q1–2026Q2) dan 4 tahunan
   (2022–2025) — di bawah batas `limit` 40, jadi 1 panggilan cukup per
   (jenis × periode). Parameter `year` untuk periode sebelum 2022 belum diuji.
7. **Batch**: `market-cap` dengan `codes=` bekerja (3 kode → 3 baris, metadata
   `not_found`) dan `date=` memberi daftar per tanggal — tetapi hanya close,
   listed shares, market cap, turnover ratio. **Tidak ada batch untuk OHLCV,
   laporan keuangan, broker, insider, atau done details** yang teramati.
   Dokumentasi resmi (Developer Dashboard, perlu login) **tidak dibaca ulang**
   pada audit ini; daftar endpoint resmi berasal dari audit browser 18–20 Sep.
8. Tidak ada cursor, `updated_since`, ETag, atau Last-Modified yang teramati di
   respons. Tidak ada 429 dalam 75 panggilan berurutan; waktu respons 92–2.549
   ms (done-details tanggal lama paling lambat). Reset kuota 00.00 WIB
   (teks dashboard, belum diukur).

## 3. Biaya pengisian awal per dataset

Satuan: panggilan = unit kuota (1:1, pasti). `N` = 963 kode terkini, `K` = 980
kode yang diketahui (terkini + 17 yang hilang).

| Dataset | Kategori | Panggilan | Status |
|---|---|---|---|
| Daftar instrumen terkini | data mentah | **20** | pasti |
| Daftar per tanggal (inventaris delisting) | data mentah | 20 per tanggal | pasti per tanggal; jumlah tanggal = keputusan |
| OHLCV daily seluruh histori (+ foreign flow `f_buy/f_sell/n_foreign` di baris yang sama) | data mentah | **≥ 981**; ≤ **3.920** bila tidak ada saham mulai sebelum 2020-01-02 | batas bawah / batas atas bersyarat; pasti belum terukur |
| — 851 saham yang `data_available`-nya kini tersimpan (setelah backfill 5 Okt malam) | | ≤ 2.991 | batas atas bersyarat |
| OHLCV weekly / monthly | **redundan** (agregat daily) | 0 untuk arsip unik | — |
| Laporan keuangan 3 jenis × kuartalan & tahunan | data mentah | **≥ 5.880** (6 × K) | batas bawah; pasti bila tidak ada instrumen >40 periode |
| Broker summary harian per saham | agregat penyedia | 1 per saham per sesi sejak 2020-01-02 = Σ sesi semua saham; **≥ 501** (BBCA saja) | belum terukur (batas atas bersyarat 1.726.760 = K × 1.762 hari kerja) |
| Broker accumulation | **turunan/tumpang tindih** dengan broker summary | tidak dihitung dalam arsip unik | — |
| Insider | data mentah | **≥ 980**; BBCA pasti 9 halaman (85 baris) | batas bawah |
| Done details (dalam jendela retensi) | data mentah | **≥ 1.001** (3 saham-hari terukur); **≈ 437.924** untuk 752 saham × 24 sesi 2026-09-01..10-02 (dari freq, dihitung setelah backfill, 0 panggilan) | pasti (bagian terukur) / perkiraan; 106 saham + awal retensi belum terukur |
| Seasonality | **turunan** (bisa dihitung dari monthly) | 0 untuk arsip unik (963 bila diambil) | — |
| Analisis penyedia | analisis jadi, **metodologi penyedia belum diketahui** | 963 per snapshot | pasti |
| Harga terakhir | snapshot (tidak bisa mundur) | 963 per snapshot | pasti |
| Screener penyedia | snapshot harian | 1 | pasti |

**Total arsip semua dataset unik:** **belum terukur**. Batas bawah yang terbukti
= 20 + 981 + 5.880 + 501 + 980 + 1.001 + 963 + 963 + 1 = **11.290 panggilan**.
Angka sebenarnya jauh lebih besar karena done details (perkiraan 437.924 untuk
752 saham × 24 sesi) dan arsip broker summary harian — keduanya belum
terukur untuk seluruh pasar.

**Total kebutuhan fitur proyek** (OHLCV harian, rasio PER/PBV/ROE/ROA/NPM/DER
dari laba rugi + neraca kuartalan, daftar saham): 20 + [981 … 3.920] +
(2 × 963 = 1.926) = **≥ 2.927; ≤ 5.866 bersyarat**. Dengan desain sekarang
(≤500 sesi terakhir per saham, 1 panggilan): 20 + 963 + 1.926 = **2.909**
(batas bawah; pasti bila tidak ada saham >40 periode laporan).

## 4. Kebutuhan sinkronisasi

| Dataset | Mekanisme update | Panggilan per putaran | Status | Jadwal (rekomendasi) |
|---|---|---|---|---|
| OHLCV harian semua saham | ambil `limit` ≥20 per saham (overlap koreksi tanpa biaya tambahan) setelah sesi tersedia | **963** (+1 patokan di aplikasi) | pasti | sekali per hari bursa setelah data tersedia |
| Close + market cap saja (alternatif batch) | `market-cap?date=` | 20 | pasti | — (tanpa OHLV/volume) |
| Daftar saham | market-cap semua halaman | 20 | pasti | mingguan (rekomendasi) |
| Laporan keuangan (fitur proyek) | 2 per saham | 1.926 per putaran | batas bawah | frekuensi = variabel (musim laporan) |
| Laporan keuangan (semua) | 6 per saham | 5.778 per putaran | batas bawah | variabel |
| Broker summary harian | 1 per saham per sesi | 963 | pasti | per hari bursa (bila dipakai) |
| Done details semua transaksi baru | Σ ceil(total/100) per saham per sesi | **≈ 15.061** untuk 739 saham yang bertransaksi pada 2026-10-02 (dari freq); 106 saham belum tersimpan | perkiraan | per hari bursa, dalam jendela retensi |
| Insider | halaman 1 per saham | ≥ 963 | batas bawah | variabel |
| Harga intraday | `/api/price` per saham per interval | 963 × jumlah interval | pasti per putaran | interval = variabel |
| Rekonsiliasi historis | ambil ulang jendela | 1 per 500 sesi per saham | pasti per saham | variabel |

Belum ada observasi lintas beberapa hari; angka per sesi di atas tidak boleh
dibaca sebagai maksimum harian.

## 5. Kelayakan kuota

1. **Total pengisian awal**: unit = panggilan (1:1). Arsip lengkap **belum
   terukur**, batas bawah 11.290. Kebutuhan fitur proyek ≥ 2.927 (≤ 5.866
   bersyarat); desain ≤500 sesi: ≥ 2.909.
2. **Selesai dalam total 5.000?** Arsip lengkap: **tidak** (batas bawahnya
   sendiri 11.290 > 5.000). Fitur proyek: **belum dapat dipastikan** (2.927 <
   5.000 ≤ 5.866).
3. **Hari minimum dengan 5.000/hari** (batas teoretis, bukan janji): arsip
   lengkap ≥ 3 hari dari batas bawah, kenyataannya jauh lebih lama (perkiraan
   done details 752 saham × 24 sesi saja ≈ 88 hari — perkiraan, bukan batas). Fitur proyek: 1 hari
   (batas bawah) – 2 hari (batas atas bersyarat).
4. **Tambahan waktu**: tidak ada rate limit selain kuota harian yang teramati;
   respons 92–2.549 ms → 5.000 panggilan berurutan butuh puluhan menit (belum
   termasuk tulis DB); data bertambah setiap sesi (963 baris OHLCV baru/sesi);
   **done details memiliki retensi pendek** sehingga arsipnya adalah jendela
   bergeser — bila volume transaksi baru per hari melebihi kuota, arsip tidak
   pernah lengkap (volume seluruh pasar belum terukur).
5. **1.000/hari setelah backfill**: **cukup hanya untuk OHLCV harian** (963 +1
   patokan = 964; ditambah 20 pada hari refresh daftar = 984 → sisa 16–36 untuk
   retry). **Tidak cukup untuk seluruh data.**
6. **Penyebab kekurangan**: broker summary harian (+963/sesi → kurang ≥ 927/sesi
   bersama OHLCV), done details (≈ 15.061/sesi, perkiraan dari freq 739 saham), refresh
   laporan keuangan (1.926–5.778/putaran), insider (≥963/putaran), intraday
   (963/interval).
7. **Batch resmi**: hanya `market-cap` (codes ≤50 / date) untuk close & market
   cap. Tidak mengurangi kebutuhan OHLCV, keuangan, broker, insider, done
   details.
8. **Kontinuitas dengan satu key sah**: OHLCV **ya** (jendela tanggal dapat
   menutup celah sejak 2020); laporan keuangan **ya**; broker summary **ya**
   (rentang sejak 2020-01-02); done details **tidak** untuk celah lebih tua
   dari retensi; harga/analisis/screener **tidak** (snapshot, tidak bisa mundur).

## 6. Request audit yang benar-benar terpakai

**75 panggilan HTTP** (batas keras 100), 75 berhasil (HTTP 200), 0 retry, 0
error. Unit kuota pada key#1: **73 unit** untuk 73 panggilan berheader
(`remaining` 969 sesudah yang pertama → 897 sesudah yang terakhir = 72
penurunan + 1 unit panggilan pertama); 2 panggilan health tanpa biaya. Pemeriksaan database read-only
(tanpa HTTP). Tidak ada penulisan ke database aplikasi.

Kontaminasi: worker aplikasi memakai key acak, tetapi menunggu jadwal 17.00
WIB selama audit (16.36–16.45 WIB); semua penurunan `remaining` tepat 1,
tidak ada indikasi pemakaian lain pada key#1 di rentang itu. Kuota aplikasi
hari ini (126 dari counter internal) dan audit (75) memakai counter berbeda:
counter internal aplikasi tidak mengetahui panggilan audit.

## 7. Belum terukur dan cara mengukurnya

| Hal | Penyebab | Langkah | Biaya |
|---|---|---|---|
| Jumlah sesi OHLCV per saham (biaya pasti backfill) | hanya diketahui dengan mengambil data | backfill dengan `start_date/end_date` — biayanya = pengukurannya | 981–3.920 |
| Saham dengan data sebelum 2020-01-02 | baru 52 saham diperiksa | `data_available` didapat gratis di setiap respons backfill | 0 tambahan |
| Volume done details seluruh pasar per sesi | freq 106 saham belum tersimpan; freq ≠ total done-details | Σ ceil(freq/100) setelah 106 saham terisi (perkiraan, 0 panggilan); angka pasti: halaman 1 per saham per sesi | 0 / 963 per sesi |
| Batas awal retensi done details | 3 tanggal di (2026-06-02, 2026-09-01] belum diuji | pencarian biner tanggal pada 1 saham | ±7 |
| Broker summary `all_data` / kelengkapan broker | tidak diuji | 1–2 panggilan BBCA | 2 |
| Laporan keuangan sebelum 2022 (`year`) | tidak diuji | 1 panggilan BBCA `year=2020` | 1 |
| Insider per saham | per saham | halaman 1 per saham | 963 |
| Inventaris kode historis lengkap | tidak ada endpoint resmi | daftar per tanggal (mis. awal tiap bulan sejak 2020) | 20 per tanggal |
| Perilaku kuota pada 4xx/429/304 | tidak dipicu sengaja | amati saat terjadi alami (manifest) | 0 |
| Dokumentasi resmi terbaru | Developer Dashboard perlu login | dibaca pengguna/agen dengan sesi sah | 0 kuota |

Perangkat audit dapat dilanjutkan: `pnpm audit:arjum -- --live --budget=<N>`
(checkpoint melewati langkah yang selesai; langkah baru ditambahkan lewat
`extensionSteps()`), lalu `pnpm audit:arjum:report`.

## 8. Keputusan

- Dengan 1.000/hari, cakupan realistis = **OHLCV harian semua saham** (+ daftar
  mingguan). Laporan keuangan semua saham memerlukan hari terpisah atau kuota
  tambahan; broker summary, done details, insider, intraday **tidak muat**.
- 5.000/hari (bila kuota resmi ditambah) cukup untuk pengisian awal fitur
  proyek dalam 1–2 hari (bersyarat) dan sinkronisasi OHLCV + laporan keuangan
  bergilir, **tetapi tidak** untuk done details seluruh pasar.
- Aplikasi saat ini **merotasi 5 key secara acak** (lihat
  `docs/arjum-integration-status.md`). Untuk kepatuhan, gunakan satu key sah;
  budget aplikasi sudah dibatasi total ≤ satu akun.
