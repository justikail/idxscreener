# Riset Sumber Data BEI untuk Website Screener Saham Indonesia

| | |
|---|---|
| **Tanggal pemeriksaan** | 19 September 2026 (Asia/Jakarta, UTC+7) |
| **Situs diperiksa** | https://www.idx.co.id/ |
| **Metode** | Pemeriksaan langsung via browser extension dengan akses Network (`read_network_requests`), navigasi menu resmi, uji parameter read-only bervolume kecil |

**Legenda bukti:** 🟢 `DIAMATI` = pengamatan langsung · 📄 `DOKUMENTASI` = informasi resmi situs · 🔵 `DUGAAN` = inferensi, belum diverifikasi

**Batas pemeriksaan yang dipatuhi:** tidak melakukan pembelian/pendaftaran/penerimaan kontrak · tidak mengirim pesan · tidak mengakali Cloudflare · tidak mengklik tombol Unduh · tidak ada cookie/token/API key/header autentikasi yang disalin ke laporan ini.

---

> ## ⚠️ Revisi 1.1 — 19 September 2026
>
> Ditambahkan setelah rekonsiliasi silang dengan laporan independen atas situs yang
> sama pada tanggal yang sama. **Baca ini sebelum memakai angka di bawah.**
>
> ### Koreksi material 1 — sebagian observasi tercemar periode pengujian situs BEI
>
> Laporan pembanding mencatat pengumuman BEI tentang **periode pengujian situs
> 18 Sep 2026 pukul 18.00 s.d. 19 Sep 2026 pukul 20.00 WIB**, dengan kode emiten
> `DUMMY` terlihat pada halaman Aksi Korporasi. Seluruh pengumpulan data pada laporan
> ini dilakukan **19 Sep 2026 sekitar pukul 13.15–14.00 WIB — di dalam jendela itu.**
>
> | Kategori temuan | Status |
> |---|---|
> | Kontrak API (`date=YYYYMMDD`, `draw`/`start`/`length` diabaikan, tanpa pagination, HTTP 200 pada tanggal invalid) | **Tetap berlaku** — ini perilaku endpoint, bukan isi data |
> | Nilai historis (AADI 9.425 pada 14 Agu, dll.) | **Kemungkinan besar aman** — baris historis tidak diregenerasi oleh pengujian |
> | Klaim `GetAnnouncement` mendekati real-time (entri 13:37 WIB hari Sabtu) | ⚠️ **Perlu uji ulang** — entri itu bisa jadi pengumuman uji. **Rekomendasi §E.8 bergantung pada klaim ini** |
> | Jumlah baris 963 / 965 dan snapshot 2026-09-18 | ⚠️ Mungkin memuat rekaman uji |
>
> ### Koreksi material 2 — `TradebleShares` bukan free float resmi
>
> Di §B.5 dan §E.3 laporan ini menyebut `ListedShares` vs `TradebleShares` sebagai
> "dasar free float". **Koreksi:** `TradebleShares` belum terbukti setara dengan angka
> free float resmi BEI. Perlakukan sebagai **proksi berlabel**, dan gunakan pengumuman
> free float resmi bila berhasil diverifikasi (lihat lead di bawah).
>
> ### Koreksi material 3 — akses server-side kemungkinan besar diblokir
>
> Uji lanjutan pada 19 Sep 2026 dengan pengambil HTTP **server-side (bukan browser)**
> terhadap dua URL `idx.co.id` menghasilkan **HTTP 403 pada keduanya**, konsisten
> dengan proteksi bot Cloudflare. Tidak ada upaya melewati proteksi. Ini **menjawab
> sementara pertanyaan terbuka §F.2 dan langkah teknis §F.7**: otomatisasi dari server
> kemungkinan besar diblokir. Digabung dengan larangan scraping di §C.4, ada **dua
> alasan independen** mengapa arsitektur "ambil otomatis dari idx.co.id" tidak jalan.
>
> ### Dataset yang belum tercakup di laporan ini — **LEAD, BELUM TERVERIFIKASI**
>
> Ditemukan laporan pembanding; **gagal saya verifikasi (403)**. Perlu dibuka dari
> browser Anda sendiri sebelum dipercaya.
>
> | Dataset | URL diklaim | Nilai bila benar |
> |---|---|---|
> | Free float resmi | `/id/perusahaan-tercatat/free-float-perusahaan-tercatat/` (XLSX bulanan) | Mengganti proksi `TradebleShares` dengan angka resmi |
> | Kepemilikan saham (sumber KSEI, >5%) | `/id/perusahaan-tercatat/data-kepemilikan-saham/` (XLSX) | Kepemilikan **bertanggal**, lebih baik dari snapshot `GetCompanyProfilesDetail` |
> | Pengumuman konstituen indeks | `StaticData/NewsAndAnnouncement/ANNOUNCEMENTSTOCK/Exchange/…zip` | Keanggotaan indeks **point-in-time** — mencegah look-ahead bias pada backtest |
> | ESG Sustainalytics | `https://sustainability.idx.co.id/sustainalytics` | Skor ESG 121 perusahaan; hak data pihak ketiga perlu diperiksa |
> | Revisi laporan keuangan | Halaman laporan keuangan yang sama (PDF bertanda "Revisi") | Memerlukan versioning dokumen — **tidak dibahas laporan ini** |
> | Sampel schema EOD & ITCH | `media/8422/idx-equity-eod.zip`, seri `itch-*-message.zip` | Membuktikan schema feed berbayar **sebelum** berlangganan |
>
> ### Dokumen lisensi yang diklaim — **BELUM TERVERIFIKASI**
>
> Laporan ini hanya menemukan halaman umum Layanan Data BEI. Laporan pembanding
> mengklaim tiga dokumen spesifik: *Catalogue & Pricelist Non-AB 2026* (PDF),
> *Data License Agreement 2026* (DOCX), dan *General Terms of Use* (PDF, efektif
> 1 Januari 2024). URL lengkap ada di `idx-riset-data.json` → `meta.revisi`.


---

## A. Kesimpulan Masalah Tanggal — **TERPECAHKAN**

**Penyebab terverifikasi:** nama parameternya salah. Endpoint tidak mengenal `startDate`/`endDate`. Parameter yang benar adalah **`date`** (tunggal).

**Mekanisme kegagalan:** server mengabaikan parameter yang tidak dikenal **tanpa menghasilkan error**, lalu jatuh ke default = **hari bursa terakhir**. Karena itu respons tetap HTTP 200 namun berisi data 2026-09-18.

### Yang **bukan** penyebabnya

| Hipotesis | Bantahan | Bukti |
|---|---|---|
| Cache | Request identik dengan `date` yang benar langsung mengembalikan tanggal historis yang diminta | 🟢 |
| Endpoint hanya snapshot terakhir | Endpoint mendukung tanggal historis, hanya saja satu tanggal per request | 🟢 |
| Pagination perlu `draw`/`start`/`length` | Ketiganya juga diabaikan sepenuhnya. Tidak ada pagination | 🟢 |

### Dukungan rentang tanggal

| Endpoint | Rentang tanggal? |
|---|---|
| `GetStockSummary` | **TIDAK** — hanya satu tanggal per request |
| `GetAnnouncement` | **YA** — `dateFrom`/`dateTo` berfungsi, pagination juga berfungsi |

> Konvensi parameter **berbeda antar endpoint**. Jangan menggeneralisasi dari satu endpoint ke endpoint lain.

---

## B. Bukti Pengujian

### B.1 Via antarmuka resmi 🟢

**Jalur navigasi:** Beranda → Data Pasar → Ringkasan Perdagangan → Ringkasan Saham
**URL:** `https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham/`
**Jenis pemilih tanggal:** kalender **tanggal tunggal**, bukan rentang.

| Tanggal dipilih | Request yang benar-benar dipicu halaman | AADI Close | AALI Close | ACES Close |
|---|---|---|---|---|
| 2026-09-18 *(default)* | — *(SSR, tidak ada XHR)* | 11.975 | 8.600 | 350 |
| 2026-08-14 | `GET .../GetStockSummary?length=9999&start=0&date=20260814` | 9.425 | 7.475 | 354 |
| 2026-07-15 | `GET .../GetStockSummary?length=9999&start=0&date=20260715` | 8.475 | 6.300 | 346 |

Nilai berbeda pada tiga tanggal berbeda → pemilihan tanggal benar-benar berfungsi, bukan tampilan ulang data yang sama.

### B.2 Matriks uji parameter 🟢

Endpoint: `https://www.idx.co.id/primary/TradingSummary/GetStockSummary`

| Query | HTTP | Baris | Tanggal dalam respons | Kesimpulan |
|---|---|---|---|---|
| `?startDate=2026-08-01&endDate=2026-08-30&draw=1&start=0&length=1000` *(URL Anda)* | 200 | 963 | **2026-09-18** | Bug tereproduksi persis. `startDate`/`endDate` diabaikan. `draw` respons = 0 |
| *(tanpa parameter)* | 200 | 963 | 2026-09-18 | Default = hari bursa terakhir |
| `?date=20260814` | 200 | 963 | 2026-08-14 | ✅ **BERHASIL**. AADI Close 9425 |
| `?date=2026-08-14` | 200 | 963 | 2026-08-14 | ✅ Format bertanda hubung **juga diterima** |
| `?date=20260715` | 200 | 965 | 2026-07-15 | ✅ BERHASIL |
| `?date=20260814&date=20260715` | 200 | 965 | 2026-07-15 | Nilai terakhir menang. Tetap satu tanggal |
| `?date=20260816` *(Minggu)* | 200 | 0 | — | Array kosong, **bukan error** |
| `?date=20220higher` *(invalid)* | 200 | 0 | — | Array kosong. **Tidak ada sinyal error sama sekali** |
| `?date=20260814&start=900&length=10&draw=7` | 200 | **963** | 2026-08-14 | `start`/`length`/`draw` **diabaikan**. Baris pertama tetap `No:1` AADI |
| `?date=20260715&length=2` | 200 | **965** | 2026-07-15 | `length` diabaikan |

**Implikasi operasional**

| Temuan | Tindakan |
|---|---|
| Tanggal invalid & hari libur sama-sama HTTP 200 + array kosong | **Jangan pakai status code sebagai sinyal sukses.** Validasi `data[0].Date` sama dengan tanggal yang diminta |
| Tidak ada pagination — `recordsTotal` selalu = `data.length` | Satu request = seluruh emiten hari itu (~963–965 baris, ~645 KB JSON). Backfill = loop per hari bursa |
| Jumlah baris berubah antar tanggal (listing baru & delisting) | Jangan hard-code jumlah emiten |

### B.3 Cakupan historis 🟢

*Spot-check, bukan pemindaian menyeluruh.*

| Tanggal | Baris |
|---|---|
| 2026-07-15 | 965 |
| 2026-08-14 | 963 |
| 2026-09-18 | 963 |
| **2020-01-02** | **671** ← batas terlama yang berhasil |
| 2019-12-30 · 2019-12-02 · 2019-01-02 · 2018-01-02 · 2015-01-05 · 2010-01-04 | **0** |

**Kesimpulan:** cakupan historis terverifikasi dimulai sekitar **2 Januari 2020**.

### B.4 Request minimal terverifikasi

```
GET https://www.idx.co.id/primary/TradingSummary/GetStockSummary?date=20260814
```

- Tanpa kredensial, tanpa header sesi, tanpa cookie yang dikirim manual
- `length`, `start`, `draw` boleh **dihilangkan seluruhnya** (diabaikan)

> ⚠️ **Caveat jujur dan penting:** request ini dijalankan **di dalam browser yang sudah melewati challenge Cloudflare** — saya mengamati request ke `/cdn-cgi/challenge-platform/` pada tab tersebut. Saya **tidak dapat memastikan** request yang sama berhasil dari script server-side atau headless tanpa sesi browser. Ini harus Anda uji sendiri.

### B.5 Field respons (30 field) 🟢

```
No, IDStockSummary, Date, StockCode, StockName, Remarks,
Previous, OpenPrice, FirstTrade, High, Low, Close, Change,
Volume, Value, Frequency, IndexIndividual,
Offer, OfferVolume, Bid, BidVolume,
ListedShares, TradebleShares, WeightForIndex,
ForeignSell, ForeignBuy, DelistingDate,
NonRegularVolume, NonRegularValue, NonRegularFrequency,
persen, percentage
```

**Field bernilai tinggi**

| Field | Kegunaan |
|---|---|
| `ForeignBuy` / `ForeignSell` | Aliran dana asing **per saham per hari** |
| `ListedShares` / `TradebleShares` | Dasar perhitungan **free float** |
| `Bid` / `Offer` + volumenya | Snapshot **1 level** pada penutupan |
| `NonRegularVolume/Value/Frequency` | Pasar negosiasi & tunai, terpisah dari pasar reguler |
| `Remarks` | String 30 karakter memuat notasi khusus & status papan |

Contoh `Remarks`: AADI = `--MO1SD0F10000A121------------` · ABBA = `--U-4100000000E614-E---------X`

> Kamus resmi untuk membaca string `Remarks` **tidak saya temukan** di situs. Perlu reverse-engineering.

---

## C. Inventaris Sumber Data BEI

### C.1 Endpoint JSON yang benar-benar teramati 🟢

| Dataset | URL halaman resmi | Endpoint teramati | Field penting | Cakupan historis | Frekuensi/delay | Format | Login | Otomatisasi | Bukti & keterbatasan |
|---|---|---|---|---|---|---|---|---|---|
| **Ringkasan Saham (OHLCV harian)** | `/id/data-pasar/ringkasan-perdagangan/ringkasan-saham/` | `GET /primary/TradingSummary/GetStockSummary?date=YYYYMMDD` | 30 field (§B.5) | ≥ 2020-01-02 | EoD; pukul 13:4x WIB masih menyajikan hari sebelumnya → **T+0 setelah tutup, bukan intraday** | JSON | Tidak | **Tinggi** | 🟢 Diuji 8+ variasi parameter. Tanpa pagination |
| **Ringkasan Broker** | `/id/data-pasar/ringkasan-perdagangan/ringkasan-broker/` | `GET /primary/TradingSummary/GetBrokerSummary?length=9999&start=0&date=YYYYMMDD` | Kode/Nama Perusahaan, Volume, Nilai, Frekuensi | belum diketahui | EoD | JSON | Tidak | **Tinggi** | 🟢 Dipicu lewat date picker resmi. **Agregat per broker seluruh pasar — bukan per saham** |
| **Ringkasan Margin** | tab "Margin" | `GET /primary/TradingSummary/GetMarginSummary?length=9999&start=0[&date=YYYYMMDD]` | No, Date, Efek, High, Low, Close, Change, Volume, Value, Frekuensi | belum diketahui | EoD | JSON | Tidak | **Tinggi** | 🟢 UI tidak mengirim `date`, tapi **endpoint menerimanya**: `date=20260814` → 234 baris tertanggal 2026-08-14 |
| **Ringkasan Short Selling** | tab "Short Selling" | `GET /primary/TradingSummary/GetShortSellSummary?length=9999&start=0` | belum diketahui | belum diketahui | belum diketahui | JSON | Tidak | belum diketahui | 🟢 **0 baris** saat diperiksa, dengan maupun tanpa `date`. Cek ulang di hari bursa |
| **Ringkasan Indeks (snapshot)** | `/id/data-pasar/ringkasan-perdagangan/ringkasan-indeks` | `GET /primary/StockData/GetConstituent` | IndexCode, PrevVal, HighVal, LowVal, LastVal, ChgVal, ChgPct, DtCreate | **snapshot terakhir saja** | `DtCreate: 2026-09-18T16:00:00` | JSON | Tidak | Sedang | 🟢 Tidak ada parameter tanggal. Respons memuat `Links.Href: /api/api/marketsummary/indexsummary/{KODE}` — **belum saya uji** |
| **Laporan Keuangan + XBRL** | `/id/perusahaan-tercatat/laporan-keuangan-dan-tahunan/` | `GET /primary/ListedCompany/GetFinancialReport?indexFrom=1&pageSize=N&year=YYYY&reportType=rdf&EmitenType=s&periode=tw1\|tw2\|tw3\|audit&kodeEmiten=XXXX&SortColumn=KodeEmiten&SortOrder=asc` | `Attachments[]`: File_Name, File_Path, File_Size, File_Type, File_Modified | **≥ 2019 terverifikasi** | Triwulanan | JSON → **.xlsx, instance.zip (XBRL), inlineXBRL.zip, .pdf** | Tidak | **Tinggi** | 🟢 **Pagination benar-benar berfungsi di sini** |
| **Keterbukaan Informasi** | `/id/perusahaan-tercatat/keterbukaan-informasi/` | `GET /primary/ListedCompany/GetAnnouncement?kodeEmiten=&emitenType=*&indexFrom=0&pageSize=N&dateFrom=YYYYMMDD&dateTo=YYYYMMDD&lang=id&keyword=...` | NoPengumuman, TglPengumuman, JudulPengumuman, PerihalPengumuman, JenisPengumuman, Kode_Emiten, Form_Id, attachments[].FullSavePath | `dateFrom` diterima hingga `19010101` | **Mendekati real-time** — entri pukul 13:37 WIB hari yang sama, termasuk akhir pekan | JSON + PDF | Tidak | **Tinggi** | 🟢 **Mendukung rentang tanggal DAN pagination** — `pageSize=3` benar-benar mengembalikan 3 baris |
| **Profil Perusahaan Tercatat** | `/id/perusahaan-tercatat/profil-perusahaan-tercatat/{KODE}` | `GET /primary/ListedCompany/GetCompanyProfilesDetail?KodeEmiten=BBCA&language=id-id` | Profiles (Sektor, SubSektor, Industri, SubIndustri, PapanPencatatan, TanggalPencatatan, KegiatanUsahaUtama, Status), **PemegangSaham[]** (Nama, Kategori, Jumlah, Persentase, Pengendali), Direktur[], Komisaris[], KomiteAudit[], AnakPerusahaan[] | Snapshot terkini | belum diketahui | JSON | Tidak | **Tinggi** | 🟢 BBCA: 20 pemegang saham, 12 direktur, 4 komisaris, 7 anak perusahaan. Tanpa histori kepemilikan |
| **Stock Screener BEI** | `/id/investhub/stock-screener/` | `GET /primary/StockScreener/GetColumnInfoUrl?lang=id` *(metadata kolom saja)* | Data tabel: Nama, Kode, Sektor, Subsektor, Industri, Subindustri, **Index[]**, PER, PBV, ROE%, ROA%, DER, Mkt Cap — **960 emiten** | Snapshot | belum diketahui | **SSR (di HTML)** | Tidak | Sedang | 🟢 **Endpoint data tidak teramati** — "TERAPKAN" tidak memicu XHR. Sumber keanggotaan indeks + rasio fundamental siap pakai |
| **Daftar Saham** | `/id/data-pasar/data-saham/daftar-saham/` | **Tidak ada XHR** | Kode, Nama, Tanggal Pencatatan, Jumlah Saham, Papan Pencatatan — 962 emiten | Snapshot | belum diketahui | **SSR** | Tidak | Sedang | 🟢 Paginasi 100% client-side — klik halaman berikutnya = **nol request**. Tombol "Unduh" **tidak diklik** |

**Contoh lampiran `GetFinancialReport` — BBCA TW1 2026** 🟢

| File | Tipe | Ukuran |
|---|---|---|
| `FinancialStatement-2026-I-BBCA.xlsx` | .xlsx | 305.377 B |
| `instance.zip` | .zip | 80.554 B |
| `inlineXBRL.zip` | .zip | 175.768 B |
| `FinancialStatement-2026-I-BBCA.pdf` | .pdf | 493.492 B |
| `Lapkeu BCA Mar 26.pdf` | .pdf | 2.713.904 B |

### C.2 Halaman resmi tanpa endpoint terkonfirmasi 🟢

Halaman dibuka dan URL terverifikasi, tetapi **tidak ada XHR data** yang teramati (SSR, atau butuh interaksi yang belum dilakukan). Endpoint = **belum diketahui**.

| Dataset | URL resmi |
|---|---|
| Indeks Saham (daftar & konstituen) | `/id/data-pasar/data-saham/indeks-saham/` |
| Ringkasan Perdagangan & Rekapitulasi | `/id/data-pasar/ringkasan-perdagangan/ringkasan-perdagangan-dan-rekapitulasi` |
| Ringkasan PED | `/id/data-pasar/ringkasan-perdagangan/ringkasan-ped/` |
| Notasi Khusus | `/id/perusahaan-tercatat/notasi-khusus/` |
| Efek Papan Pemantauan Khusus | `/id/perusahaan-tercatat/daftar-efek-pemantauan-khusus/` |
| Aksi Korporasi | `/id/perusahaan-tercatat/aksi-korporasi/` |
| Kalender Perusahaan Tercatat | `/id/perusahaan-tercatat/kalender-perusahaan-tercatat/` |
| Unusual Market Activity (UMA) | `/id/berita/unusual-market-activity-uma/` |
| Suspensi | `/id/berita/suspensi/` |
| Efek Tidak Dijamin (ETD) | `/id/berita/efek-tidak-dijamin-etd/` |
| Daftar Saham Marjin & Short Selling | `/id/data-pasar/data-saham/daftar-saham-marjin/` |
| Daftar Efek Liquidity Provider | `/id/data-pasar/data-saham/daftar-efek-liquidity-provider-saham/` |
| Statistik · Digital Statistic | `/id/data-pasar/laporan-statistik/statistik/` · `/digital-statistic/` |
| Jadwal Libur Bursa | `/id/tentang-bei/jadwal-libur-bursa/` |
| Indeks Saham Syariah | `/id/idx-syariah/indeks-saham-syariah/` |
| XBRL *(taksonomi & dokumentasi, **bukan data**)* | `/id/perusahaan-tercatat/xbrl/` |
| Public Expose Live | `/id/investor/public-expose-live/` |
| Laporan Keberlanjutan · Website ESG | `/id/tentang-bei/laporan-keberlanjutan/` · `sustainability.idx.co.id` |

> 🔵 **Dugaan, belum diverifikasi:** `GetAnnouncement` memiliki field `JenisPengumuman` dan `Form_Id`, sehingga UMA, suspensi, notasi khusus, dan aksi korporasi **kemungkinan** dapat difilter lewat endpoint yang sama. **Jangan diasumsikan benar.**

### C.3 Order book, running trade, order flow — **tidak ada di sumber publik** 🟢

Tidak ditemukan sumber publik untuk running trade, order book multi-level, maupun data broker per saham. Yang tersedia hanya **snapshot bid/offer 1 level pada penutupan** di dalam `GetStockSummary`.

Tersedia komersial melalui **Layanan Data BEI** — `https://www.idx.co.id/id/produk/layanan-data-bei` 📄

| Produk berlisensi | Isi menurut halaman resmi |
|---|---|
| **IDX ITCH Total View / Basic / Last Sale** | Kedalaman order book penuh, last sale → **sumber order flow & running trade** |
| **IDX-i Equity Real Time / Delayed 5 Level Market Depth** | Bid/offer 5 level |
| **IDX-i Equity Real Time / Delayed Order** | Data order |
| **IDX Equity EoD** (Professional / Basic / Indices / Indices Weight / Recapitulation) | EoD terstruktur + bobot indeks |
| **IDX Data Reference (Enterprise Package)** | >800 perusahaan tercatat: laporan keuangan, aksi korporasi, keterbukaan informasi |
| **IDX Index License** | Lisensi indeks untuk ETF / reksa dana / benchmark |
| **IDX Connection License** | Lisensi Network Service Provider |
| **IDX Publication** | Publikasi statistik rutin BEI |

**Kategori lisensi:** Display · Non-Display (4 kategori penggunaan).
Untuk menjadi redistributor, **wajib memegang lisensi Display** terlebih dahulu. 📄

**Cara akses** 📄

- **Koneksi langsung** — via NSP dengan leased line **bandwidth minimum 8.5 Mbps**
  NSP terdaftar: Arthatel · CBN · Matrix · Biznet · Lintasarta · IPC · TNS
- **Koneksi tidak langsung** — via redistributor terdaftar
  - Lokal: Perum LKBN Antara (d/h IMQ) · IQ Plus Prima · **RTI Infokom** · IDX Solusi Teknologi Informasi
  - Asing: Bloomberg · Refinitiv · FactSet · ICE Data · Morningstar · SIX · Baha · FIS · Active Financial

> **Biaya: tidak dilaporkan.** Tabel "Biaya" di halaman resmi kosong saat dibaca. Ada PDF price list terpisah yang **tidak saya buka dan tidak saya verifikasi kemutakhirannya**. Mintalah quotation resmi.

---

### ⚠️ C.4 TEMUAN PALING KRITIS — Syarat Penggunaan BEI

Sumber: `https://www.idx.co.id/id/syarat-penggunaan` 📄 · **Tingkat: PEMBLOKIR**

> "Pengguna dilarang menggunakan atau menyebarluaskan Informasi dan atau data yang diperoleh dari Website kepada pihak lain **untuk tujuan komersial tanpa izin tertulis terlebih dahulu** dari Bursa Efek Indonesia…"

> "Penggunaan Informasi dan atau data… **bukan untuk tujuan komersial** diperbolehkan dengan menyebutkan sumbernya secara lengkap disertai tanggal akses… dan **tidak diperkenankan menggunakan metode web scrapping/crawling**."

**Implikasi**

1. **Website screener komersial** memakai data ini → butuh **izin tertulis BEI** lebih dulu.
2. **Larangan scraping/crawling berlaku bahkan untuk penggunaan non-komersial.** Rencana pengambilan data otomatis terjadwal ke `/primary/…` berada di wilayah ini. Endpoint tersebut publik dan tidak diproteksi, tetapi **publik ≠ boleh dipakai ulang**.

**Pembatasan 3 tahun & kontradiksi yang teramati**

| Sumber | Isi |
|---|---|
| 📄 Syarat Penggunaan | Data Perusahaan Tercatat di Website adalah **3 tahun terakhir**; di luar itu via **TICMI** (`ticmi.co.id`) |
| 🟢 Observasi | `GetFinancialReport?year=2019` mengembalikan lampiran lengkap BBCA 2019; `GetStockSummary?date=20200102` mengembalikan 671 baris — keduanya **>3 tahun** |

> Jangan bersandar pada perilaku ini. Syarat Penggunaan menyatakan BEI dapat mengubahnya **sewaktu-waktu tanpa pemberitahuan**.

**Jalur legal yang tersedia**

- Berlangganan **IDX Data Services** (lisensi Display dan/atau Non-Display sesuai model produk)
- Melalui **redistributor terdaftar** — **PT RTI Infokom** adalah preseden lokal paling dekat dengan model produk ini

*Ini bukan nasihat hukum. Konsultasikan dengan penasihat hukum yang berkualifikasi.*

---

## D. Pemetaan 18 Fitur

### 🟢 Didukung data BEI terverifikasi *(tunduk pada §C.4)*

| # | Fitur | Sumber terverifikasi | Catatan |
|---|---|---|---|
| 1 | Watchlist & simpan filter | Data internal + `GetStockSummary` | Tidak butuh sumber tambahan |
| 2 | Pencarian/profil saham | `GetCompanyProfilesDetail` + `GetStockSummary` | Profil, sektor, papan, direksi, pemegang saham |
| 3 | Dashboard & heatmap | `GetStockSummary` (Change, Value) + Stock Screener (sektor, Mkt Cap) | Bobot sektor lengkap |
| 4 | Grafik & indikator | `GetStockSummary` per hari, backfill ≥ 2020-01-02 | **Hanya EoD**, tanpa intraday |
| 5 | Screener teknikal | `GetStockSummary` historis | ~1.700 hari bursa untuk backfill penuh |
| 6 | Screener fundamental | Stock Screener BEI (PER/PBV/ROE/ROA/DER/MktCap) + `GetFinancialReport` (.xlsx + XBRL) | XBRL = fundamental terstruktur sesungguhnya |
| 7 | Preset strategi + alasan lolos | Kombinasi #5 + #6 | Logika milik Anda |
| 8 | Alert | `GetAnnouncement` + `GetStockSummary` | **Alert EoD & keterbukaan informasi, bukan alert harga real-time** |
| 9 | Kalender peristiwa | `GetAnnouncement` (`JenisPengumuman`, `Form_Id`) | Halaman Kalender & Aksi Korporasi ada, endpoint belum dikonfirmasi |
| 10 | Skor kualitas/valuasi/momentum/likuiditas | Momentum & likuiditas ← `GetStockSummary`; valuasi & kualitas ← Screener + XBRL | Semua input tersedia |

### 🟡 Hanya sebagian — butuh sumber tambahan

| # | Fitur | Yang ada | Yang kurang |
|---|---|---|---|
| 12 | Broker, foreign flow, kepemilikan | **Foreign flow per saham per hari** ✅ (`ForeignBuy`/`ForeignSell`); **kepemilikan** ✅ (`PemegangSaham` + `ListedShares`/`TradebleShares`) | **Broker per saham tidak ada.** `GetBrokerSummary` hanya agregat per broker seluruh pasar — tidak bisa menjawab "broker apa yang akumulasi di BBRI" |
| 13 | Skenario entry & risiko | ATR/volatilitas dari OHLC harian ✅ | Slippage & kedalaman butuh order book berbayar |
| 14 | Backtest & simulasi | Harga EoD ≥ 2020 ✅ | **Tanpa penyesuaian corporate action** — relasi `Previous` ↔ `Close` patah saat split/dividen |
| 18 | Model prediksi | Data latih EoD ✅ | Walk-forward + out-of-sample wajib. Jangan klaim akurasi sebelum diuji |

### 🔴 Belum ditemukan datanya

| # | Fitur | Status |
|---|---|---|
| 11 | Berita/sentimen | Tidak ada feed berita pasar di situs BEI selain pengumuman resmi. Butuh penyedia berita terpisah |

### 💰 Memerlukan layanan berbayar *(bukti: §C.3)*

| # | Fitur | Produk lisensi 📄 |
|---|---|---|
| 15 | Estimasi rata-rata transaksi beli broker | **IDX ITCH** atau IDX-i Equity Real Time Order. Tidak bisa dari data publik |
| 16 | Running trade | **IDX ITCH Last Sale** |
| 17 | Order flow | **IDX ITCH Total View** atau IDX-i 5 Level Market Depth |

---

## E. Rekomendasi Fitur & Pengoptimalan

### 1. "Verified As-Of" di setiap tampilan

- **Logika:** tanggal invalid dan hari libur sama-sama HTTP 200 + array kosong, sehingga pipeline bisa diam-diam menyimpan data hari yang salah.
- **Input:** field `Date` dari respons, bukan tanggal yang diminta
- **Pembaruan:** setiap ingest · **Kesulitan:** rendah · **Keterbatasan:** tidak ada

### 2. Screener berbasis field `Remarks`

- **Logika:** string 30 karakter memuat notasi khusus & status papan. Bandingkan ABBA (`--U-4100000000E614-E---------X`) dengan AADI (`--MO1SD0F10000A121------------`). Memungkinkan filter "kecualikan saham bernotasi khusus / papan pemantauan" yang tidak dimiliki screener lain.
- **Input:** `GetStockSummary.Remarks` · **Pembaruan:** harian · **Kesulitan:** sedang
- **Keterbatasan:** perlu reverse-engineering kamus karakter, dokumentasi resmi tidak ditemukan

### 3. Screener free float

- **Logika:** `ListedShares` vs `TradebleShares` tersedia per hari. ACRO: 3,47 M listed vs 749 jt tradeable. Disilangkan dengan `PemegangSaham.Persentase` + flag `Pengendali` → filter "saham dengan float tipis".
- **Input:** `GetStockSummary` + `GetCompanyProfilesDetail` · **Kesulitan:** rendah
- **Keterbatasan:** data kepemilikan hanya snapshot, tanpa histori perubahan

### 4. Foreign flow akumulatif

- **Logika:** `ForeignBuy − ForeignSell` per hari, diakumulasi 5/20/60 hari, dinormalisasi terhadap `Volume`
- **Input:** `GetStockSummary` · **Pembaruan:** harian · **Kesulitan:** rendah
- **Keterbatasan:** tidak ada — fitur bernilai tinggi tanpa perlu langganan

### 5. Deteksi likuiditas semu

- **Logika:** banyak emiten menunjukkan `Volume: 0` namun `Close` tetap tercatat (ABBA, ADCP, ALTO). Tandai "tidak ada transaksi hari ini" alih-alih menampilkannya sebagai harga wajar.
- **Input:** `GetStockSummary.Volume` & `Frequency` · **Kesulitan:** rendah

### 6. Arbitrase pasar reguler vs non-reguler

- **Logika:** `NonRegularVolume/Value/Frequency` terpisah. APIC 15 Jul: volume reguler 965.300 tetapi non-reguler 26,5 juta (≈ Rp 20 M) — sinyal crossing / transaksi blok besar yang tidak terlihat di chart biasa.
- **Input:** field `NonRegular*` · **Kesulitan:** rendah
- **Keterbatasan:** hampir tidak ada screener retail yang menampilkan ini → diferensiasi

### 7. Pipeline XBRL mandiri

- **Logika:** `instance.zip` + `FinancialStatement-{tahun}-{periode}-{kode}.xlsx` adalah fundamental terstruktur langsung dari sumber. Bangun parser sendiri, jangan bergantung pada rasio siap-saji Stock Screener yang metodologi & waktu pembaruannya tidak terdokumentasi.
- **Input:** lampiran `GetFinancialReport` · **Pembaruan:** triwulanan · **Kesulitan:** tinggi
- **Keterbatasan:** parsing XBRL perlu pemahaman taksonomi BEI

### 8. Alert peristiwa, bukan alert harga

- **Logika:** `GetAnnouncement` mendukung rentang tanggal & pagination sungguhan, dan entri terbit pukul 13:37 WIB pada hari yang sama bahkan di akhir pekan. Alert "RUPS/dividen/aksi korporasi untuk watchlist Anda" dapat mendekati real-time — berbeda dengan harga yang hanya EoD.
- **Input:** `GetAnnouncement` · **Kesulitan:** rendah
- **Keterbatasan:** posisikan produk sebagai *event-driven*, bukan *price-tick-driven*

### 9. Backfill sekali, inkremental setelahnya

- **Logika:** ~1.700 hari bursa sejak 2020-01-02 × ~645 KB ≈ **1,1 GB JSON**, sekali jalan dengan throttle sopan. Setelah itu 1 request/hari.
- **Kesulitan:** sedang
- **Keterbatasan:** volume request yang kecil ini juga menjadi argumen kuat dalam negosiasi lisensi

---

## F. Hambatan & Langkah Konkret Berikutnya

### Hambatan

| # | Hambatan | Tingkat | Detail |
|---|---|---|---|
| 1 | **ToU melarang scraping & penggunaan komersial tanpa izin tertulis** | **PEMBLOKIR** | §C.4. Masalah hukum, bukan teknis. Tidak bisa diselesaikan dengan kode |
| 2 | **Cloudflare** | Tinggi | 🟢 Teramati `cdn-cgi/challenge-platform` aktif. Endpoint berhasil di browser bersesi; perilaku dari server headless **belum diketahui**. Tidak ada upaya mengakalinya |
| 3 | Tidak ada data broker per saham, running trade, order flow | Tinggi | Fitur 15–17 mustahil tanpa lisensi ITCH |
| 4 | Harga hanya EoD | Sedang | Intraday hanya via lisensi berbayar |
| 5 | Tanpa penyesuaian corporate action | Sedang | Backtest akan salah tanpa ini |
| 6 | Banyak halaman SSR tanpa endpoint | Sedang | Daftar Saham, Stock Screener, UMA, Suspensi, Notasi Khusus. Alternatifnya parsing HTML — yang justru **lebih jelas masuk definisi scraping** |
| 7 | Kamus `Remarks` tidak terdokumentasi | Rendah | Perlu reverse-engineering |
| 8 | Endpoint tidak berversi & tidak dijanjikan stabil | Sedang | `/primary/…` adalah backend internal Nuxt, bisa berubah kapan saja tanpa pemberitahuan |

### Langkah berikutnya — legal *(lakukan sebelum membangun lebih jauh)*

1. Hubungi BEI via halaman **Layanan Data BEI** (bagian "Hubungi Kami" / "Cara Berlangganan"). Jelaskan: website screener saham Indonesia, konsumsi **EoD saja**, ~1 request/hari setelah backfill. Minta quotation untuk **IDX Equity EoD Basic/Professional** dan klarifikasi lisensi **Display vs Non-Display**.
2. Paralel, minta penawaran dari **RTI Infokom** dan **IQ Plus Prima** sebagai redistributor lokal — seringkali lebih terjangkau dan tanpa kewajiban leased line 8.5 Mbps.
3. Konsultasikan dengan penasihat hukum apakah menampilkan **harga tertunda/EoD dengan atribusi** pada produk komersial memerlukan lisensi penuh.

### Langkah berikutnya — teknis *(dapat dikerjakan tanpa menunggu lisensi)*

4. Ganti `startDate`/`endDate` → **`date=YYYYMMDD`**. Hapus `draw`/`start`/`length` (diabaikan).
5. Tambahkan assertion: `resp.data.length > 0 && resp.data[0].Date.startsWith(tanggalDiminta)` — jika gagal, tandai hari tersebut dan **jangan simpan**.
6. Bangun kalender hari bursa dari halaman **Jadwal Libur Bursa**, agar akhir pekan/libur tidak memicu alarm palsu.
7. **Uji `GetStockSummary?date=20260814` dari server Anda** (bukan browser) untuk mengetahui apakah Cloudflare memblokir. Ini menentukan apakah otomatisasi layak secara teknis sama sekali.

### Verifikasi yang memerlukan tindakan Anda

8. **Tombol "Unduh" tidak diklik** di halaman mana pun — mengunduh file memerlukan izin eksplisit Anda. Jika ingin format ekspor XLSX/CSV resmi dipetakan (yang mungkin jalur lebih sah daripada memanggil `/primary/`), beri konfirmasi.
9. Jika Anda punya request DevTools untuk **UMA, Suspensi, Notasi Khusus, Aksi Korporasi, atau Kalender** — kirimkan versi **Copy as cURL yang sudah dibersihkan** dari cookie, header autentikasi, dan token. Cukup metode + URL + query string.
10. **Uji ulang `GetShortSellSummary` pada hari bursa aktif** — hasil 0 baris pada hari Sabtu mungkin bukan perilaku normal.

---

## Sumber

- [Ringkasan Saham — IDX](https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham/)
- [Ringkasan Broker — IDX](https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-broker/)
- [Daftar Saham — IDX](https://www.idx.co.id/id/data-pasar/data-saham/daftar-saham/)
- [Laporan Keuangan dan Tahunan — IDX](https://www.idx.co.id/id/perusahaan-tercatat/laporan-keuangan-dan-tahunan/)
- [Keterbukaan Informasi — IDX](https://www.idx.co.id/id/perusahaan-tercatat/keterbukaan-informasi/)
- [Profil Perusahaan Tercatat — IDX](https://www.idx.co.id/id/perusahaan-tercatat/profil-perusahaan-tercatat/)
- [Stock Screener — IDX](https://www.idx.co.id/id/investhub/stock-screener/)
- [Layanan Data BEI — IDX](https://www.idx.co.id/id/produk/layanan-data-bei)
- [Syarat Penggunaan — IDX](https://www.idx.co.id/id/syarat-penggunaan)
