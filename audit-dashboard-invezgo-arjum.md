# Audit Dashboard: Invezgo & Arjum (IDX Edge PRO)

**Waktu audit:** Minggu, 20 September 2026, ±17:05–18:40 WIB (UTC+7).
**Kondisi pasar saat audit:** bursa tutup (akhir pekan). Sesi perdagangan terakhir: **Jumat, 18 September 2026**. Data bertanggal 18 September 2026 adalah data terbaru yang wajar, **bukan** data basi.
**Akun:** satu akun pengguna pada masing-masing platform (identitas disamarkan dalam laporan ini).
**Alat:** ekstensi browser dengan akses baca DOM, teks halaman, dan daftar request jaringan tab aktif.

**Batasan tindakan yang dipatuhi:** tidak ada pembelian, tidak ada pembuatan/penghapusan API key, tidak ada perubahan profil/paket, tidak ada penyimpanan watchlist/jurnal/portfolio/alert, tidak ada koneksi WebSocket baru, tidak ada pemindaian endpoint atau scraping massal. Dua modal pembayaran sempat terbuka secara tidak sengaja saat menelusuri FAQ dan langsung ditutup tanpa menekan tombol bayar.

---

## A. Ringkasan keputusan

### A.1 Apa yang sekarang terbukti

1. **Invezgo punya API resmi yang jauh lebih luas dari dugaan sebelumnya.** Spesifikasi `openapi.json` versi 1.2 memuat **94 path**, termasuk `/analysis/running-trade/{code}` (transaksi per-tick lengkap dengan kode broker pembeli/penjual dan tipe investor), `/analysis/order-book/{code}` (real-time maupun historis), `/analysis/queue/{code}`, `/analysis/calendar` (corporate action), `/analysis/shareholder/ksei/{code}`, `/analysis/financial-statement/{code}`, `/analysis/keystat/{code}`, dan `/screener/screen`. [EV-INV-03]
2. **Batas "2 tahun" Invezgo bersifat per-endpoint, dan tanggal awal Enterprise berbeda-beda.** Chart harga: awal 2010-01-01. Broker summary & inventory: 2016-01-01. Laporan keuangan & keystat: **2020-01-01**. KSEI: 2009-03-01. Chart indeks: 2021-01-01. Tabel intraday turunan (price-table, time-table, sankey, intraday-inventory): hanya **2 bulan**, bahkan untuk Enterprise. [EV-INV-04]
3. **Status akun Invezgo saat ini TRIAL, dan dashboard API terkunci.** `/id/setting/api` me-redirect ke `/id/subscription`. Tidak tersedia trial API key sama sekali menurut FAQ resmi. Jadi **API berbayar Invezgo tetap belum pernah diuji dengan key asli**. [EV-INV-01, EV-INV-02, EV-INV-19]
4. **Ada kontradiksi hukum di Invezgo yang belum terselesaikan.** FAQ paket Developer membolehkan penggunaan komersial "dalam bentuk tools dan bukan raw data" selama penghasilan layanan < Rp15 juta/bulan, dan membolehkan API key dibagikan ke tim. Halaman Syarat & Ketentuan justru menyatakan seluruh konten hanya untuk *personal, non-commercial use*, melarang penyalinan/penyebaran, melarang bot pengumpul data, dan menyatakan satu langganan hanya untuk satu orang. [EV-INV-16, EV-INV-17]
5. **Arjum menyimpan fundamental, dan endpoint-nya kini terkonfirmasi:** `GET /api/financial-statements/{code}?report_type=…&period=…&limit=…`. Ini menjawab pertanyaan terbuka terpenting dari analisis ihsgscreener sebelumnya. [EV-ARJ-09]
6. **Fundamental Arjum bersifat standalone per kuartal dan memiliki Q4** — berbeda dari Invezgo yang kumulatif YTD dan tidak memiliki kolom Q4 sama sekali. Ini keunggulan nyata Arjum untuk perhitungan sendiri. [EV-ARJ-09, EV-INV-09]
7. **Harga harian kedua platform identik byte-per-byte.** TLKM 14 September 2026 di kedua sisi: O 2.610 / H 2.690 / L 2.600 / C 2.690 / volume 139.730.300 lembar. Kesamaan ini **bukan** bukti akurasi; paling mungkin keduanya memakai upstream yang sama, sehingga memakai keduanya untuk saling memverifikasi tidak memberi konfirmasi independen. [EV-ARJ-08]
8. **Arjum menyimpan done detail (running trade historis) tingkat transaksi** lengkap dengan broker pembeli/penjual, tipe investor D/F, papan pasar, dan nomor order — tetapi retensinya hanya ±6 minggu (29 tanggal, 6 Agustus–18 September 2026) dan ada tanggal yang bolong. [EV-ARJ-10]
9. **Broker summary Arjum punya kedalaman 2020-01-02 s.d. 2026-09-18** (±6,7 tahun) dan dapat difilter rentang tanggal. Ini lebih dalam dari paket Invezgo reguler (2 tahun) walau lebih dangkal dari Invezgo Enterprise (2016). [EV-ARJ-11]
10. **Metodologi win rate Arjum terbuka penuh dan dapat diaudit.** Payload `/api/stocks/{code}` memuat array `personality` (per pola: sample, wr_d3, wr_d5, tp_hit_rate, cl_hit_rate, wr_event, avg_realized_ret, profit_factor, avg_mfe_5d, avg_mae_5d) dan array `events` (per sinyal: signal_date, pattern, entry_close, close_d3_ret, close_d5_ret, mfe_5d, mae_5d, tp_hit, cl_hit, exit_reason, realized_ret). Basis historis dinyatakan **sejak Januari 2020**. [EV-ARJ-12]
11. **Status Arjum saat ini FREE**, kuota 1.000 request/hari per akun (gabungan semua key), reset 00:00 WIB. Running Trade (UI maupun WebSocket) terkunci untuk paid user. Ini konsisten dengan close code 4403 yang pengguna terima sebelumnya — dan status akun **masih** belum paid pada hari audit. [EV-ARJ-01, EV-ARJ-02]

### A.2 Apa yang berubah dari investigasi sebelumnya

| Pengetahuan awal | Status setelah audit |
|---|---|
| "Ketentuan API reguler menyebut histori maksimal dua tahun" | **Dikonfirmasi dan diperhalus.** Batas 2 tahun berlaku untuk paket reguler; tiap endpoint punya `Data Awal` Enterprise sendiri (2010 / 2016 / 2020 / 2021 / 2009 / "2 bulan"). [EV-INV-04] |
| "Dokumentasi batch pernah berbeda: MAX/ELITE 3/10 vs 10/25" | **Terselesaikan.** Tampilan harga live 20 Sep 2026 menyatakan Batch: Advance —, Prime —, **MAX 10, ELITE 25**. FAQ di halaman yang sama juga menyebut 10 dan 25. [EV-INV-15] |
| "Enterprise belum terbukti mengizinkan website publik" | **Masih belum terbukti**, tetapi kini ada angka konkret: paket Developer diizinkan komersial "berbentuk tools" sampai omzet Rp15 juta/bulan; di atas itu wajib Enterprise. Tidak ada kalimat eksplisit soal *website publik gratis*. [EV-INV-16] |
| "Identitas endpoint fundamental Arjum belum terkonfirmasi" | **Terkonfirmasi**: `/api/financial-statements/{code}`. [EV-ARJ-09] |
| "Tarif Arjum dari bundle JavaScript" | **Cocok dengan tampilan live.** Starter Rp5.000/+5.000, Basic Rp10.000/+10.000, Popular Rp20.000/+20.000, Pro Rp50.000/+50.000, custom minimal Rp5.000 dengan rasio Rp1 = +1 request/hari, semuanya berlaku 30 hari. [EV-ARJ-03] |
| "Semua paket upgrade termasuk bonus Running Trade beta" | **Terkonfirmasi di UI**, bukan hanya di bundle: "Bonus: Running Trade (uji coba) — Semua paket upgrade otomatis mendapat akses Running Trade … Fitur ini sedang dalam fase uji coba dan dapat berubah tanpa pemberitahuan." [EV-ARJ-03] |
| "`cached_for_seconds: 86044` — definisi belum diketahui" | **Bukan sisa TTL dan bukan umur cache.** Nilainya tetap 86044 pada dua pemanggilan berjarak 25 detik, dan juga sama dengan nilai yang pengguna terima pada 18 September. Field ini tidak bisa dipakai menilai kesegaran data; gunakan field `date`. [EV-ARJ-13] |
| "wr_event, potential, drawdown bernilai null" | **Kolom yang kosong di API juga kosong di dashboard** (badge "WR -", "Potensi +-", "DD -"). Penyebabnya dinyatakan platform sendiri: bucket AKUMULASI SENYAP adalah "versi base-only, belum ada edge historis khusus". Namun statistik pola tetap tersedia di `/api/analysis/{code}` dan `/api/stocks/{code}`. [EV-ARJ-14, EV-ARJ-12] |
| "Dua saham di screener Arjum" | **Benar-benar hasil seleksi.** Teks mentah: 963 terdata, 280 likuid, 683 skip, runtime 1,0 detik. [EV-ARJ-14] |

### A.3 Apa yang masih menghalangi pemilihan sumber

1. **Kontradiksi ToS vs FAQ Invezgo.** Tidak boleh dipakai untuk website publik sebelum ada konfirmasi tertulis dari Invezgo. Ini penghalang nomor satu.
2. **Tidak ada satu pun bukti asal-usul data (upstream) di kedua platform.** Tidak ada penyebutan lisensi IDX, KSEI, atau vendor data, tidak ada kewajiban atribusi, tidak ada klausul retensi. Ketiadaan larangan **bukan** izin. Nama "IDX Edge" tidak boleh ditafsirkan sebagai afiliasi Bursa Efek Indonesia.
3. **Arjum tidak punya ketentuan komersial sama sekali.** ToS-nya (30 Juli 2026) hanya 5 pasal, tanpa pasal redistribusi, atribusi, SLA, atau retensi. Untuk website publik ini justru lebih berisiko daripada aturan yang eksplisit, karena penyedia bisa mengubah ketentuan "sewaktu-waktu tanpa pemberitahuan sebelumnya" (pasal 5). [EV-ARJ-17]
4. **Ingestion dari server belum teruji untuk keduanya.** Semua observasi audit ini berasal dari konteks browser yang sudah login. Perilaku dari IP server produksi (tanpa header Origin/Referer, tanpa cookie) belum diketahui.
5. **Kualitas fundamental Invezgo dipertanyakan oleh penyedianya sendiri.** Dokumentasi `/analysis/keystat/{code}` memuat peringatan: "Endpoint ini sedang mengalami proses aktualisasi untuk perhitungan yang lebih akurat. Data yang disajikan saat ini mungkin kurang tepat." Dashboard membenarkannya: banyak metrik bernilai 0,00 untuk periode lampau. [EV-INV-05, EV-INV-10]
6. **Fundamental Arjum tertinggal satu kuartal.** Laporan terbaru untuk BBCA, TLKM, SOCI, dan HRTA semuanya berhenti di **Q1 2026**, padahal `fetched_at` 13 September 2026 dan Q2 2026 sudah tersedia di Invezgo. [EV-ARJ-09]
7. **Batas kuota vs kebutuhan cakupan pasar.** Running trade Invezgo dipaginasi maksimal 150 baris/request; satu hari BBCA saja ±26.800 transaksi beli. Kuota bulanan tertinggi (Elite, 320.000 req/bulan) tidak cukup untuk running trade seluruh pasar. [EV-INV-22, EV-INV-12]

---

## B. Matriks fitur kedua platform

### B.1 Invezgo — yang SUDAH diperiksa

| Fitur | URL | Manfaat | Input/filter | Output | Tanggal/periode | Akses (akun TRIAL) | Jenis informasi | Jalur API resmi |
|---|---|---|---|---|---|---|---|---|
| Beranda / feed sosial | `/id/dashboard` | Feed berita, postingan, prediksi komunitas | Tab Semua/Postingan/Berita/Keterbukaan Informasi/Prediksi/Disukai/Favorit/Transaksi | Postingan, berita, widget Top Mover, rekomendasi pengguna | Berita ber-timestamp (20 Sep 2026 16:00); widget mover "Updated 2026-09-18" | Berhasil | Konten komunitas + berita | `/posts/*` |
| Workspace | `/id/workspace/{code}` | Kanvas widget yang bisa disusun (Chart + Broker Summary) | Tambah/hapus widget, kunci layout | Chart + tabel broker | Data 18 Sep 2026 | Berhasil (memanggil `PUT /users/workspace` saat dibuka) | Data mentah + agregat | Tidak ada endpoint publik untuk layout; data dari `/analysis/*` |
| Broker Summary Saham | `/id/analysis/summary/stock/{code}?transaction=true&investor=all` | Ringkasan beli/jual per broker | Rentang tanggal, papan (Reguler/…), investor (All/Asing/…), toggle Net | Tabel BC/BLot/BVal/BFrq/BAvg vs SC/SLot/SVal/SFrq/SAvg, total, legend Zombie/Asing/Ritel/Institusi, 4 chart ringkasan, tombol Analisa AI | 18 Sep 2026 – 18 Sep 2026 | Berhasil | Data mentah agregat + klasifikasi turunan | `/analysis/summary/stock/{code}` |
| Laporan Keuangan + Key Statistics | `/id/analysis/finance/{code}` | Laporan keuangan & rasio | Jenis laporan (mis. Laporan Arus Kas), periode (Kuartal), jumlah periode (8), pencarian baris, Format, Ekspor CSV | Tabel hierarkis + tabel Key Statistics 26 baris | Kolom Q2 2026, Q1 2026, Q3 2025, Q2 2025, Q1 2025, Q3 2024, Q2 2024, Q3 2023 (berlubang, tanpa Q4) | Berhasil tapi **banyak sel 0,00** | Data mentah + rasio turunan | `/analysis/financial-statement/{code}`, `/analysis/keystat/{code}` |
| Insider | `/id/analysis/insider` | Transaksi pemegang pengendali dari keterbukaan informasi | Rentang tanggal, "Lihat" | Tabel tanggal/kode/nama/sebelum/sesudah/perubahan | 05–20 Sep 2026; baris terbaru **19 Sep 2026 (Sabtu)** | Berhasil | Data mentah (keterbukaan IDX) | `/analysis/shareholder-insider`, `/analysis/insider-chart/{code}` |
| Pemegang Saham | `/id/analysis/shareholder/{code}` | Komposisi kepemilikan | Kode saham | Komposisi 17 pemegang + peran (P/K/D/A); tabel >1% dengan Nat/Dom, Scripless, Scrip, Total, %; Jumlah Pemegang Saham; peta Relasi Investor berlabel KSEI/IDX/UBO/Subsidiary/Other | **Hanya "terakhir", tanpa tanggal eksplisit di UI** | Berhasil | Data mentah KSEI/IDX + relasi turunan | `/analysis/shareholder/{code}`, `/analysis/shareholder/ksei/{code}`, `/analysis/shareholder/classification/{code}` |
| Tape Reading | `/id/analysis/tape-reading/{code}` | Replay candle + order book intraday | Tanggal, timeframe (TRIAL: 1h), kontrol replay 0.5x/1x/2x, level order book (Top 10), Horizontal/Vertical | Chart + order book 10 level (Freq/Lot/Bid/Ask/Lot/Freq), Rasio candle hijau, Gerak terbaru, Lonjakan volume, Close terakhir | 18 Sep 2026, posisi replay 08:00 | Berhasil, **granularitas dibatasi paket** (TRIAL/Starter 1h; Basic 30m; Pro/Ultra 1m–30m) | Data mentah order book historis | `/analysis/order-book/{code}`, `/analysis/intraday-data/{code}`, `/batch/order-book/{code}` |
| Powerful Intraday | `/id/analysis/realtime/{code}?scope=volume` | Aliran beli/jual intraday | Tanggal, scope (Volume (Lembar)/…), parameter numerik | Momentum Chart (Tekanan beli %, Beli/Jual terbaru, Lonjakan volume), Tabel Harga per fraksi harga dengan "Bacaan" Akumulasi/Distribusi/Seimbang, Tabel Waktu per 5 menit dengan status Buyer/Seller dominan | 18 Sep 2026, data hingga 16:15 | Berhasil | Agregat + label turunan | `/analysis/momentum-chart/{code}`, `/analysis/price-table/{code}`, `/analysis/time-table/{code}` |
| Chart | `/id/chart/{code}` | Charting penuh | Timeframe, indikator, rentang 3Y/6M/1M/ALL | Candlestick TradingView Charting Library (self-hosted), zona waktu UTC+7 | ALL menampilkan data mingguan hingga sekitar 2011 | Berhasil | Data mentah harga | `/analysis/chart/stock/{code}` |
| Screener | `/id/screener` | Penyaringan saham dengan formula sendiri | Editor formula (mis. `close > prev && value > 500000000`), Builder, Kategori Indeks, preset Pribadi/Publik/Keanggotaan, filter kode, Baris per halaman | Tabel Kode/Prev/Price/Value; contoh hasil 130 baris | Harga penutupan hari bursa terakhir | Berhasil; preset **Publik** berisi banyak "WiseTrader Screener"; preset **Keanggotaan** kosong | Hasil screening (turunan) | `/screener/screen`, `/screener`, `/screener/{id}` |
| Live Alert | `/id/live-alert` | Alert otomatis berbasis formula yang sama | Editor/Builder formula, Kategori Indeks, Test, Simpan | Alert tersimpan | Real-time | Berhasil (tidak disimpan saat audit); jumlah formula dibatasi paket (Trial 2, Starter —, Basic 7, Pro 15, Ultra 30) | Aturan turunan milik pengguna | `/alerts`, `/alerts/test`, `/alerts/{id}` |
| Panduan Formula | modal di Screener/Live Alert | Katalog variabel lengkap (±38.900 karakter) | — | Dokumentasi OHLCV multi-timeframe, order book, broker summary, haka/haki, trade size, flow, shareholder, pivot/fibonacci, KSEI, free float, insider, keystats, 50+ pola candlestick, 65+ chart pattern, fungsi matematika, catatan penting | — | Berhasil | Dokumentasi | Sebagian besar variabel punya padanan endpoint |
| Market Mover | `/id/analysis/market-mover?date=…&filter=top-gainer` | Daftar penggerak pasar | Tanggal, filter, List/Heatmap | 215 baris; **termasuk waran** (mis. CYBR-W) | 18 Sep 2026 | Berhasil | Data mentah terurut | `/analysis/top/change`, `/analysis/top/foreign`, `/analysis/top/accumulation`, `/analysis/top/ritel` |
| Langganan | `/id/subscription` | Paket Consumer & Developer | Toggle Consumer/Developer, Bulan/Tahun, "Butuh durasi fleksibel?" (2–60 bulan) | Tabel harga + matriks fitur + Q&A | — | Berhasil | Informasi komersial | — |
| API Dashboard | `/id/setting/api` | Kuota, reset, pembuatan key | — | — | — | **Terkunci** — redirect ke `/id/subscription` | — | `/usage/api`, `/usage/logs` |

### B.2 Invezgo — BELUM diperiksa

Asisten AI (`/id/ai`), Watchlist (`/personal/watchlist`), Jurnal & Ringkasan Jurnal, Portofolio & Ringkasan Portofolio, Perdagangan & Ringkasan Perdagangan, Broker Summary Broker (`/analysis/summary/broker/{broker}`), Broker Stalker (`/analysis/stalker/broker/{broker}`), Inventory Chart Saham & Broker (`/analysis/inventory/...`), Intraday Super Flow (`/analysis/intraday/{code}?range=5&board=RG`), Performa Harga (`/analysis/performance/{code}`), Sector Stalker (`/analysis/stalker/sector/COMPOSITE`), Rotasi Sektor (`/analysis/rotation/sector/COMPOSITE`), Video (`/videos`), halaman Space per saham (`/space/{code}`), Pengaturan, Referral, halaman `docs.invezgo.com/api`.

### B.3 Arjum (IDX Edge PRO) — yang SUDAH diperiksa

| Fitur | URL | Manfaat | Input/filter | Output | Tanggal/periode | Akses (akun FREE) | Jenis informasi | Jalur API resmi |
|---|---|---|---|---|---|---|---|---|
| Screener "Daily Trading Edge" | `https://stock.arjum.com/` | Daftar saham hasil screener harian | Chip kategori (ALL / Watchlist / bucket), pengurutan (Winrate ↓, Potensi ↓, Drawdown ↓, Nama A-Z, Kode A-Z), filter teks kode | Kartu per saham: bucket, ringkasan simbol, badge WR/Potensi/DD, catatan; header Total Saham & Top Winrate | "Jumat, 18 September 2026"; badge "Weekend" di logo | Berhasil | **Hasil screening** (turunan), bukan data mentah | `/api/screener/latest` |
| Detail saham | `https://stock.arjum.com/` → klik kartu / pencarian | Halaman analisa satu saham | Indikator MA/VOL/MACD, rentang 1m/3m/6m/1y/3y/5y, toggle Broker Accum, rentang tanggal broker | Chart, Seasonality Pattern (2020–2026 per bulan + Year Avg), Market Quote (harga, rentang hari, open, Total Lot, Nilai, Frekuensi, batas ARA/ARB), Broker Summary (Net/ALL/Foreign/Domestic), Laporan Keuangan, Pattern Personality, Insider | 18 Sep 2026 | Berhasil | Campuran: data mentah + statistik historis + label | `/api/stocks/{code}`, `/api/history/{code}`, `/api/broker-summary/{code}`, `/api/seasonal/{code}`, `/api/financial-statements/{code}`, `/api/insiders/{code}`, `/api/analysis/{code}`, `/api/done-details` |
| Running Trade | `/running-trade` (via header) | Stream transaksi real-time | — | — | — | **Terkunci**: "Fitur ini sedang dalam fase uji coba dan saat ini hanya tersedia untuk paid user" | — | WebSocket `wss://stock.arjum.com/ws/running-trade` |
| API Keys Saya | Developer Dashboard → API Keys | Kelola API key | Nama key, Generate, Revoke | 1 key "Testing", tier FREE, prefiks `sk_live_…`, dibuat 20/9/2026, label "1.000 req/hr" | — | Berhasil (tidak ada key dibuat/dicabut saat audit) | Kredensial | — |
| Usage Analytics & Limit | Developer Dashboard → Usage | Pantau kuota | Tambah Limit, Refresh Limit | "Akun: FREE PLAN", 0 / 1.000 req/hari, Sisa Kuota Hari Ini 1.000 req, Total Request Bulan Ini 0 req, "Reset otomatis setiap hari pukul 00:00 WIB", "Limit harian berlaku per akun (FREE) untuk semua API Key gabungan" | Harian, reset 00:00 WIB | Berhasil | Data akun | `/api/keys/usage` (dari analisis bundle sebelumnya; tidak diverifikasi ulang) |
| Dokumentasi API | Developer Dashboard → Dokumentasi API | Explorer interaktif | Pemilihan endpoint, contoh kode cURL/Python/JavaScript/Node/PHP/Go, Live Request Tester | 12 endpoint terdokumentasi + tabel parameter + contoh JSON | — | Berhasil | Dokumentasi | — |
| WebSocket | Developer Dashboard → WebSocket | Dokumen stream running trade | — | Cara koneksi, contoh Python/Node, tabel close code 4401/4403/4408, format pesan snapshot/trade/top5, Catatan Penting | — | Dokumentasi dapat dibaca; stream sendiri terkunci | Dokumentasi | `wss://stock.arjum.com/ws/running-trade` |
| Landing Page | `/landing` | Pemasaran + FAQ | — | Klaim "900+ Saham IDX Terindeks", "8 REST API Endpoints", kuota gratis reset 00:00 WIB | — | Berhasil | Pemasaran | — |
| Ketentuan Layanan | `/terms` | Syarat layanan | — | 5 pasal, terakhir diperbarui 30 Juli 2026 | — | Berhasil | Hukum | — |
| Kebijakan Privasi | `/privacy` | Privasi | — | Email/nama/foto Google, log penggunaan API, JWT/API key, HTTPS | — | Berhasil | Hukum | — |

### B.4 Arjum — BELUM diperiksa

Watchlist (chip Watchlist 0; penyimpanan tampak lokal di `localStorage` kunci `idx_watchlist` sehingga kemungkinan tidak tersinkron ke server — belum diverifikasi), halaman hasil pencarian saham, tampilan Mode Terang, endpoint `/api/search` dan `/api/health` (tidak dipanggil ulang saat audit), perilaku screener pada hari bursa aktif, isi bucket selain AKUMULASI SENYAP.

---

## C. Inventaris endpoint

Klasifikasi yang dipakai:
**(1) API resmi pelanggan** · **(2) Endpoint internal dashboard** · **(3) Widget/layanan pihak ketiga** · **(4) File snapshot** · **(5) WebSocket**

> Catatan penting: seluruh observasi request di bawah berasal dari **konteks browser yang sudah login**. Endpoint yang bekerja dengan sesi login **belum otomatis cocok** untuk ingestion server.

### C.1 Invezgo

| Host/path | Method | Parameter | Autentikasi | Status teramati | Content-Type | Kategori | Bukti |
|---|---|---|---|---|---|---|---|
| `api.invezgo.com/openapi.json` | GET | — | tidak ada | 200 | JSON | (1) | EV-INV-03 |
| `api.invezgo.com/analysis/chart/stock/{code}` | GET | `from`, `to` (YYYY-MM-DD) | Bearer dari sesi dashboard **atau** API key | 200 dengan Bearer; **401 "Anda harus login terlebih dahulu"** tanpa header | JSON | (1)+(2) | EV-INV-06 |
| `api.invezgo.com/analysis/list/stock` | GET | — | Bearer/API key | 200, array 1.203 objek | JSON | (1) | EV-INV-08 |
| `api.invezgo.com/users/session` | GET | — | sesi | dipanggil halaman | JSON | (2) | EV-INV-25 |
| `api.invezgo.com/users/chart` | GET | — | sesi | dipanggil halaman | JSON | (2) | EV-INV-25 |
| `api.invezgo.com/users/workspace` | PUT | body layout | sesi | 201 | JSON | (2) — **operasi tulis**, dipicu otomatis saat membuka Workspace | EV-INV-25 |
| `invezgo.com/{locale}/...?_rsc=…` | GET | `_rsc` | cookie sesi | 200 / 503 (prefetch) | RSC payload | (2) | EV-INV-25 |
| `invezgo.com/static/charting_library/*` | GET | — | — | 200 | JS/CSS | (3) TradingView Charting Library **self-hosted** — pustaka tampilan, datafeed tetap milik Invezgo | EV-INV-20 |
| iframe `snap-midtrans` | — | — | — | dimuat di halaman | — | (3) gateway pembayaran Midtrans | EV-INV-20 |
| `static.cloudflareinsights.com/beacon.min.js` | GET | — | — | 200 | JS | (3) analitik | EV-INV-20 |
| PostHog (kunci `ph_phc_…` di storage) | — | — | — | aktif | — | (3) analitik produk | EV-INV-20 |

**Skema respons `/analysis/chart/stock/{code}`** (teramati): array objek `{date: "2026-09-14T00:00:00.000Z", open: 2610, high: 2690, low: 2600, close: 2690, volume: "139730300"}`. `volume` bertipe **string**. Tidak ada `value`, tidak ada `frequency`, tidak ada penanda adjusted/unadjusted. Tidak ada pagination; rentang dikendalikan `from`/`to`.

**Skema `/analysis/list/stock`**: array `{code, name, sector, logo}`. 1.203 entri = 976 kode 4 huruf + 227 kode waran/rights (akhiran `-W`, `-W3`, `-W4`, `-R`). Sektor: Barang Konsumen Non-Primer 212, Barang Konsumen Primer 155, Barang Baku 132, Keuangan 130, Properti & Real Estat 125, Energi 108, Perindustrian 89, Infrastruktur 86, Teknologi 65, Transportasi & Logistik 54, Kesehatan 47.

**Permukaan API resmi Invezgo — 94 path**, kelompok utama:

- Daftar & referensi: `/analysis/list/stock`, `/analysis/list/broker`, `/analysis/list/index`, `/analysis/notation`, `/analysis/information/{code}`, `/search`, `/search/stock`, `/search/user`
- Top/ranking: `/analysis/top/change`, `/top/foreign`, `/top/accumulation`, `/top/ritel`
- Intraday & order flow: `/analysis/running-trade/{code}`, `/analysis/intraday/{code}`, `/analysis/order-book/{code}`, `/analysis/queue/{code}`, `/analysis/intraday-data/{code}`, `/analysis/intraday-index/{code}`
- Chart: `/analysis/chart/stock/{code}`, `/chart/index/{code}`, `/chart/multi-time/{code}`, `/chart/stock/{indicator}/{code}`
- Kepemilikan: `/analysis/shareholder-detail/{code}`, `/shareholder-detail-one`, `/shareholder/high`, `/shareholder/number/{code}`, `/shareholder/relation`, `/shareholder/{code}`, `/shareholder/ksei/{code}`, `/shareholder/classification/{code}`, `/shareholder/classify-table/{code}`, `/shareholder-above`, `/shareholder-above-chart/{code}`, `/shareholder-one`, `/shareholder-one-chart/{code}`
- Broker: `/analysis/summary/stock/{code}`, `/summary/broker/{code}`, `/stalker/broker/{broker}/{stock}`, `/stalker/list/{code}`, `/summary-chart/stock/{code}`, `/summary-chart/broker/{code}`, `/inventory-chart/stock/{code}`, `/inventory-chart/broker/{code}`
- Sektor: `/analysis/stalker/sector`, `/analysis/sector/rotation`
- Turunan intraday: `/analysis/momentum-chart/{code}`, `/intraday-inventory-chart/{code}`, `/sankey-chart/{code}`, `/price-table/{code}`, `/time-table/{code}`, `/price-diary/{code}`, `/price-seasonality/{code}`
- Insider & fundamental: `/analysis/shareholder-insider`, `/insider-chart/{code}`, `/financial-statement/{code}`, `/financial-statement-chart/{code}`, `/keystat/{code}`, `/keystat-chart/{code}`, `/analysis/calendar`
- Batch: `/batch/order-book/{code}`, `/batch/intraday-data/{code}`, `/batch/intraday-index/{code}`
- Screener: `/screener/screen`, `/screener`, `/screener/{id}`
- Kuota: `/usage/api`, `/usage/api/sync`, `/usage/logs`
- Data pribadi pengguna: `/watchlists*`, `/journals*`, `/portfolios*`, `/alerts*`, `/posts*`, `/trades*`

**Batas historis & jadwal pembaruan menurut dokumentasi** (reguler = 2 tahun terakhir; tanggal di bawah adalah `Data Awal` untuk Enterprise):

| Endpoint | Data Awal (Enterprise) | Update |
|---|---|---|
| `/analysis/chart/stock/{code}` | 2010-01-01 | Realtime |
| `/analysis/chart/index/{code}` | 2021-01-01 | Realtime |
| `/analysis/chart/stock/{indicator}/{code}` | 2010-01-01 | EOD 18:00 WIB |
| `/analysis/top/*` | 2010-01-01 | EOD setelah 18:00 WIB |
| `/analysis/summary/stock|broker/{code}` | 2016-01-01 | EOD 18:00 WIB |
| `/analysis/stalker/*`, `/summary-chart/*`, `/inventory-chart/*` | 2016-01-01 | EOD 18:00 WIB |
| `/analysis/stalker/sector`, `/analysis/sector/rotation` | 2010-01-01 | setelah penutupan pasar |
| `/analysis/momentum-chart/{code}` | 2010-01-01 | Real-time |
| `/analysis/price-diary/{code}`, `/price-seasonality/{code}` | 2010-01-01 | EOD 18:00 WIB |
| `/analysis/price-table/{code}`, `/time-table/{code}`, `/sankey-chart/{code}`, `/intraday-inventory-chart/{code}` | **hanya 2 bulan kebelakang** | Real-time / EOD |
| `/analysis/shareholder/ksei/{code}` | 2009-03-01 | tanggal 02 setiap bulan |
| `/analysis/shareholder*` (non-KSEI) | — | bulanan sesuai laporan perusahaan |
| `/analysis/financial-statement/{code}` | **2020-01-01** | sesuai laporan perusahaan |
| `/analysis/keystat/{code}` | **2020-01-01** | sesuai laporan perusahaan |
| `/analysis/order-book/{code}` | — | Real-time (tanpa date/time) atau Historical (dengan date/time) |
| `/analysis/intraday-data/{code}` | — | Real-time (tanpa date) atau Historical (dengan date) |

**`/analysis/running-trade/{code}`** — parameter terdokumentasi: `date` (YYYY-MM-DD, default hari ini), `page` (default 1), `limit` (**maksimal 150**, default 50), `type` (ALL/BUY/SELL), `orderby` (TIME/PRICE/VOLUME), `minimum`/`maximum` (volume dalam **lembar**), `market` (ALL/NG/RG/TN), `pricefrom`/`priceto`, `timefrom`/… Data yang disediakan: waktu transaksi, harga, volume (lembar), jenis aksi BUY/SELL, **kode broker pembeli & penjual beserta tipe investor**, jenis pasar.

### C.2 Arjum

| Host/path | Method | Parameter | Autentikasi | Status teramati | Content-Type | Kategori | Bukti |
|---|---|---|---|---|---|---|---|
| `stock.arjum.com/api/screener/latest` | GET | — | `X-API-Key` **atau** JWT sesi web | 200 dengan Bearer sesi | JSON | (1) | EV-ARJ-14 |
| `/api/analysis/{code}` | GET | — | opsional (200 tanpa auth dari browser) | 200 | JSON | (1) | EV-ARJ-06, EV-ARJ-12 |
| `/api/broker-summary/{code}` | GET | `code`*, `start_date`, `end_date`, `net` (bool), `broker_limit` (min 1, default 20), `level_limit` (min 1, default 25), `all_data` (bool) | opsional | 200 | JSON | (1) | EV-ARJ-11 |
| `/api/broker-accumulation/{code}` | GET | `code`*, `start_date`, `end_date`, `top` (1–5, default 3), `brokers` (dipisah koma) | opsional | belum dipanggil | JSON | (1) | dokumentasi |
| `/api/history/{code}` | GET | `code`*, `limit` (min 20, **max 500**, default 120), `frame` (`daily`/`weekly`/`monthly`) | **tidak wajib** | 200 tanpa auth | JSON | (1) | EV-ARJ-06, EV-ARJ-07 |
| `/api/seasonal/{code}` | GET | `code`* | opsional | 200 | JSON | (1) | EV-ARJ-06 |
| `/api/market-cap` | GET | `page` (default 1), `per_page` (min 1, **max 50**, default 25), `date` | opsional | 200 | JSON | (1) | EV-ARJ-16 |
| `/api/search` | GET | (autocomplete) | opsional | belum dipanggil | JSON | (1) | dokumentasi |
| `/api/health` | GET | — | tidak ada | 200 (uji pengguna sebelumnya) | JSON | (1) | pengetahuan awal |
| `/api/financial-statements/{code}` | GET | `report_type` (`INCOME_STATEMENT`\|`BALANCE_SHEET`\|`CASH_FLOW_REPORT`), `period` (`quarterly`\|`annually`), `limit` (**max 40**) | **tidak wajib** | 200 tanpa auth | JSON | (1) | EV-ARJ-09 |
| `/api/insiders/{code}` | GET | `limit`, `page` | opsional | 200 | JSON | (1) | EV-ARJ-06 |
| `/api/done-details` | GET | `code`*, `date`, `page`, `per_page` (1–100, default 100) | **tidak wajib** | 200 tanpa auth | JSON | (1) | EV-ARJ-10 |
| `/api/done-details/dates` | GET | `code` | tidak wajib | 200 | JSON | (2) — tidak ada dalam daftar 12 endpoint resmi | EV-ARJ-10 |
| `/api/stocks/{code}` | GET | `days` | tidak wajib | 200 | JSON | (2) — payload komposit halaman detail, **tidak** ada di dokumentasi resmi | EV-ARJ-12 |
| `/api/realtime/{code}` | GET | `t` (cache-buster) | tidak wajib | 200 | JSON | (2) | EV-ARJ-19 |
| `wss://stock.arjum.com/ws/running-trade` | WS | header `X-API-Key` | wajib, pemilik key harus paid user | tidak diuji pada audit ini | JSON teks | (5) | EV-ARJ-15 |

**Skema `/api/history/{code}`**: `{stock_code, frame, rows: [...]}`. Tiap baris: `date` (YYYY-MM-DD), `close`, `change`, `change_pct`, `value` (Rupiah), `volume` (**lembar**), `freq`, `f_buy`, `f_sell`, `n_foreign` (lembar), `open`, `high`, `low`, `avg`. Tidak ada pagination dan **tidak ada parameter rentang tanggal** — hanya `limit` mundur dari hari terakhir. Hari tanpa transaksi tetap disertakan dengan `volume=0`, `value=0`, `freq=0`, `open=high=low=close` = harga terakhir, `avg=null`.

**Skema `/api/financial-statements/{code}`**: `{stock_code, report_type, period, count, items: [{year, quarter, label, fetched_at, data:{...}}]}`. `data` adalah objek bernama snake_case Bahasa Indonesia yang mengikuti taksonomi XBRL IDX (mis. `penjualan_dan_pendapatan_usaha`, `laba_bruto`, `beban_umum_dan_administrasi`, `laba_rugi`, `laba_rugi_yang_dapat_diatribusikan.{ke_entitas_induk, ke_kepentingan_non_pengendali, total}`), termasuk sub-objek hierarkis.

**Skema `/api/done-details`**: `{code, date, total, page, per_page, total_pages, data:[...], elapsed_ms}`. Tiap baris: `time` (HH:MM:SS), `market_date`, `market_board` (mis. `RG`), `price` (string), `price_num`, `lot` (string), `qty_num`, `value_raw`, `buyer`, `seller`, `buyer_type` (`D`/`F`), `seller_type`, `buy_order_number`, `sell_order_number`, `action` (`BUY`/`SELL`).

**Skema `/api/broker-summary/{code}`**: `{stock_code, brokers, broker_levels, broker_start_date, broker_end_date, broker_date_min, broker_date_max, broker_net, flow}`. Tiap broker: `{broker_code, broker_name, bval, bvol, bfrq, sval, svol, sfrq, nval, nvol}`.

**Skema `/api/market-cap`**: `{date, total, page, per_page, total_pages, data:[{code, name, close, listed_shares, listed_shares_label, market_cap, market_cap_label, turnover_ratio, turnover_ratio_label}]}`.

**Skema `/api/screener/latest`**: `{date, source, rows, raw, cached_for_seconds}`. Tiap baris: `{stock_code, stock_name, bucket, summary, wr_event, potential, drawdown, note}`.

**Skema `/api/realtime/{code}`**: `{code, source, message, date, last, open, high, low, prev, change, change_pct, volume, value, freq, bid, offer, orderbook, …}`. Saat pasar tutup: `source: "db_close_fallback"`, `message: "Market tutup / realtime kosong, pakai data tanggal 2026-09-18"`, dan `orderbook` berisi harga tetapi volume `null`.

### C.3 Catatan keterbatasan pengamatan jaringan

- Pembacaan request jaringan **berhasil** pada kedua tab. Namun pada Invezgo sebagian besar data halaman datang lewat **React Server Components (`?_rsc=…`)** — dirender di server, sehingga **tidak** terlihat sebagai XHR. Halaman Broker Summary, Laporan Keuangan, Insider, dan Pemegang Saham tidak memunculkan satu pun XHR ke `api.invezgo.com`.
- Chart Invezgo berjalan di dalam **iframe** (`tradingview_*`), sehingga request datafeed-nya tidak tertangkap perekam jaringan tab utama. Bukti bahwa datafeed berasal dari `api.invezgo.com/analysis/chart/stock/{code}` diperoleh dari `performance.getEntriesByType('resource')` pada frame utama, bukan dari isi iframe.
- **Tidak ada HAR mentah yang diekspor.** Inventaris di atas sudah disanitasi: tidak ada cookie, token, API key, atau identitas pribadi.
- Pemanggilan tambahan yang dilakukan bersifat **baca saja**, jumlahnya belasan, dan tidak menyentuh kuota berbayar mana pun (Invezgo memakai sesi dashboard, Arjum memakai kuota FREE yang pada akhir audit masih menunjukkan pemakaian sangat kecil).

---

## D. Temuan logika

### D.1 Satuan dan mata uang

| Hal | Invezgo | Arjum | Tingkat keyakinan |
|---|---|---|---|
| `volume` harian pada endpoint chart/history | **lembar** (TLKM 14/09/2026 = 139.730.300; sama persis dengan Arjum) | **lembar** (field `volume`) | Terlihat langsung |
| Volume pada UI Broker Summary | **lot** (BBCA total 1,11 JT lot; 1,11 juta lot × 100 × Rp6.275 ≈ Rp695,6 miliar = kolom BVal) | Broker summary API memakai **lembar** (`bvol` 3.503.900 ÷ `bval` Rp2.241.837.500 = Rp639,8 ≈ harga 640) | Terlihat langsung / Inferensi aritmetik |
| Variabel screener `volume` | **lot** — dinyatakan eksplisit di Panduan Formula | — | Dijelaskan dokumentasi |
| Variabel screener `total_haka_volume` / `total_haki_volume` | **lembar** — dinyatakan eksplisit | — | Dijelaskan dokumentasi |
| `value` | **Rupiah** | **Rupiah** | Dijelaskan dokumentasi / terlihat langsung |
| WebSocket `l` | — | **lot** (1 lot = 100 lembar), `p` harga per lembar, `v` nilai total Rupiah | Dijelaskan dokumentasi |
| `done-details` `lot` / `qty_num` | — | keduanya **lot** (107 lot × 100 × 645 = Rp6.901.500 = `value_raw`) | Inferensi aritmetik |

> **Peringatan implementasi:** di dalam satu platform yang sama, satuan volume berpindah antara lot dan lembar tergantung endpoint/halaman. Ini sumber bug klasik. Simpan selalu dalam lembar di database, dan simpan penanda satuan asal per sumber.

### D.2 Harga adjusted vs unadjusted

**Harga dan volume harian Invezgo sudah disesuaikan stock split (split-adjusted).** Bukti:
- TLKM, 1 Juli 2013 (sebelum stock split 1:5 Agustus 2013): close 2.180. Harga nominal saat itu ±11.000.
- BBCA, 20 September 2021 (sebelum stock split 1:5 Oktober 2021): close 6.585, volume 73.157.504 lembar. Harga nominal saat itu ±32.900; volume nominal ±14,6 juta lembar (≈ 73,1 juta ÷ 5).

Volume ikut dikalikan faktor split, jadi **volume juga adjusted**. Status: **Inferensi kuat** (dua kasus independen, konsisten pada harga dan volume).
**Belum diketahui:** apakah harga juga disesuaikan dividen. Tidak ada penanda `adjusted`/`unadjusted` di skema respons maupun dokumentasi. Asumsi kerja: split-adjusted, **tidak** dividend-adjusted (lazim untuk penyedia data IDX) — perlu konfirmasi.
Untuk Arjum: **belum diuji**, karena `/api/history` dibatasi 500 candle harian sehingga tidak mencapai tanggal split yang relevan. Pengujian via `frame=weekly`/`monthly` belum dilakukan.

### D.3 Periode kuartalan: standalone vs kumulatif YTD

**Invezgo = kumulatif YTD.** Bukti keras dari Key Statistics BBCA:
- `Net Profit` Q1 2026 = 14.690 M; Q2 2026 = 29.534 M; `Net Profit (Quarter)` Q2 2026 = 14.850 M. 29.534 − 14.690 = 14.844 ≈ 14.850.
- Laporan Arus Kas BBCA, baris "Penerimaan bunga, hasil investasi, provisi, dan komisi": Q1 2025 28.775 M → Q2 2025 56.930 M → Q3 2025 87.281 M (monoton naik).
Status: **Terlihat langsung + inferensi aritmetik**, keyakinan tinggi.

**Invezgo tidak memiliki kolom Q4 sama sekali**, dan deret kuartalnya berlubang. Kolom Laporan Arus Kas BBCA: Q2 2026, Q1 2026, Q3 2025, Q2 2025, Q1 2025, Q3 2024, Q2 2024, Q3 2023. Tabel Key Statistics di halaman yang sama memakai **himpunan periode yang berbeda**: Q2 2026, Q1 2026, Q2 2025, Q1 2025, Q3 2024, Q2 2024, Q1 2024, Q3 2023. Konsekuensi: Q4 standalone tidak bisa diturunkan, dan menjajarkan dua tabel di halaman yang sama bisa salah kolom.

**Arjum = standalone per kuartal, dengan Q4.** Bukti: SOCI penjualan Q1 2026 601,4 M; Q4 2025 637,8 M; Q3 2025 731,0 M; Q2 2025 553,9 M; Q1 2025 683,9 M — tidak monoton, dan Q4 2025 punya laba bersih negatif (−73,1 M) yang khas hasil pengurangan FY dikurangi 9M. Status: **Inferensi kuat**.

### D.4 Rasio: FY, TTM, atau Annualized

**Invezgo** menyediakan tiga keluarga variabel di screener: rasio kuartalan berjalan (`per`, `pbv`, `roe`, `roa`, `eps`, `ebitda`, `netprofit`, `revenue`, `debt_equity`, `ev_ebitda`, `shares`, `market_cap`), versi **annualized** (`*_anl`), dan versi periode sebelumnya (`prev_*`) plus `change_*`. **Tidak ada variabel TTM di screener**, walaupun dashboard menampilkan baris `Net Profit (TTM)`.

**Masalah nyata yang teramati pada BBCA:** `PER` Q2 2026 = 0,00x sementara `PER (Annualised YTD)` = 11,47x; `PER` Q1 2026 = 53,59x (EPS YTD satu kuartal dibandingkan harga penuh), Q2 2025 = 73,33x. Artinya baris `PER` polos **tidak layak dipakai lintas kuartal** tanpa anualisasi. Status: **Terlihat langsung**.

**Kelengkapan Key Statistics buruk.** Dari 26 baris untuk BBCA: `CFO/Net Profit`, `Net Profit Growth QoQ`, `Net Profit Growth YoY (YTD)`, `P/CF`, dan `RPS` bernilai 0,00 di **seluruh** kolom; `EBITDA`, `Revenue`, `EV/EBITDA`, `DER` hanya terisi di satu kolom; `Net Profit` hanya dua kolom; `Net Profit (TTM)`, `EPS (Annualised)`, `EPS (Recomputed)`, `PER (Annualised YTD)`, `ROA (Bank/OJK Analytical)` hanya satu kolom. Ini sejalan dengan peringatan resmi pada endpoint `/analysis/keystat/{code}`.

**Arjum tidak menyajikan rasio siap pakai.** Yang tersedia hanyalah pos laporan keuangan mentah (income statement, balance sheet, cash flow) plus `market-cap`/`listed_shares`. Semua rasio harus dihitung sendiri — yang justru sesuai kebutuhan proyek.

### D.5 Tanggal publikasi vs periode laporan

**Belum diketahui di kedua platform.** Tidak satu pun menyediakan tanggal penyampaian laporan ke bursa.
- Invezgo: kolom hanya berlabel periode ("Q2 2026"); dokumentasi hanya menyebut "Update: Real-time sesuai laporan masing-masing perusahaan".
- Arjum: ada `fetched_at`, tetapi nilainya seragam `2026-09-13 18:06:34` untuk semua kuartal dan semua saham yang diperiksa — itu **waktu pengambilan batch**, bukan tanggal publikasi.

**Konsekuensi serius:** backtest fundamental pada kedua sumber rawan *look-ahead bias*, karena kita tidak tahu kapan angka Q-tertentu benar-benar tersedia ke publik. Untuk sementara pakai aturan konservatif (mis. laporan kuartalan dianggap tersedia 2 bulan setelah akhir periode; laporan tahunan 3–4 bulan) dan simpan aturan itu sebagai kolom eksplisit.

### D.6 Net foreign dan cakupan pasar

- **Arjum**: `/api/history` memberi `f_buy`, `f_sell`, `n_foreign` per hari dalam lembar. **Cakupan papan belum dinyatakan** (RG saja atau semua papan) — belum diketahui. `/api/broker-summary` punya toggle Foreign/Domestic/ALL Investor.
- **Invezgo**: `foreign_flow` didefinisikan di Panduan Formula sebagai "Net foreign flow hari ini (Foreign Buy − Foreign Sell)"; fungsi `broker_*` menerima `investor_type` `f`/`d`/`a` dan `market_type` `RG`/`TN`/`NG`/`ALL` dengan default yang tidak disebutkan. **Cakupan default belum diketahui.**
- Status: **definisi dijelaskan dokumentasi; cakupan pasar belum diketahui di kedua platform.**

### D.7 Broker accumulation vs kepemilikan

Keduanya memisahkan dengan benar, tetapi **Invezgo mencampur fakta dan tafsir dalam satu tampilan**:
- Fakta: broker summary (bval/bvol/bfrq), inventory chart, KSEI holdings per tipe investor, free float per kategori regulasi BEI.
- Tafsir tanpa rumus: variabel `bdm` ("Posisi akumulasi bandar"), `ritel`, `foreign`, `ratio` ("Rasio bandar/ritel"), `bdm_flow`, klasifikasi broker **Zombie/Asing/Ritel/Institusi**, kolom "Bacaan" (Akumulasi/Distribusi/Seimbang) pada Tabel Harga, status "Buyer/Seller dominan" pada Tabel Waktu, dan `freq_analyzer` (satu-satunya yang rumusnya diungkap: `volume / freq^3`).
- **Rumus `bdm` tidak dijelaskan di mana pun.** Status: **belum diketahui.** Jangan membuat asumsi.

Data KSEI Invezgo cukup dalam dan terdefinisi: grup investor SC/ID/CP/OT/IB/IS/FD/MF/PF, prefiks `local_`/`foreign_`, sufiks `_up` (>5%) / `_down` (<5%), serta kategori free float regulasi BEI (`public_down_5`, `management_down_5`, `controller_down_5`, `affiliate_down_5`, `treasury_down_5`, `lock_up_down_5`) dengan `free_float_pct = (free_float / shares) * 100`. Pembaruan KSEI: **tanggal 02 setiap bulan**.

### D.8 Win rate Arjum — peristiwa, sampel, periode, target, biaya

Ini bagian yang paling transparan dari seluruh audit.

- **Peristiwa (event):** kemunculan sebuah *pattern* pada suatu `signal_date`. Nama pola yang terlihat: `TECH_ABOVE_MA20`, `RSI_OVERBOUGHT_65P`, `DIP_ACC_BROKER_VOL`, serta pola gabungan bernama Indonesia ("Gabungan (Asing + Teknikal)", "top broker akumulasi pekat", "Gabungan (Broker + Asing)", "Gabungan (Broker + Teknikal)").
- **Entry:** `entry_close` = harga penutupan pada hari sinyal.
- **Horizon:** 5 hari bursa (`close_d5_ret`, `mfe_5d`, `mae_5d`), dengan `close_d3_ret` sebagai titik antara. `exit_reason` bernilai `TP`, `CL`, atau timeout; `exit avg D+2,3`–`D+2,5`.
- **Target & stop:** "WR Event pakai TP/CL **ATR dinamis**". Pada ringkasan per saham muncul "potensi +7% | DD −5%" — angka ini adalah **level TP dan CL yang dikonfigurasi untuk pola itu**, bukan statistik hasil. Statistik hasilnya adalah `TP 45,3% | CL 46,1% | Timeout 8,6%`.
- **Ukuran sampel:** dilaporkan eksplisit (`Sample 128`, `191`, `209`, `276`; ada pula pola dengan `sample: 8`).
- **Periode data:** disclaimer resmi menyatakan **"DATA HISTORIS SEJAK JAN 2020"**. Konsisten dengan `broker_date_min = 2020-01-02` dan Seasonality yang dimulai 2020.
- **Biaya transaksi:** **tidak diperhitungkan.** Bukti: pada event yang `cl_hit = 1`, `realized_ret` persis −5 (sama dengan level CL), tanpa potongan fee/slippage.
- **Metrik tambahan:** `profit_factor`, `avg_realized_ret`, `avg_mfe_5d`, `avg_mae_5d`, `wr_d3`, `wr_d5`.

Status: **Dijelaskan dokumentasi + terlihat langsung di payload.** Yang **belum diketahui**: definisi tepat tiap pola, parameter ATR, aturan seleksi "likuid" (280 dari 963), dan apakah universe backtest menyertakan saham yang kini delisting (risiko *survivorship bias*).

**Pada saat audit, bucket AKUMULASI SENYAP tidak punya statistik sendiri.** Kartu SOCI dan HRTA menampilkan "WR -", "Potensi +-", "DD -" dengan catatan "Akumulasi senyap versi base-only, belum ada edge historis khusus" — persis mencerminkan `wr_event: null, potential: null, drawdown: null` di API. Statistik pola tetap ada di `/api/analysis/{code}`.

**Inkonsistensi presentasi yang perlu dicatat:** HRTA masuk bucket "AKUMULASI SENYAP" tetapi analisisnya memberi `Score 35/75 — 🔴 WASPADA — Lebih banyak tekanan jual` dan "di bawah SMA20". Bucket dan skor bisa berbeda arah tanpa penjelasan yang menghubungkan keduanya.

### D.9 Label buy/sell pada running trade

- **Invezgo** mendefinisikan konsepnya secara eksplisit di Panduan Formula lewat variabel `haka_*` (beli agresif / hit offer) dan `haki_*` (jual agresif / hit bid), lengkap dengan versi multi-timeframe dan kumulatif harian. Ini menunjukkan klasifikasi berbasis sisi agresor.
- **Arjum** menyebut field `c` sebagai "Aksi transaksi: buy atau sell" pada WebSocket, dan `action: "BUY"/"SELL"` pada done-details — **tanpa menjelaskan metodenya**. Namun done-details menyertakan `buy_order_number` dan `sell_order_number`; nomor order ini secara teori memungkinkan penentuan sisi agresor (order yang lebih baru adalah agresor). **Ini dugaan, belum dikonfirmasi.**
- Status: Invezgo **dijelaskan dokumentasi**; Arjum **belum diketahui**. Jangan menyamakan definisi keduanya.

### D.10 Trade size, order book, dan turunan intraday Invezgo

Panduan Formula mendefinisikan grup ukuran transaksi: `micro` < Rp1.000.000; `small` Rp1.000.000–9.999.999; `medium` Rp10.000.000–99.999.999; `big` ≥ Rp100.000.000 — dengan varian `*_buy_volume` dan versi multi-timeframe. Order book: `bid_volume(n)`, `bid_freq(n)`, `offer_volume(n)`, `offer_freq(n)`, `sum_bid_volume(n)`, imbalance top-n = `(bid − offer)/(bid + offer)`, spread dan midpoint; jika satu sisi kosong nilainya 0. Timeframe yang didukung: 30s, 1m, 5m, 15m, 30m, 1h, 1d, 1w, 1mo. Tabel tick fraksi harga juga didokumentasikan (<200 → 1; 200–499 → 2; 500–1.999 → 5; 2.000–4.999 → 10; ≥5.000 → 25).

**Dua catatan penting dari dokumentasi Invezgo yang berdampak langsung ke desain screener:**
1. **`Nilai Null: Jika data tidak tersedia, nilai default adalah 0`.** Data hilang dan nilai nol tidak bisa dibedakan. Sebuah filter `per < 10` akan meloloskan semua saham yang PER-nya tidak tersedia.
2. **Parameter periode `n` maksimum 400 dan di-clamp otomatis** untuk semua fungsi berperiode, termasuk indikator teknikal, series function, dan broker summary. Permintaan `n = 500` diam-diam menjadi 400.

### D.11 Cakupan emiten dan saham delisting

| | Invezgo | Arjum |
|---|---|---|
| Jumlah entri universe | **1.203** dari `/analysis/list/stock` | **963** dari `/api/market-cap` dan teks screener ("963 terdata") |
| Komposisi | 976 kode 4 huruf + **227 waran/rights** (`-W`, `-W3`, `-W4`, `-R`) | belum dirinci; landing mengklaim "900+ Saham IDX Terindeks" |
| Saham delisting/suspensi | **Ada**: MYRX, UNSP, BTEL, TRAM, SRIL, WSKT semuanya hadir | belum diuji |
| ETF | **Tidak ada** (XBNI, XPLT tidak ditemukan) | belum diuji |
| Penanda status aktif/delisting | **Tidak ada field status** pada `/analysis/list/stock` | belum diketahui |

Kehadiran saham delisting pada Invezgo **baik** untuk mengurangi survivorship bias, tetapi tanpa field status kita harus menurunkan sendiri status aktif dari ada/tidaknya transaksi terkini.

### D.12 Kesamaan angka antar platform

TLKM, 14 September 2026 — Invezgo: O 2.610, H 2.690, L 2.600, C 2.690, volume 139.730.300. Arjum: O 2.610, H 2.690, L 2.600, C 2.690, volume 139.730.300, plus `value` Rp370.065.867.000, `freq` 14.653, `f_buy` 87.828.000, `f_sell` 76.073.600, `n_foreign` 11.754.400.

**Identik, termasuk volume dalam lembar.** Kesimpulan yang sah: kemungkinan besar **upstream yang sama** (data resmi bursa atau vendor yang sama). Kesimpulan yang **tidak** sah: bahwa angka itu akurat karena dua situs sepakat. Untuk verifikasi sesungguhnya diperlukan sumber ketiga yang independen.

---

## E. Paket dan biaya

### E.1 Invezgo — Paket aplikasi (Consumer), per bulan, harga promo per 20 Sep 2026

| | Trial | Starter | Basic | Pro | Ultra |
|---|---|---|---|---|---|
| Harga normal | — | 61.000 | 133.000 | 272.000 | 599.000 |
| Harga saat audit | Gratis (3 hari) | **39.900** (−35%) | **79.900** (−40%) | **149.900** (−45%) | **299.900** (−50%) |
| Watchlist & Jurnal | ✓ | ✓ | ✓ | ✓ | ✓ |
| Alat Analisa Saham | ✓ | ✓ | ✓ | ✓ | ✓ |
| Live Alert | ✓ | **✗** | ✓ | ✓ | ✓ |
| Jumlah Live Alert | 2 formula | — | 7 formula | 15 formula | 30 formula |
| Tape Reading | 1h | 1h | 30m | 1m, 5m, 15m, 30m | 1m, 5m, 15m, 30m |
| AI Chat / bulan | — | — | 15 | 500 | 1.100 |

Opsi tahunan: "Gratis 1 Bulan". Opsi "Butuh durasi fleksibel?": 2–60 bulan.
Catatan aneh yang layak dikonfirmasi: **Trial punya Live Alert (2 formula) tetapi Starter tidak.**

### E.2 Invezgo — Paket API (Developer), per bulan, harga promo per 20 Sep 2026

| | Advance | Prime | Max | Elite |
|---|---|---|---|---|
| Harga normal | 999.000 | 1.999.000 | 3.999.000 | 8.000.000 |
| Harga saat audit | **499.900** (−45%) | **999.000** (−50%) | **1.999.900** (−50%) | **4.000.000** (−50%) |
| Akses MCP | ✓ | ✓ | ✓ | ✓ |
| Akses API | ✓ | ✓ | ✓ | ✓ |
| Batas API | 250 req/menit | 500 req/menit | 1.000 req/menit | 2.000 req/menit |
| API per bulan | 30.000 | 65.000 | 145.000 | 320.000 |
| Kapabilitas Batch | — | — | **10** | **25** |

Enterprise: tidak ada harga publik; kontak `admin@invezgo.com`.

**Aturan operasional API Invezgo (dari Q&A resmi):**
- Rate limit dan kuota **hanya dihitung untuk response 2xx**; request gagal tidak memotong kuota.
- Siklus 30 hari dihitung dari **pemakaian API pertama**, bukan dari tanggal langganan. Contoh resmi: berlangganan 11 Mei 23.00 WIB, akses pertama 12 Mei 07.00 WIB → reset 11 Juni 07.00 WIB.
- Membeli paket yang sama = **perpanjangan masa aktif**, bukan penambahan kuota. Tambah kuota hanya lewat upgrade ke paket lebih tinggi.
- **Tidak ada trial API key.** Dokumentasi publik: `https://docs.invezgo.com/api`.
- Tersedia **MCP** resmi dan integrasi OpenClaw/Hermes.
- API key **boleh dibagikan ke tim** untuk kebutuhan operasional tim (bertentangan dengan pasal ToS "Each subscription is for one person only").

### E.3 Invezgo — hak penggunaan yang dinyatakan

Dari Q&A halaman langganan:
- *"Apakah data/API boleh digunakan untuk produk komersial?"* → "**Boleh apabila digunakan dalam bentuk tools dan bukan raw data.** Batas 15 juta rupiah per bulan berlaku apabila pengguna memberikan layanan berbayar kepada pihak lain, baik dalam bentuk langganan bulanan maupun lifetime purchase, dan layanan tersebut menggunakan data Invezgo. Paket Developer dapat digunakan selama penghasilan dari layanan tersebut masih di bawah 15 juta rupiah per bulan. Apabila data hanya digunakan untuk penggunaan pribadi dan keuntungan diperoleh dari hasil trading menggunakan tools personal tersebut, maka tidak ada batasan untuk hal tersebut. Apabila penghasilan layanan di atas 15 juta rupiah per bulan, silakan berlangganan Enterprise untuk license khusus melalui admin@invezgo.com."
- *"Apakah data atau API dapat dijual kembali?"* → "**Tidak.** Invezgo melarang penjualan kembali data atau API dalam bentuk raw data."
- *"Apa perbedaan Paket Developer dan custom Enterprise?"* → Developer untuk "penggunaan personal, riset, dan penggunaan API standar"; Enterprise untuk "startup, bisnis, internal tools, produk komersial, data pipeline, kebutuhan SLA, kuota besar, custom endpoint, serta license khusus".

Dari halaman **Syarat & Ketentuan** (`invezgo.com/terms`), pasal *Copyright and Limitations on Use*: seluruh isi situs "belongs to Invezgo or its partners"; boleh dicetak/disimpan "for personal, non-commercial use only"; dilarang menyalin, membagikan, atau menjual konten tanpa izin; **"Don't use bots or similar tools to collect data"**; dan **"Each subscription is for one person only and cannot be shared."** Pasal *Third Party Content*: "Invezgo distributes (not publishes) third-party content and is not responsible for its accuracy or usefulness" — **tanpa menyebut siapa pihak ketiga itu**. Pasal *Warranties*: market data disediakan "as is", "may be delayed or inaccurate, and should not be used for trading or financial decisions".

> **Ini kontradiksi material.** FAQ bukan kontrak; ToS yang mengikat. Kalimat "Don't use bots or similar tools to collect data" bahkan berpotensi bertabrakan dengan pemakaian API otomatis itu sendiri. Perlu konfirmasi tertulis sebelum keputusan apa pun.

### E.4 Arjum — kuota REST

| | FREE (status akun saat ini) | Top-up |
|---|---|---|
| Kuota | **1.000 request/hari per akun**, gabungan seluruh API key | +5.000 (Rp5.000) · +10.000 (Rp10.000) · +20.000 (Rp20.000, "Paling Laris") · +50.000 (Rp50.000) · custom minimal Rp5.000, rasio **Rp1 = +1 request/hari** |
| Reset | otomatis 100% penuh setiap **00:00 WIB** | kuota tambahan aktif **30 hari** sejak pembayaran berhasil; setelah habis kembali ke 1.000 req/hari |
| Rate limit per menit | tidak dinyatakan | tidak dinyatakan |
| Pembayaran | — | QRIS otomatis |

**Inkonsistensi label:** halaman "API Keys Saya" menuliskan **"1.000 req/hr"** pada kartu key, sementara halaman "Usage Analytics & Limit" dan seluruh teks lain konsisten menyebut **"1.000 req/hari"** dengan reset harian 00:00 WIB. Yang benar hampir pasti per hari.

**Inkonsistensi jumlah endpoint:** landing page dan FAQ menyebut **8 endpoint REST**; dokumentasi di Developer Dashboard menampilkan **12 endpoint**.

### E.5 Arjum — WebSocket Running Trade

- Endpoint `wss://stock.arjum.com/ws/running-trade`, autentikasi header `X-API-Key`, **pemilik key harus paid user**.
- **Bonus terkonfirmasi di UI:** "Bonus: Running Trade (uji coba) — **Semua paket upgrade otomatis mendapat akses Running Trade** — stream transaksi IDX real-time. Fitur ini sedang dalam fase uji coba dan dapat berubah tanpa pemberitahuan."
- Maksimal **1 koneksi per pemilik akun**; koneksi baru selalu menang (takeover, close code 4408).
- **Bebas rate limit RPM dan tidak memotong kuota harian REST.**
- **Data efemeral (in-memory)**; reconnect memberi snapshot terkini, bukan replay transaksi yang terlewat.
- Karena butuh custom header, **tidak bisa dipakai dari WebSocket browser standar** — hanya script/worker/bot/backend.
- Close code: 4401 (key invalid/nonaktif/banned/kedaluwarsa), 4403 (butuh paid user), 4408 (koneksi digantikan).
- Strategi reconnect yang disarankan penyedia: exponential backoff 2s → 5s → 10s, maksimum 30s.
- Pesan: `snapshot` (market status open/break/closed/weekend + session + session_end, `top`, `recent`), `trade`, `top5` (interval ±5 detik, 5 saham dengan frekuensi transaksi tertinggi sepanjang hari).

**Konsekuensi biaya:** akses WebSocket Running Trade Arjum secara efektif berharga **Rp5.000 per 30 hari** (paket top-up terkecil). Itu jauh lebih murah dari paket API Invezgo mana pun — tapi status "uji coba" dan klausul "dapat berubah tanpa pemberitahuan" membuatnya tidak layak dijadikan tulang punggung produk.

### E.6 Perbandingan biaya ringkas

| Kebutuhan | Invezgo | Arjum |
|---|---|---|
| OHLCV harian 2 tahun, seluruh pasar | Advance Rp499.900/bln (30.000 req/bln — cukup untuk ±960 saham 1×/bulan penuh, atau harian inkremental) | FREE (1.000 req/hari); `/api/history` satu request per saham per panggilan |
| OHLCV > 2 tahun | Hanya **Enterprise** (chart mulai 2010) | Maksimum 500 candle harian (±2 tahun); weekly/monthly bisa lebih jauh (belum diuji) |
| Broker summary historis | Reguler 2 tahun; Enterprise mulai 2016 | Mulai **2020-01-02**, gratis |
| Fundamental | Reguler 2 tahun; Enterprise mulai 2020; **kualitas diragukan penyedia sendiri** | Q1 2022–Q1 2026 (17 kuartal), standalone, gratis, tapi **tertinggal 1 kuartal** |
| Running trade historis (tick) | `/analysis/running-trade/{code}`, paginasi 150/request | `/api/done-details`, 100/request, retensi ±6 minggu |
| Running trade real-time | Tidak terlihat WebSocket di OpenAPI; ada endpoint REST realtime | WebSocket, efektif Rp5.000/30 hari, status beta |
| Order book historis | **Ya** (`/analysis/order-book/{code}` + batch) — keunggulan unik Invezgo | Hanya snapshot harga tanpa volume saat pasar tutup |
| Kepemilikan KSEI rinci | **Ya**, sangat rinci, mulai 2009 (Enterprise) | Tidak ada |
| Corporate action | `/analysis/calendar` | **Tidak ada** |

---

## F. Matriks kelayakan

Skala: ✅ layak · ⚠️ layak bersyarat · ❌ tidak layak · ❓ belum dapat dinilai

| Penggunaan | Invezgo | Arjum |
|---|---|---|
| **Eksperimen privat** | ✅ — API resmi lengkap, dokumentasi baik, MCP tersedia. Hambatan: tidak ada trial key, harus bayar Rp499.900 untuk mulai mencoba. | ✅ — kuota gratis 1.000 req/hari, dokumentasi interaktif, langsung bisa dipakai. Terbaik untuk memulai. |
| **Ingestion otomatis dari server** | ⚠️ — endpoint resmi memang dirancang untuk itu (X-API-Key, batch, `/usage/api`), tapi **belum pernah diuji dengan key asli dari IP server**, dan pasal ToS "Don't use bots or similar tools to collect data" belum diklarifikasi. | ⚠️ — endpoint bersih dan cepat (`elapsed_ms` ±1 ms), tapi kuota 1.000/hari terlalu kecil untuk cakupan penuh tanpa top-up, tidak ada SLA, ToS boleh berubah tanpa pemberitahuan, dan **akses dari server tanpa header Origin belum diuji**. |
| **Website publik** | ❌ untuk sekarang — kontradiksi FAQ vs ToS belum terselesaikan. Menjadi ⚠️ jika Invezgo mengonfirmasi tertulis bahwa tools publik diizinkan di bawah Rp15 juta/bulan; menjadi ✅ hanya dengan lisensi Enterprise tertulis. | ❌ untuk sekarang — ToS tidak menyebut redistribusi sama sekali. Ketiadaan larangan bukan izin, apalagi karena data pasar IDX sendiri berlisensi di hulu. Perlu konfirmasi tertulis. |
| **Backtesting** | ⚠️ — harga 2010 dan broker summary 2016 sangat menarik, tapi **hanya di Enterprise**; fundamental mulai 2020 dan kualitasnya diperingatkan penyedia; tidak ada tanggal publikasi laporan; `null → 0` di screener berbahaya. | ⚠️ — broker summary sejak 2020 gratis adalah nilai nyata, dan metodologi event study sudah terbuka. Tapi harga harian dibatasi 500 candle, fundamental hanya 4 tahun, tidak ada tanggal publikasi, dan universe backtest belum jelas menyertakan saham delisting. |
| **Running trade / order flow** | ⚠️ — data paling kaya (broker + tipe investor + papan, plus order book historis), tapi paginasi 150/request membuat cakupan pasar penuh tidak realistis: satu hari BBCA saja ±180 request. Cocok untuk **watchlist sempit**, bukan seluruh pasar. | ⚠️ — done-details tick-level gratis dan lengkap (broker, tipe investor, nomor order), tapi retensi hanya ±6 minggu dan ada tanggal bolong. WebSocket murah tapi status beta, 1 koneksi/akun, dan tanpa jaminan kelengkapan setelah reconnect. |

---

## G. Rekomendasi untuk proyek

### G.1 Sumber kandidat per kebutuhan

| Kebutuhan | Kandidat utama | Cadangan | Alasan |
|---|---|---|---|
| Harga historis OHLCV harian (≤2 tahun) | **Arjum** `/api/history` | Invezgo `/analysis/chart/stock` | Arjum memberi `value`, `freq`, `f_buy`, `f_sell`, `n_foreign` dalam satu panggilan; Invezgo hanya OHLCV. Nilainya identik, jadi tidak ada kerugian akurasi. |
| Harga historis > 2 tahun | **Invezgo Enterprise** (mulai 2010) | Arjum `frame=weekly`/`monthly` (perlu diuji) | Tidak ada jalan lain yang legal dan resmi. |
| Foreign flow harian | **Arjum** `/api/history` (`f_buy`, `f_sell`, `n_foreign`) | Invezgo `/analysis/top/foreign`, variabel `foreign_flow` | Sudah menyatu dengan baris harga; hemat request. |
| Broker summary harian | **Arjum** `/api/broker-summary` (2020→, gratis, ada nama broker) | Invezgo `/analysis/summary/stock` (Enterprise 2016→) | Kedalaman gratis 6,7 tahun sulit ditandingi. |
| Fundamental & laporan keuangan | **Arjum** `/api/financial-statements` (standalone, ada Q4) | Invezgo `/analysis/financial-statement` untuk kuartal terbaru yang belum ada di Arjum | Kuartalan standalone adalah kebutuhan utama untuk perhitungan sendiri; Q4 tersedia; Invezgo tidak punya Q4 dan memperingatkan akurasinya sendiri. |
| Corporate action | **Invezgo** `/analysis/calendar` | — | Arjum tidak punya sama sekali. Ini alasan kuat tetap punya akses Invezgo. |
| Kepemilikan (KSEI, free float, tipe investor) | **Invezgo** `/analysis/shareholder/ksei`, `/shareholder/classification` | — | Tidak ada padanan di Arjum. Pembaruan tanggal 02 tiap bulan. |
| Insider | Keduanya (`/analysis/shareholder-insider` vs `/api/insiders/{code}`) | — | Bandingkan kelengkapan sebelum memilih. |
| Running trade historis (tick) | **Arjum** `/api/done-details` untuk 6 minggu terakhir | Invezgo `/analysis/running-trade` untuk saham terpilih | Arjum gratis dan 100 baris/request; Invezgo 150/request tapi berbayar. Simpan sendiri agar tidak kehilangan data saat retensi Arjum lewat. |
| Order book historis | **Invezgo** `/analysis/order-book` (+ `/batch/order-book`) | — | Tidak ada padanan di Arjum. |
| Running trade real-time | **Arjum** WebSocket (jika beta diterima) | Invezgo `/analysis/running-trade` polling | Murah, bebas RPM, tidak memotong kuota REST — tapi jangan dijadikan sumber kebenaran. |
| Universe & saham beredar | **Arjum** `/api/market-cap` (`listed_shares`, `market_cap`, `turnover_ratio`) | Invezgo `/analysis/list/stock` (termasuk waran & delisting) | Gabungkan: Arjum untuk shares outstanding, Invezgo untuk cakupan historis termasuk emiten delisting. |
| Screener dengan aturan sendiri | **Dihitung sendiri di PostgreSQL/Drizzle** | — | Arjum tidak punya rule builder; screener Invezgo adalah milik Invezgo dan hasilnya adalah turunan mereka, bukan data. |

### G.2 Fitur versi awal (yang datanya sudah cukup)

1. **Harga & volume harian** per saham: candle, perubahan, nilai transaksi, frekuensi — plus label sumber dan tanggal data.
2. **Foreign flow harian dan akumulasi n-hari** — langsung dari `f_buy`/`f_sell`/`n_foreign`.
3. **Broker summary per saham dengan rentang tanggal** dan net value/volume per broker, memakai nama broker (bukan hanya kode).
4. **Screener milik sendiri** di atas tabel harian: likuiditas (nilai transaksi rata-rata), momentum (MA, perubahan n-hari), foreign flow, dan konsentrasi broker. Semua dihitung di database kita, dengan rumus yang ditampilkan ke pengguna.
5. **Laporan keuangan kuartalan standalone + rasio yang kita hitung sendiri** (PER, PBV, ROE, DER, margin), dengan anualisasi eksplisit dan label "kuartal standalone".
6. **Halaman sumber data**: untuk tiap angka, tampilkan asal, tanggal data, dan waktu pengambilan terakhir.

### G.3 Fitur yang sebaiknya ditunda

1. **Backtest jangka panjang (>4 tahun)** — data fundamental hanya sampai 2022 di Arjum, 2020 di Invezgo Enterprise, dan tidak ada tanggal publikasi laporan.
2. **Win rate / statistik pola milik sendiri** — bisa dibangun, tapi jangan dirilis sebelum ada aturan biaya transaksi, penanganan survivorship bias, dan ukuran sampel minimum. Jangan menyalin angka win rate Arjum ke produk kita.
3. **Order book & analitik kedalaman pasar** — hanya mungkin lewat Invezgo, dan hanya setelah masalah lisensi selesai.
4. **Running trade seluruh pasar secara real-time** — tidak realistis dengan kuota mana pun; batasi ke watchlist.
5. **Halaman publik yang menampilkan tabel data mentah** — apapun keputusan lisensinya, menampilkan raw data adalah bentuk yang paling eksplisit dilarang Invezgo ("bukan raw data").
6. **Skor bandar / bandarmologi** — rumus `bdm` Invezgo tidak diungkap; jangan menampilkan angka yang tidak bisa kita jelaskan.

### G.4 Uji teknis berikutnya yang paling menentukan (urut prioritas)

1. **Uji seluruh endpoint Arjum dari IP server produksi tanpa header Origin/Referer dan tanpa cookie.** Jika hasilnya sama seperti dari browser, ingestion gratis layak. Jika diblokir, seluruh rencana berubah. *Biaya: nol. Waktu: < 1 jam.*
2. **Minta konfirmasi tertulis lisensi ke Invezgo** (`admin@invezgo.com`) sebelum membayar apa pun — khususnya rekonsiliasi FAQ vs ToS. *Biaya: nol.*
3. **Uji kedalaman `/api/history` Arjum dengan `frame=weekly` dan `frame=monthly`** (limit 500) untuk melihat apakah data mundur jauh melampaui 2 tahun, dan uji apakah harganya split-adjusted memakai TLKM sebelum Agustus 2013 atau BBCA sebelum Oktober 2021. *Biaya: 2 request.*
4. **Uji kelengkapan `/api/done-details` Arjum** dengan membandingkan `total` terhadap `freq` pada `/api/history` untuk 10 saham × 5 tanggal. Jika cocok, done-details bisa dipercaya sebagai rekonstruksi penuh tape. *Biaya: ±60 request.*
5. **Uji apakah `/api/financial-statements` Arjum akhirnya memuat Q2 2026** dalam 2–4 minggu ke depan, untuk mengukur keterlambatan tipikalnya. *Biaya: 1 request/minggu.*
6. **Hitung anggaran request nyata** untuk cakupan 960 saham: harian (1 req/saham/hari = 960 req/hari → butuh top-up Arjum minimal +5.000/hari, atau Invezgo Advance 30.000/bulan tidak cukup dan Prime 65.000/bulan pas-pasan). Lakukan sebelum memilih paket.
7. **Beli satu top-up Arjum terkecil (Rp5.000)** — hanya setelah keputusan lisensi — untuk menguji WebSocket dan memverifikasi klaim "semua paket upgrade mendapat Running Trade". *Keputusan pengguna, bukan tindakan audit.*
8. **Uji `/screener/screen` dan `/analysis/calendar` Invezgo** begitu ada API key, karena keduanya tidak bisa dinilai dari dokumentasi saja.

### G.5 Pelajaran fitur & UX untuk produk kita (Tugas 7)

**Yang paling membantu pemula**

1. **Pesan `source` + `message` pada `/api/realtime` Arjum**: `"source": "db_close_fallback"`, `"message": "Market tutup / realtime kosong, pakai data tanggal 2026-09-18"`. Ini contoh terbaik yang saya temukan di kedua platform — API-nya sendiri menjelaskan mengapa angkanya bukan real-time. **Tiru persis**: setiap respons kita membawa `source` dan kalimat penjelas berbahasa manusia.
2. **Badge "Weekend" di logo Arjum** dan label market status `open|break|closed|weekend` pada WebSocket. Pengguna baru sering mengira data rusak padahal bursa tutup.
3. **Batas ARA/ARB ditampilkan di Market Quote Arjum** (Previous 620, ARA +35% = 775, ARB −35% = 465). Konteks yang langsung berguna, jarang ada di produk lain.
4. **Tombol "TUTOR" di setiap kartu Invezgo** — penjelasan in-context per widget, bukan satu halaman bantuan terpisah.
5. **`Ekspor CSV` per tabel di Invezgo** — pengguna bisa memverifikasi sendiri.
6. **Live Request Tester di dokumentasi Arjum** dengan contoh kode 6 bahasa dan tombol Copy. Dokumentasi API kita sebaiknya begini.

**Yang membingungkan (dan harus kita hindari)**

1. **Satuan yang berpindah-pindah.** Di Invezgo: "Volume (Lembar)" di Powerful Intraday, tetapi Tabel Harga di halaman yang sama memakai lot; variabel screener `volume` lot tapi `total_haka_volume` lembar. **Solusi kita:** tampilkan satuan di setiap header kolom, tanpa kecuali, dan sediakan satu toggle global lot/lembar.
2. **Singkatan skala tanpa legenda.** "308 RB", "193,33 M", "1,11 JT", "122 M" (yang terakhir berarti 122 miliar lembar saham, bukan 122 juta rupiah). **Solusi kita:** tooltip berisi angka penuh pada setiap nilai yang disingkat.
3. **Nilai 0,00 untuk data yang sebenarnya tidak ada.** Key Statistics Invezgo penuh dengan 0,00, dan Panduan Formula menegaskan `null → 0`. Pengguna akan menyimpulkan "DER BBCA 0%". **Solusi kita:** tampilkan "—" dengan tooltip "tidak tersedia untuk periode ini", dan **jangan pernah** mengubah null menjadi 0 di mesin screener; sediakan operator `is_null()`.
4. **PER lintas kuartal tanpa anualisasi.** PER Q1 2026 BBCA 53,59x adalah artefak. **Solusi kita:** default tampilkan rasio berbasis TTM, beri label tegas, dan sediakan toggle "YTD / TTM / Annualized" yang mengubah seluruh halaman.
5. **Kolom periode yang berlubang dan berbeda antar tabel di halaman yang sama** (Invezgo: Arus Kas vs Key Statistics memakai himpunan kuartal berbeda). **Solusi kita:** satu sumbu periode untuk seluruh halaman, dengan kuartal yang hilang ditampilkan kosong secara eksplisit.
6. **Bucket dan skor yang berbeda arah tanpa penjelasan** (Arjum: HRTA masuk "AKUMULASI SENYAP" tapi skornya "WASPADA"). **Solusi kita:** jika dua indikator kita berbeda arah, tampilkan keduanya berdampingan dengan satu kalimat yang menjelaskan mengapa.
7. **Angka yang tidak punya rumus** (`bdm`, "Zombie", "Bacaan: Akumulasi"). **Solusi kita:** setiap metrik turunan punya tautan "bagaimana ini dihitung" yang membuka rumusnya.
8. **Kolom kosong tanpa alasan.** Arjum lebih baik di sini: catatan "Akumulasi senyap versi base-only, belum ada edge historis khusus" menjelaskan mengapa WR kosong. **Tiru itu.**
9. **Label kuota yang tidak konsisten** ("1.000 req/hr" vs "1.000 req/hari"). Sepele tapi merusak kepercayaan.
10. **Modal pembayaran yang terlalu mudah terbuka.** Menekan area FAQ di halaman langganan Invezgo memicu modal "Berlangganan Fleksibel" dengan tombol "Berlangganan MAX". **Solusi kita:** tindakan berbiaya butuh konfirmasi terpisah dan tidak boleh muncul dari klik navigasi biasa.

**Filter/preset yang berguna untuk ditiru**

- Preset screener **Pribadi / Publik / Keanggotaan** (Invezgo) — preset publik yang dibagikan komunitas adalah fitur pertumbuhan yang murah.
- **Editor formula + Builder visual berdampingan** (Invezgo) — pemula pakai Builder, pengguna mahir pakai formula, dan keduanya menghasilkan aturan yang sama.
- **Kategori Indeks sebagai pra-filter** sebelum formula dijalankan.
- **Chip bucket dengan jumlah** di Arjum (ALL 2 / Watchlist 0 / AKUMULASI SENYAP 2) — pengguna langsung tahu berapa yang lolos.
- **Pengurutan yang jujur**: Arjum tetap menawarkan "Winrate ↓" walau nilainya kosong; lebih baik nonaktifkan opsi pengurutan ketika kolomnya kosong.
- **Seasonality matrix** (bulan × tahun + rata-rata) — presentasi padat yang mudah dipahami.

**Cara menampilkan sumber, tanggal, dan keterlambatan**

- Setiap kartu angka memuat baris kecil: `Sumber · Tanggal data · Diambil pukul`. Contoh: "Arjum · 18 Sep 2026 · diambil 20 Sep 2026 06:05 WIB".
- Untuk data EOD, sebutkan jadwal: Invezgo memperbarui broker summary "EOD setiap hari jam 18:00 WIB"; KSEI diperbarui "tanggal 02 setiap bulan". Tampilkan jadwal itu, bukan hanya timestamp.
- Bedakan dengan tegas lima kondisi: **bursa tutup**, **saham tidak bertransaksi** (volume 0, harga flat — Arjum menyertakan baris seperti ini), **data belum tersedia**, **fitur terkunci**, dan **request gagal**. Gunakan ikon dan warna berbeda untuk masing-masing.
- Untuk fundamental, tampilkan **periode laporan** dan **tanggal kami memuatnya**, serta catatan jika kuartal terbaru belum masuk.

**Cara membedakan hasil analisis dan fakta**

- Dua tipografi berbeda dan dua blok berbeda: "Fakta pasar" (harga, volume, broker, kepemilikan) vs "Hitungan kami" (skor, sinyal, win rate).
- Setiap hitungan kami membawa: rumus, periode sampel, jumlah sampel, dan apakah biaya transaksi sudah diperhitungkan. Arjum menampilkan `Sample 128 | PF 1,33 | exit avg D+2,3` — itu standar minimum yang layak ditiru, ditambah baris biaya yang mereka tidak punya.
- Disclaimer diletakkan di dekat angkanya, bukan hanya di footer.

---

## H. Daftar bukti

Seluruh pengamatan dilakukan Minggu, 20 September 2026, antara ±17:05 dan ±18:40 WIB (UTC+7). Tidak ada screenshot yang dilampirkan karena setiap tampilan halaman memuat identitas akun di header; sebagai gantinya setiap butir mencantumkan URL dan cara pengamatan sehingga dapat direproduksi.

### H.1 Invezgo

| ID | URL / objek | Waktu (WIB) | Tindakan | Yang terlihat | Keyakinan | Batas kesimpulan |
|---|---|---|---|---|---|---|
| EV-INV-01 | `invezgo.com/id/dashboard` → menu profil | 17:20 | Membuka menu profil | "Active Subscription: **TRIAL**"; menu Profil, Bonus Hingga 30%, Langganan, API, Pengaturan, Bahasa, Mode Gelap, Keluar | Tinggi | Status pada 20 Sep 2026; dapat berubah |
| EV-INV-02 | `invezgo.com/id/setting/api` | 17:26 | Navigasi langsung | Redirect ke `/id/subscription` | Tinggi | Membuktikan halaman terkunci untuk akun ini, bukan bahwa halaman tidak ada |
| EV-INV-03 | `api.invezgo.com/openapi.json` | 17:33 | `fetch` tanpa autentikasi dari halaman | OpenAPI "Invezgo API" v1.2, server `https://api.invezgo.com`, securityScheme `Authorization`, **94 path** | Tinggi | Spesifikasi menggambarkan API; tidak membuktikan tiap endpoint berfungsi |
| EV-INV-04 | `openapi.json` (field `description` tiap path) | 17:35 | Ekstraksi baris "Terbatas…" / "Data Awal…" / "Update…" | Batas 2 tahun untuk paket reguler; Data Awal Enterprise: chart 2010-01-01, indeks 2021-01-01, top/* 2010-01-01, summary & stalker & inventory 2016-01-01, KSEI 2009-03-01, financial-statement & keystat 2020-01-01, price/time-table & sankey & intraday-inventory "2 bulan" | Tinggi | Klaim dokumentasi, belum diverifikasi dengan API key berbayar |
| EV-INV-05 | `openapi.json` → `/analysis/keystat/{code}` | 17:36 | Membaca description | "Endpoint ini sedang mengalami proses aktualisasi untuk perhitungan yang lebih akurat. Data yang disajikan saat ini mungkin kurang tepat" | Tinggi | Peringatan penyedia; tidak mengukur besarnya kesalahan |
| EV-INV-06 | `api.invezgo.com/analysis/chart/stock/TLKM` | 17:29–17:31 | `fetch` dengan header Authorization Bearer dari sesi dashboard | 200; array `{date, open, high, low, close, volume:string}`; tanpa header → 401 "Anda harus login terlebih dahulu" | Tinggi | Ini jalur **sesi dashboard**, bukan jalur API key berbayar. Batas historis paket tidak berlaku di sini |
| EV-INV-07 | idem, TLKM 2013-07-01..05 & BBCA 2021-09-20..24 | 17:31 | Dua `fetch` | TLKM 1 Jul 2013 close 2.180; BBCA 20 Sep 2021 close 6.585, volume 73.157.504 | Inferensi kuat | Membuktikan split-adjusted; **tidak** membuktikan dividend-adjusted |
| EV-INV-08 | `api.invezgo.com/analysis/list/stock` | 17:32 | `fetch` dengan Bearer sesi | 1.203 entri; 227 kode berakhiran `-W`/`-W3`/`-W4`/`-R`; MYRX, UNSP, BTEL, TRAM, SRIL, WSKT hadir; XBNI/XPLT tidak ada | Tinggi | Tidak ada field status aktif/delisting |
| EV-INV-09 | `invezgo.com/id/analysis/finance/BBCA` | 17:13–17:17 | Membaca tabel via DOM | Kolom Arus Kas: Q2 2026, Q1 2026, Q3 2025, Q2 2025, Q1 2025, Q3 2024, Q2 2024, Q3 2023; Key Statistics memakai himpunan berbeda; deret kumulatif naik monoton dalam satu tahun | Tinggi | Diamati pada BBCA; pola untuk emiten lain belum diuji |
| EV-INV-10 | idem, tabel Key Statistics | 17:17 | Membaca 26 baris | `Net Profit` Q1 2026 14.690 M, Q2 2026 29.534 M; `Net Profit (Quarter)` Q2 2026 14.850 M; `PER` Q2 2026 0,00x vs `PER (Annualised YTD)` 11,47x; banyak baris 0,00 di semua kolom | Tinggi | Satu emiten; tapi selaras dengan peringatan resmi EV-INV-05 |
| EV-INV-11 | Modal "Panduan Formula" di `/id/screener` | 17:40–17:47 | Membaca ±38.900 karakter dokumentasi | `volume` lot, `value` Rupiah, `total_haka_volume` lembar; `Nilai Null → 0`; `n` maks 400 (clamp); `freq_analyzer = volume / freq^3`; `market_cap = shares * close`; `free_float_pct = (free_float/shares)*100`; broker_* dengan investor_type f/d/a dan market_type RG/TN/NG/ALL; grup trade size; order book bid/offer/imbalance; KSEI SC/ID/CP/OT/IB/IS/FD/MF/PF dengan `_up`/`_down` dan `local_`/`foreign_`; kategori free float BEI; 50+ candlestick & 65+ chart pattern | Tinggi | Dokumentasi berlaku untuk Screener & Live Alert, belum tentu identik dengan field REST API |
| EV-INV-12 | `/id/analysis/summary/stock/BBCA?transaction=true&investor=all` | 17:10 | Membaca tabel | 18 Sep 2026, Reguler, All; total beli 1,11 JT lot / Rp695,64 M / 26.826 freq / avg 6.275; total jual 1,11 JT lot / Rp695,64 M / 21.175 freq / avg 6.276; 64 broker sisi beli | Tinggi | Frekuensi beli ≠ frekuensi jual; definisi frekuensi tidak dijelaskan |
| EV-INV-13 | `/id/analysis/tape-reading/BBCA` | 17:19 | Membuka halaman | Order book 10 level dengan Freq/Lot per harga, replay 0.5x/1x/2x, timeframe 1h (batas paket TRIAL), tanggal 18 Sep 2026, posisi 08:00 | Tinggi | Granularitas yang lebih halus tidak dapat diuji pada paket TRIAL |
| EV-INV-14 | `/id/analysis/shareholder/BBCA` | 17:18 | Membaca halaman | 17 pemegang dengan peran P/K/D/A; tabel >1% dengan Nat/Dom, Scripless, Scrip, Total, %; legend sumber KSEI/IDX/UBO/Subsidiary/Other; **tidak ada tanggal data di UI** | Tinggi | Label "KSEI/IDX/UBO" adalah kategori relasi, bukan pernyataan lisensi |
| EV-INV-15 | `/id/subscription` (tab Consumer & Developer) | 17:23–17:27, 18:05 | Membaca tabel harga & matriks fitur | Consumer: Trial gratis 3 hari, Starter 39.900, Basic 79.900, Pro 149.900, Ultra 299.900; Live Alert 2/—/7/15/30 formula; Tape Reading 1h/1h/30m/1m-30m; AI Chat —/—/15/500/1.100. Developer: Advance 499.900 (250 rpm, 30.000/bln), Prime 999.000 (500 rpm, 65.000/bln), Max 1.999.900 (1.000 rpm, 145.000/bln, batch 10), Elite 4.000.000 (2.000 rpm, 320.000/bln, batch 25); Akses MCP & API ✓ semua | Tinggi | Harga promo per 20 Sep 2026 |
| EV-INV-16 | `/id/subscription` — payload FAQ | 17:28 | `fetch` halaman sendiri dan membaca teks jawaban FAQ | Kutipan lengkap ada di bagian E.3 | Tinggi | FAQ bukan dokumen kontrak |
| EV-INV-17 | `invezgo.com/terms` | 17:45 | `fetch` + ekstraksi teks | Pasal Copyright: "personal, non-commercial use only"; "Don't use bots or similar tools to collect data"; "Each subscription is for one person only and cannot be shared" | Tinggi | Bertentangan dengan EV-INV-16 |
| EV-INV-18 | `invezgo.com/terms` — Third Party Content & Warranties | 17:46 | idem | "Invezgo distributes (not publishes) third-party content"; market data "as is", "may be delayed or inaccurate, and should not be used for trading or financial decisions" | Tinggi | Tidak menyebut nama penyedia hulu mana pun |
| EV-INV-19 | `/id/subscription` — FAQ "Apakah ada trial untuk API Key?" | 17:28 | Membaca jawaban | "Tidak. Kami tidak menyediakan API Key untuk trial… Dokumentasi dapat diakses oleh siapa pun melalui https://docs.invezgo.com/api" | Tinggi | — |
| EV-INV-20 | `/id/chart/TLKM` | 17:37 | Membaca daftar request & daftar iframe | `invezgo.com/static/charting_library/bundles/*`; iframe `tradingview_*` dan `snap-midtrans`; `static.cloudflareinsights.com`; kunci PostHog di storage | Tinggi | Charting Library adalah pustaka tampilan TradingView yang di-host sendiri; datafeed berasal dari `api.invezgo.com` (lihat EV-INV-06). **Bukan** widget data TradingView |
| EV-INV-21 | `/id/screener` dan `/id/live-alert` | 17:39, 18:00 | Membuka editor | Editor formula (`close > prev && value > 500000000`), tab Builder, Kategori Indeks, tombol Panduan, Test, Simpan; preset Pribadi (kosong), Publik (banyak "WiseTrader Screener"), Keanggotaan (kosong); hasil contoh 130 baris | Tinggi | Tidak ada preset/alert yang disimpan saat audit |
| EV-INV-22 | `openapi.json` → `/analysis/running-trade/{code}` | 17:34 | Membaca description & parameter | Waktu, harga, volume (lembar), BUY/SELL, **kode broker pembeli & penjual + tipe investor**, jenis pasar RG/NG/TN; `limit` maksimal **150**; filter date/page/type/orderby/minimum/maximum/market/pricefrom/priceto/timefrom | Tinggi | Tidak menyebut retensi historis |
| EV-INV-23 | `/id/analysis/insider` | 17:18 | Membaca tabel | Baris terbaru bertanggal **19 September 2026** (Sabtu), rentang filter 05–20 Sep 2026 | Tinggi | Tanggal kemungkinan tanggal publikasi keterbukaan, bukan tanggal transaksi — belum dikonfirmasi |
| EV-INV-24 | `invezgo.com` — `document.cookie` | 17:31 | Membaca **nama** cookie saja | Cookie `access-token` dan `refresh-token` dapat dibaca JavaScript (bukan httpOnly) | Tinggi | Catatan keamanan untuk penyedia. **Tidak ada nilai token yang dicatat, disalin, atau disimpan** |
| EV-INV-25 | `/id/analysis/summary/stock/BBCA`, `/id/workspace/BBCA` | 17:08–17:12 | Membaca daftar request jaringan | Hampir seluruh navigasi berupa prefetch RSC `?_rsc=…`; satu-satunya XHR yang teramati ke `api.invezgo.com` adalah `PUT /users/workspace` (201) dan OPTIONS `/analysis/chart/stock/BBCA` | Tinggi | Halaman analisa dirender di server; kemampuan dashboard **tidak** membuktikan ketersediaan lewat API key |

### H.2 Arjum (IDX Edge PRO)

| ID | URL / objek | Waktu (WIB) | Tindakan | Yang terlihat | Keyakinan | Batas kesimpulan |
|---|---|---|---|---|---|---|
| EV-ARJ-01 | Developer Dashboard → API Keys & Usage Analytics | 18:12–18:14 | Membaca halaman | Key "Testing", tier FREE, prefiks `sk_live_…`, dibuat 20/9/2026, label "1.000 req/hr"; halaman Usage: "Akun: FREE PLAN", 0 / 1.000 req/hari, sisa 1.000 req, bulan ini 0 req, "Limit harian berlaku per akun (FREE) untuk semua API Key gabungan. Reset otomatis setiap hari pukul 00:00 WIB" | Tinggi | Label "req/hr" vs "req/hari" bertentangan; yang benar hampir pasti harian. **Tidak ada key yang dibuat atau dicabut** |
| EV-ARJ-02 | `stock.arjum.com` → Running Trade | 18:20 | Membuka halaman | Ikon gembok: "Fitur ini sedang dalam fase uji coba dan saat ini hanya tersedia untuk **paid user**" | Tinggi | Menegaskan status akun saat audit masih belum paid; konsisten dengan close code 4403 yang pengguna terima sebelumnya |
| EV-ARJ-03 | Modal "Upgrade Limit Harian API" (dari Usage dan dari tombol "Info Paket" di Running Trade) | 18:15, 18:21 | Membuka modal, menggulir, menutup tanpa membayar | Starter Rp5.000 → +5.000 Req/Hari; Basic Rp10.000 → +10.000; Popular Rp20.000 → +20.000 (Paling Laris); Pro Rp50.000 → +50.000; custom minimal Rp5.000, rasio Rp1 = +1; "Berlaku 30 hari untuk semua paket & nominal custom… Setelah habis, kuota kembali ke 1.000 req/hari gratis"; "**Bonus: Running Trade (uji coba) — Semua paket upgrade otomatis mendapat akses Running Trade** — stream transaksi IDX real-time. Fitur ini sedang dalam fase uji coba dan dapat berubah tanpa pemberitahuan"; "Pembayaran QRIS Resmi & Otomatis" | Tinggi | **Tidak ada QRIS yang dibuat dan tidak ada pembayaran.** Tombol "Info Paket" pada kunci Running Trade membuka modal yang sama — indikasi kuat bahwa top-up apa pun menjadikan akun "paid user", tapi belum dibuktikan |
| EV-ARJ-04 | Developer Dashboard → Dokumentasi API; `stock.arjum.com/landing` | 18:17, 18:33 | Membaca keduanya | Dokumentasi: "ENDPOINT API (**12**)"; landing & FAQ: "**8** REST API Endpoints", "900+ Saham IDX Terindeks" | Tinggi | Inkonsistensi jumlah endpoint antara pemasaran dan dokumentasi |
| EV-ARJ-05 | Dokumentasi API → Live Request Tester | 18:18 | Membaca placeholder | "sk_live_… (Biarkan kosong jika ingin menggunakan **JWT sesi web** kamu)"; header wajib `X-API-Key: sk_live_…` | Tinggi | Mengonfirmasi autentikasi ganda |
| EV-ARJ-06 | `/api/history/SOCI`, `/api/financial-statements/SOCI`, `/api/analysis/SOCI`, `/api/seasonal/SOCI`, `/api/done-details`, `/api/market-cap`, `/api/broker-summary/SOCI` | 18:25–18:40 | `fetch` **tanpa** header Authorization dan **tanpa** X-API-Key (situs ini tidak memakai cookie sama sekali) | Seluruhnya HTTP 200 dengan data lengkap | Tinggi | Diamati **dari konteks browser pada origin yang sama**. Perilaku dari server (tanpa Origin/Referer) **belum diuji**. Ini temuan, bukan rekomendasi: bergantung pada endpoint tanpa autentikasi rapuh dan berisiko |
| EV-ARJ-07 | `/api/history/SOCI` | 18:26 | `fetch`, uji batas `limit` | Skema `{stock_code, frame, rows[]}`; baris `{date, close, change, change_pct, value, volume, freq, f_buy, f_sell, n_foreign, open, high, low, avg}`; `limit` ditolak di luar 20–500 ("Input should be less than or equal to 500"); `frame` daily/weekly/monthly; backend FastAPI; baris 2026-01-14 volume 0, freq 0, value 0, O=H=L=C=705, avg null | Tinggi | Tidak ada parameter rentang tanggal; data hanya bisa diambil mundur dari hari terakhir |
| EV-ARJ-08 | `/api/history/TLKM` vs `api.invezgo.com/analysis/chart/stock/TLKM` | 18:38 | Membandingkan baris 2026-09-14 | Keduanya: O 2.610, H 2.690, L 2.600, C 2.690, volume 139.730.300 | Tinggi | Menunjukkan **upstream yang kemungkinan besar sama**. **Tidak** membuktikan akurasi; dua situs dengan hulu sama bukan verifikasi independen |
| EV-ARJ-09 | `/api/financial-statements/{SOCI,BBCA,HRTA,TLKM}` | 18:28–18:31 | `fetch` dengan berbagai parameter | Skema `{stock_code, report_type, period, count, items[{year, quarter, label, fetched_at, data{}}]}`; `report_type` ∈ {INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW_REPORT}; `period` ∈ {quarterly, annually}; `limit` ≤ 40; SOCI 17 kuartal Q1 2022→Q1 2026; penjualan SOCI Q1 2026 601,4 M, Q4 2025 637,8 M, Q3 2025 731,0 M, Q2 2025 553,9 M, Q1 2025 683,9 M; laba bersih Q4 2025 −73,1 M; `fetched_at` seragam 2026-09-13 18:06:34; BBCA/HRTA/TLKM juga berhenti di Q1 2026 | Tinggi | Nilai yang tidak monoton + adanya Q4 → standalone (inferensi kuat). `fetched_at` bukan tanggal publikasi laporan |
| EV-ARJ-10 | `/api/done-details/dates?code=SOCI` dan `/api/done-details` | 18:32 | Dua `fetch` | 29 tanggal, 2026-08-06 s.d. 2026-09-18, **10 September 2026 tidak ada**; SOCI 18 Sep: total 1.847 (sama dengan `freq` harian), 19 halaman @100, `elapsed_ms` 1,14; baris `{time, market_date, market_board:"RG", price, price_num, lot, qty_num, value_raw, buyer, seller, buyer_type:"D", seller_type, buy_order_number, sell_order_number, action:"BUY"}` | Tinggi | Retensi ±6 minggu pada satu saham; belum diuji apakah seragam untuk semua saham. Ketiadaan 10 Sep bisa berarti libur bursa, saham tidak bertransaksi, atau data hilang — **belum dibedakan** |
| EV-ARJ-11 | `/api/stocks/SOCI?days=30` dan `/api/broker-summary/SOCI` | 18:34–18:40 | Dua `fetch` | `broker_date_min` 2020-01-02, `broker_date_max` 2026-09-18; broker `{broker_code, broker_name:"UBS SEKURITAS INDONESIA", bval, bvol, bfrq, sval, svol, sfrq, nval, nvol}`; bval/bvol = 639,8 ≈ harga 640 → `bvol` dalam lembar | Tinggi | Kedalaman diamati pada satu saham |
| EV-ARJ-12 | `/api/analysis/{SOCI,HRTA}` dan `/api/stocks/SOCI` | 18:29, 18:35–18:36 | Tiga `fetch` | Keluaran markdown: Price Action, Teknikal (SMA/RSI/BB/MACD/ATR), Volume, Foreign Flow, Broker Netflow, Signal (Score /75), Personality Historis, Rekomendasi, Disclaimer "**DATA HISTORIS SEJAK JAN 2020**". Payload `personality[26]`: `{pattern, sample, wr_d3, wr_d5, avg_ret_d3, avg_mfe_5d, avg_mae_5d, tp_hit_rate, cl_hit_rate, wr_event, avg_realized_ret, profit_factor}`; `events[80]`: `{signal_date, pattern, entry_close, close_d3_ret, close_d5_ret, mfe_5d, mae_5d, tp_hit, cl_hit, exit_reason, realized_ret}`; pada `cl_hit=1`, `realized_ret` = −5 persis | Tinggi | `realized_ret` = −5 persis → **biaya transaksi tidak diperhitungkan** (inferensi kuat). Definisi tiap pola dan parameter ATR tidak diungkap |
| EV-ARJ-13 | `/api/screener/latest` | 18:23 | Dua `fetch` berjarak 25 detik | `cached_for_seconds` = 86044 pada keduanya; nilai identik dengan yang pengguna terima pada 18 September | Tinggi | **Bukan** sisa TTL dan **bukan** umur cache yang berjalan. Definisi sebenarnya **belum diketahui**; jangan dipakai menilai kesegaran |
| EV-ARJ-14 | `/api/screener/latest` (field `raw` dan `rows`) dan halaman screener | 18:22–18:24, 17:58 | `fetch` + membaca UI | "SCREENER V5.2 — Jumat, 18 September 2026"; "🟡 FLAT MARKET — Rata-rata +0.1% \| FLAT 5d:0.1%"; "_963 terdata \| 280 likuid \| 683 skip \| 1.0s_"; legenda simbol (✅ akumulasi, ❌ distribusi, 🏦 broker pekat, 🏛️ institusi, 🌍 asing beli, 🔬 teknikal kuat, 🥷 senyap, 🧬 edge historis, 🧨 jebakan historis, 🚀⚠️ pompa, ⏰ telat, 🔥 klimaks); bucket "🥷 AKUMULASI SENYAP — Akumulasi senyap versi base-only, belum ada edge historis khusus"; SOCI & HRTA dengan `wr_event/potential/drawdown` null; UI menampilkan "WR -", "Potensi +-", "DD -" | Tinggi | Kriteria "likuid" tidak diungkap. Dua saham adalah **hasil seleksi**, bukan cakupan |
| EV-ARJ-15 | Developer Dashboard → WebSocket | 18:22 | Membaca dokumentasi | `wss://stock.arjum.com/ws/running-trade`; header `X-API-Key`; "Key owner-nya harus user berstatus **paid user**"; "Browser WebSocket standar tidak mendukung penambahan custom header, sehingga endpoint ini dirancang khusus untuk integrasi skrip, bot, atau server backend"; close code 4401/4403/4408; "Maksimal 1 Koneksi per Owner"; "Bebas Rate Limit & Tanpa Kuota Harian"; "Data Efemeral (In-Memory)"; "Khusus Konsumsi Script & Server"; backoff 2/5/10, maks 30 detik; pesan `snapshot` (market status open/break/closed/weekend, session, session_end, top, recent), `trade` (t/c/a/p/l/v/pc/tn dengan `l` = lot, 1 lot = 100 lembar; `p` per lembar; `v` nilai total Rupiah; `tn` nomor urut transaksi bursa IDX), `top5` (refresh ±5 detik, frekuensi tertinggi sepanjang hari) | Tinggi | **Tidak ada koneksi WebSocket yang dibuka saat audit.** Cara penentuan `c` (buy/sell) tetap tidak dijelaskan |
| EV-ARJ-16 | `/api/market-cap` | 18:40 | `fetch` | `{date, total: **963**, page, per_page, total_pages, data[{code, name, close, listed_shares, listed_shares_label, market_cap, market_cap_label, turnover_ratio, turnover_ratio_label}]}`; BBCA close 6.300, listed_shares 122.042.299.500, market_cap Rp768,87 T; `per_page` maksimal 50 | Tinggi | Satu-satunya endpoint Arjum yang mengembalikan daftar seluruh pasar |
| EV-ARJ-17 | `stock.arjum.com/terms` dan `/privacy` | 18:36–18:37 | Membaca keduanya | ToS 5 pasal, "Terakhir diperbarui: 30 Juli 2026": (1) penerimaan syarat; (2) kuota REST & larangan peretasan/"scraping berlebihan yang mengganggu kestabilan server"/eksploitasi celah kuota; (3) disclaimer — data disebut "informasi publik", "tidak bertanggung jawab atas keputusan investasi"; (4) kerahasiaan API key, hak menonaktifkan; (5) "berhak memperbarui Syarat & Ketentuan ini sewaktu-waktu tanpa pemberitahuan sebelumnya". Privasi: email/nama/foto Google, log penggunaan API, JWT/API key, HTTPS, tidak menjual data pribadi | Tinggi | **Tidak ada** pasal redistribusi, komersial, atribusi, retensi, atau SLA. Tidak ada penyebutan sumber data hulu |
| EV-ARJ-18 | `stock.arjum.com/` — kontrol screener | 17:58 | Membuka dropdown pengurutan | Opsi: Winrate (WR) ↓, Potensi ↓, Drawdown (DD) ↓, Nama A-Z, Kode A-Z; chip ALL/Watchlist/bucket; kotak filter kode | Tinggi | **Tidak ada rule builder**; aturan screener sepenuhnya ditentukan server (`screener_v5.py`) |
| EV-ARJ-19 | `/api/realtime/SOCI` | 18:33 | `fetch` | `source: "db_close_fallback"`, `message: "Market tutup / realtime kosong, pakai data tanggal 2026-09-18"`, `orderbook` berisi level harga dengan volume `null` | Tinggi | Praktik provenance terbaik yang ditemukan dalam audit ini |
| EV-ARJ-20 | `/api/analysis/HRTA` vs kartu screener HRTA | 18:36 | Membandingkan | Kartu: bucket "AKUMULASI SENYAP"; analisis: "Score 35/75 — 🔴 WASPADA — Lebih banyak tekanan jual", "di bawah SMA20" | Tinggi | Inkonsistensi presentasi, bukan tentu inkonsistensi data |

---

## I. Pertanyaan terbuka untuk penyedia

Disusun dari yang paling menentukan keputusan. **Belum dikirim ke siapa pun.**

### I.1 Untuk Invezgo (`admin@invezgo.com`)

1. Halaman Syarat & Ketentuan menyatakan seluruh konten hanya untuk *personal, non-commercial use*, melarang penggunaan bot untuk mengumpulkan data, dan menyatakan satu langganan hanya untuk satu orang. Q&A paket Developer menyatakan penggunaan komersial "berbentuk tools" diperbolehkan sampai omzet Rp15 juta/bulan dan API key boleh dibagikan ke tim. **Mana yang mengikat, dan bisakah kami memperoleh pernyataan tertulis yang menyelesaikan pertentangan ini?**
2. Apakah menampilkan data turunan (skor, sinyal, ringkasan, chart) hasil olahan data Invezgo pada **website publik yang dapat diakses siapa saja tanpa login dan tanpa biaya** termasuk "tools" yang diizinkan pada paket Developer? Jika ya, apakah ada kewajiban atribusi dan bentuk atribusinya seperti apa?
3. Apa **sumber data hulu** untuk harga, broker summary, kepemilikan KSEI, dan laporan keuangan? Apakah Invezgo memegang lisensi distribusi dari Bursa Efek Indonesia dan/atau KSEI yang mencakup pemakaian oleh pelanggan API?
4. **Apakah kami berhak menyimpan data yang diambil melalui API ke database kami sendiri secara permanen?** Bagaimana status data yang sudah tersimpan apabila langganan berakhir — wajib dihapus, boleh disimpan tapi tidak ditampilkan, atau bebas?
5. Paket Enterprise: berapa kisaran harga, bagaimana cakupan lisensinya untuk website publik, apakah tersedia SLA, dan apakah `Data Awal` (2010 untuk harga, 2016 untuk broker summary, 2020 untuk laporan keuangan, 2009 untuk KSEI) berlaku untuk seluruh endpoint tanpa batas 2 tahun?
6. Endpoint `/analysis/keystat/{code}` memuat peringatan bahwa perhitungannya "mungkin kurang tepat". **Kapan aktualisasi selesai, dan metrik mana yang saat ini tidak dapat diandalkan?** Dashboard menunjukkan banyak metrik bernilai 0,00 untuk periode lampau (mis. DER, EBITDA, Revenue, Net Profit BBCA).
7. Laporan keuangan tampil kumulatif YTD dan **tidak memiliki kolom Q4**. Apakah API menyediakan angka kuartal standalone dan laporan tahunan penuh, atau harus diturunkan sendiri?
8. Apakah harga pada `/analysis/chart/stock/{code}` disesuaikan **stock split saja** atau juga **dividen**? Apakah ada parameter untuk memperoleh harga unadjusted?
9. Apa **retensi historis `/analysis/running-trade/{code}`**? Dokumentasi tidak menyebut `Data Awal`. Dengan `limit` maksimal 150, apakah ada cara mengambil satu hari penuh untuk satu saham tanpa ratusan request (mis. endpoint bulk atau ekspor)?
10. Bagaimana tepatnya `bdm`, `ritel`, `foreign`, `ratio`, dan klasifikasi broker Zombie/Asing/Ritel/Institusi dihitung? Bolehkah nilai turunan ini ditampilkan ke pengguna akhir kami?
11. Apa **cakupan pasar default** untuk `foreign_flow` dan untuk `market_type` pada fungsi `broker_*` — RG saja atau seluruh papan?
12. `/analysis/list/stock` mengembalikan 1.203 entri termasuk waran/rights dan emiten yang sudah delisting, tanpa field status. **Apakah ada endpoint atau field untuk status pencatatan (aktif, suspensi, delisting) dan tanggalnya?**
13. Apakah tersedia **trial teknis berbayar jangka pendek** (mis. 7 hari) untuk memvalidasi integrasi sebelum komitmen bulanan? Jika tidak, apakah ada jaminan pengembalian dana jika endpoint tidak sesuai dokumentasi?
14. Catatan keamanan: cookie `access-token` dan `refresh-token` pada `invezgo.com` dapat dibaca JavaScript halaman (bukan `httpOnly`). Apakah ini disengaja?

### I.2 Untuk Arjum / IDX Edge PRO

1. **Apakah data dari REST API Arjum boleh ditampilkan pada website publik milik pihak ketiga?** Ketentuan Layanan tidak menyebut redistribusi sama sekali. Kami memerlukan pernyataan tertulis, karena ketiadaan larangan bukan izin.
2. Apa **sumber data hulu** untuk harga, broker summary, done details, dan laporan keuangan? Apakah ada perjanjian lisensi dengan Bursa Efek Indonesia atau penyedia data? Pasal 3 menyebut data sebagai "informasi publik" — apa dasarnya?
3. Nama "IDX Edge" memakai singkatan IDX. **Apakah ada afiliasi, kerja sama, atau lisensi merek dengan Bursa Efek Indonesia?**
4. **Apakah kami boleh menyimpan permanen** data yang diambil lewat API ke database kami, termasuk done details dan broker summary historis?
5. Endpoint `/api/history`, `/api/financial-statements`, `/api/done-details`, `/api/broker-summary`, `/api/market-cap`, `/api/analysis`, dan `/api/seasonal` **merespons 200 tanpa header autentikasi apa pun** dari konteks browser. Apakah ini disengaja? Jika tidak, kami ingin memastikan integrasi kami tetap sah dengan menggunakan API key — dan ingin tahu apakah perilaku tanpa autentikasi akan ditutup.
6. **Laporan keuangan berhenti di Q1 2026** untuk semua emiten yang kami periksa, padahal `fetched_at` 13 September 2026 dan Q2 2026 sudah tersedia di tempat lain. Berapa keterlambatan tipikal, dan apa jadwal pembaruannya?
7. `fetched_at` seragam untuk semua periode. **Apakah tersedia tanggal penyampaian laporan ke bursa?** Tanpa itu, backtest fundamental berisiko look-ahead bias.
8. **Apa arti pasti `cached_for_seconds`?** Nilainya tetap 86044 pada dua pemanggilan berjarak 25 detik dan sama dengan nilai dua hari sebelumnya, jadi jelas bukan sisa TTL. Bagaimana cara yang benar untuk mengetahui kapan payload screener terakhir dihitung?
9. **Berapa retensi `/api/done-details`?** Kami mengamati 29 tanggal (6 Agustus–18 September 2026) untuk satu saham, dengan 10 September tidak ada. Apakah retensi bergulir, dan apa penyebab tanggal yang hilang?
10. `/api/history` dibatasi 500 candle tanpa parameter rentang tanggal. **Apakah ada cara mengambil data lebih lama dari 500 hari bursa?** Apakah `frame=weekly`/`monthly` menjangkau lebih jauh ke belakang?
11. Apakah harga pada `/api/history` sudah **disesuaikan stock split dan/atau dividen**?
12. Bagaimana field `action` pada done details dan field `c` pada WebSocket ditentukan **buy** atau **sell**? Apakah berdasarkan sisi agresor (nomor order yang lebih baru), atau metode lain?
13. **Apa definisi "likuid"** yang menyaring 280 dari 963 saham? Dan apa kriteria tiap bucket, khususnya "AKUMULASI SENYAP"?
14. Statistik `personality`/`events`: **apakah biaya transaksi dan slippage diperhitungkan?** (Pengamatan kami: `realized_ret` = −5 persis pada event yang kena CL, yang menunjukkan tidak.) Apakah universe backtest menyertakan emiten yang kini delisting, dan bagaimana parameter TP/CL ATR ditentukan?
15. Definisi `f_buy`, `f_sell`, `n_foreign` pada `/api/history`: satuannya lembar, tetapi **mencakup papan mana** (RG saja atau semua)?
16. **Apa yang secara teknis menjadikan akun "paid user"** untuk WebSocket Running Trade? Apakah setiap top-up kuota (termasuk Rp5.000) memberikannya, dan apakah status itu berakhir bersamaan dengan masa 30 hari kuota?
17. Halaman API Keys menulis "1.000 **req/hr**" sedangkan halaman Usage menulis "1.000 **req/hari**". Mana yang benar? Dan apakah ada **rate limit per menit** di luar kuota harian?
18. Landing page menyebut 8 endpoint, dokumentasi menampilkan 12. Mana daftar resmi yang ditanggung ketentuan layanan?
19. Running Trade berstatus "uji coba" dan "dapat berubah tanpa pemberitahuan", sementara Ketentuan Layanan pasal 5 membolehkan perubahan syarat sewaktu-waktu tanpa pemberitahuan. **Apakah tersedia komitmen tertulis (SLA, masa pemberitahuan perubahan, kebijakan deprecation) untuk pengguna yang membangun produk di atas API ini?**
20. Apakah tersedia paket berbayar dengan **kuota lebih besar dari +50.000/hari**, atau kerja sama untuk penggunaan produksi?
