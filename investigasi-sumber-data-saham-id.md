# Laporan Investigasi Sumber Data — Screener Saham Indonesia

**Tanggal investigasi:** 20 September 2026, ±05:10–06:10 UTC (12:10–13:10 WIB)
**Metode:** penelusuran halaman publik + dokumentasi resmi via browser (Claude in Chrome) dan WebFetch. Tidak ada pembelian, tidak ada login, tidak ada pengiriman formulir, tidak ada pemicuan job/worker, tidak ada pengambilan kredensial.
**Status pembangunan:** dijeda sesuai instruksi. Tidak ada kode yang ditulis.

**Penanda tingkat kepastian yang dipakai di seluruh dokumen:**

| Kode | Arti |
|---|---|
| **[OBS]** | Teramati langsung oleh saya di browser pada tanggal di atas |
| **[DOC]** | Terdokumentasi di halaman resmi penyedia |
| **[MKT]** | Klaim pemasaran, belum terukur independen |
| **[INF]** | Inferensi saya dari bukti, bukan pernyataan penyedia |
| **[UNK]** | Belum diketahui / perlu konfirmasi |

---

## 1. Kesimpulan singkat

### 1a. Prototipe privat (internal, tidak dipublikasikan)

**Invezgo: LAYAK SECARA TEKNIS, BELUM TERBUKTI SECARA OPERASIONAL.**

Alasan layak: ada spesifikasi OpenAPI 3.0 publik yang nyata dan dapat dibaca **[OBS]**, autentikasi `Authorization: Bearer` yang cocok untuk backend terjadwal **[DOC]**, dan — ini temuan yang mengoreksi pengetahuan awal — **ada endpoint OHLCV harian historis dengan parameter rentang tanggal (`/analysis/chart/stock/{code}?from=&to=`)** yang sama sekali tidak muncul di halaman "Daftar Endpoint" dokumentasi **[OBS]**. Kebutuhan awal (daftar emiten, OHLCV harian, histori, fundamental, corporate action) semuanya punya endpoint yang tercantum dalam spesifikasi.

Alasan belum terbukti: tidak satu pun request pernah dieksekusi dengan API key berbayar. Kualitas data, kelengkapan lintas 900+ emiten, latensi, dan perilaku error belum teruji. Lihat bagian 11 untuk uji minimum.

**Arjum / IDX Edge PRO (stock.arjum.com): KANDIDAT SERIUS, BELUM TERUJI.** Identitas "Arjum" kini **terverifikasi** (bagian 2). Menawarkan REST API gratis dengan kuota harian, 8 endpoint termasuk OHLCV historis, broker summary, broker accumulation, dan seasonality. Untuk prototipe privat, ini jalur berbiaya nol yang masuk akal untuk diuji lebih dulu sebelum membayar Invezgo.

**IDX langsung (`/primary/TradingSummary/GetStockSummary`): SUMBER TERKAYA UNTUK OHLCV HARIAN, TAPI TIDAK DAPAT DIOTOMATISASI DARI BACKEND.** Teramati mengembalikan **963 emiten dalam satu request** dengan OHLCV + value + frekuensi + foreign buy/sell + listed shares + notasi + delisting date **[OBS]**. Namun hanya berhasil dari sesi browser yang sudah lolos Cloudflare.

### 1b. Website publik (gratis maupun berbayar)

**Invezgo: TIDAK LAYAK dengan ketentuan yang ada sekarang.**

Ketentuan API Invezgo melarang keras "mendistribusikan ulang, memperjualbelikan, atau mengomersialkan kembali" data dan akses API **[DOC]**. Terms situs menambahkan bahwa konsumsi konten dibatasi untuk "personal, non-commercial use only" dan langganan "for one person only and cannot be shared" **[DOC]**. Tidak ada satu pun klausul publik yang mengizinkan penayangan ulang data ke pengguna pihak ketiga, gratis maupun berbayar. Tidak ada bukti publik bahwa paket Enterprise membuka izin redistribusi — yang ada hanya keterangan bahwa Enterprise membuka **kedalaman histori**, bukan hak guna **[DOC]**.

**Arjum / IDX Edge PRO: BELUM JELAS.** Terms-nya (diperbarui 30 Juli 2026) sangat singkat: mengatur kuota, larangan scraping berlebihan, dan disclaimer investasi — **tidak ada klausul redistribusi sama sekali, baik mengizinkan maupun melarang** **[OBS]**. Diam bukan izin. Harus dikonfirmasi tertulis.

**Jalur yang secara hukum paling bersih untuk website publik: lisensi resmi Layanan Data BEI.** IDX memiliki produk lisensi data system-to-system (Real Time / Delayed / End of Day / Log Data) yang secara eksplisit menyebut *Data Vendor, Financial application developer, Fintech Startup* sebagai target **[OBS]**. Harga dan syarat tidak dipublikasikan dan harus ditanyakan langsung.

### 1c. Rekomendasi akhir

**Belum ada sumber tunggal yang memenuhi seluruh kebutuhan untuk website publik.** Untuk prototipe privat, ada dua jalur yang layak diuji (Arjum gratis dulu, Invezgo berbayar bila Arjum kurang). Untuk website publik, tidak ada jalan pintas: perlu jawaban tertulis dari Invezgo dan/atau Arjum, atau lisensi resmi BEI. Jangan memulai pembangunan ingestion produksi sebelum bagian 11 selesai.

---

## 2. Fakta baru dan koreksi terhadap pengetahuan awal

### 2.1 Koreksi penting

| # | Pengetahuan awal | Temuan | Bukti |
|---|---|---|---|
| K1 | Daftar 20 endpoint yang perlu diverifikasi | Spesifikasi OpenAPI memuat **94 path**, jauh lebih banyak dari daftar di halaman dokumentasi. Termasuk endpoint kunci yang hilang dari daftar dokumentasi: `/analysis/chart/stock/{code}` (OHLCV harian), `/analysis/chart/multi-time/{code}`, `/analysis/chart/index/{code}`, `/analysis/running-trade/{code}`, `/analysis/price-table/{code}`, `/analysis/price-seasonality/{code}`, `/analysis/notation`, `/batch/*`, `/usage/api` | **[OBS]** parsing `api.invezgo.com/openapi.json` |
| K2 | "Histori maksimal dua tahun untuk paket reguler, lebih dalam ke Enterprise" | Benar, **dan** ada koreksi penting: kedalaman Enterprise **berbeda per dataset**, bukan seragam 15 tahun. Harga: 2010-01-01. Broker summary/inventory: 2016-01-01. Laporan keuangan & keystat: **2020-01-01**. KSEI: 2009-03-01 | **[OBS]** field `Data Awal: ... [ENTERPRISE]` di OpenAPI |
| K3 | Landing page mengklaim histori panjang | Klaim "**15+ Tahun Data Historis (2009—2026)**" tidak didukung spesifikasi sendiri untuk sebagian besar dataset; fundamental bahkan hanya sejak 2020 **bahkan di Enterprise** | **[MKT]** vs **[OBS]** |
| K4 | Paket Advance/Prime/Max/Elite, harga promosi perlu dicek | Terkonfirmasi. Harga promo **per bulan**: Advance Rp499.900, Prime Rp999.000, Max Rp1.999.900, Elite Rp4.000.000. Tahunan = 10× bulanan (Advance Rp4.999.000 dst), dipasarkan sebagai "Gratis 1 Bulan". Toggle Bulan/Tahun di landing **menampilkan angka yang sama** — angka yang tertera adalah harga bulanan | **[OBS]** halaman `/data-api-saham-indonesia` + `docs/getting-started/subscription` |
| K5 | Paket aplikasi ≠ paket API | Terkonfirmasi tegas. `invezgo.com/pricing` **hanya** menampilkan paket aplikasi (Trial/Starter/Basic/Pro/Ultra, Rp0–Rp299.900). Paket API sama sekali tidak muncul di sana; hanya di `/data-api-saham-indonesia` dan docs | **[OBS]** |
| K6 | "Batch, kuota, rate limit" | **Ditemukan kontradiksi dokumentasi yang belum terselesaikan** pada batas batch — lihat 2.2 | **[OBS]** |
| K7 | Kompetitor snapshot ~937 saham & 10.674 baris kuartalan | **Snapshot terkini jauh lebih kecil**: `fin_data.json` per 13 Sep 2026 13:03 berisi **±611 emiten** (`"fetched"` count) dan **±6.032 baris kuartalan**, rentang tahun 2022–2026 | **[OBS]** |
| K8 | "Identitas publik Arjum belum terverifikasi" | **Terverifikasi.** Arjum = **IDX Edge PRO**, `https://stock.arjum.com`, platform screener + REST API saham IDX, auth header `X-API-Key`, 8 endpoint publik gratis berkuota harian | **[OBS]** situs resmi + **[OBS]** PR publik GitHub yang menyebut `stock.arjum.com` dan `X-API-Key` |
| K9 | "Fungsi finBuka memetakan src=1 ke Invezgo" | **Tidak dapat diverifikasi.** File frontend kompetitor tidak dilampirkan ke sesi ini, dan `index.html` kompetitor dilindungi login. Saya tidak menemukan referensi `invezgo` sama sekali di halaman publik kompetitor | **[UNK]** |
| K10 | "arjum_proxy.php punya ep history, financial, seasonal, broker_summary, broker_accum" | **Konsisten dengan endpoint Arjum yang nyata**: `/api/history/{code}`, `/api/seasonal/{code}`, `/api/broker-summary/{code}`, `/api/broker-accumulation/{code}` semua ada dan dipublikasikan. `financial` **tidak** ada di 8 endpoint publik Arjum — kemungkinan endpoint tak terdokumentasi atau fitur dashboard | **[OBS]** + **[UNK]** untuk `financial` |
| K11 | "fin_data.json: metadata basis standalone dan unit 1e6" | Basis terkonfirmasi: `{"source":"arjum","basis":"standalone","updated":"13 Sep 2026 13:03"}`. **Unit 1e6 TIDAK dapat dikonfirmasi** dan tidak boleh diasumsikan berlaku menyeluruh: baris `p` adalah array posisional **tanpa legenda**, panjang kolom berbeda per template (`t`: `umum` / `bank` / `keuangan`), dan sebagian baris hanya berisi 8 elemen dengan banyak `null` | **[OBS]** |

### 2.2 Kontradiksi dokumentasi Invezgo yang harus ditanyakan

**Batas kode per request batch — tiga angka berbeda dari tiga sumber resmi yang sama-sama aktif hari ini:**

| Sumber | Advance | Prime | Max | Elite |
|---|---|---|---|---|
| Landing `/data-api-saham-indonesia` (tabel "Kapabilitas Batch") | — | — | **10** | **25** |
| `openapi.json` (deskripsi `/batch/*`) | — | — | **10** | **25** |
| Docs `/api-usage/batch/` (tabel + pesan error 400) | — | — | **3** | **10** |

Docs batch bahkan mengutip pesan error server: *"Role MAX hanya diperbolehkan maksimal 3 kode per request batch. Upgrade ke ELITE untuk unlock hingga 10 kode."* **[OBS]**. Selisih ini mengubah estimasi kuota polling hingga **2,5×** (bagian 5). Harus dikonfirmasi sebelum memilih paket.

### 2.3 Fakta baru lain yang menentukan

- **Tidak ada WebSocket.** FAQ resmi: *"Saat ini API Saham Indonesia menggunakan REST API untuk semua endpoint... WebSocket sedang dalam roadmap pengembangan kami."* **[DOC]**. Artinya klaim "update setiap 5 detik" hanya bisa dimanfaatkan lewat polling, dan polling itulah yang memakan kuota.
- **Endpoint screener dibatasi 3 request / 15 menit** **[DOC]**. Ini menutup kemungkinan memakai `/screener/screen` Invezgo sebagai mesin screening untuk pengguna aplikasi kita (maksimum 288 request/hari untuk seluruh aplikasi).
- **Kuota hanya dipotong pada respons HTTP 2xx**; 401/403/404/429/5xx tidak memotong kuota **[DOC]**.
- **Batch hanya tersedia untuk 3 endpoint** (`/batch/order-book`, `/batch/intraday-data`, `/batch/intraday-index`) dan **hanya paket MAX & ELITE** **[DOC]**. Batch **tidak tersedia** untuk chart/OHLCV, broker summary, laporan keuangan, atau kepemilikan — jadi backfill dan EOD tetap 1 request per emiten.
- **Kuota MCP dan REST berbagi satu pool yang sama** **[DOC]**.
- **`/analysis/list/stock` secara eksplisit tidak menyertakan emiten delisting** **[DOC]** → ada *survivorship bias* dan tidak ada riwayat delisting. Ini masalah nyata untuk backtesting.
- **Status page menunjukkan uptime API 99,702%** pada jendela 23 Jun – 20 Sep 2026, di bawah klaim SLA 99,9% di landing **[OBS]**. Komponen "Stock Data Companion" 98,049%.
- **Halaman "Kredibilitas" mengklaim kolaborasi dengan BlackRock, Fidelity, SSGA, Bank of China, Julius Bär, Schroders** **[OBS]** — tanpa penjelasan bentuk kolaborasi. Saya tidak menemukan konfirmasi independen apa pun. Perlakukan sebagai **[MKT]** dan tanyakan langsung; klaim sebesar ini yang tidak terverifikasi adalah sinyal due diligence, bukan bukti kredibilitas.
- **Provenance data tidak pernah dinyatakan.** Tidak ada satu halaman pun — landing, docs, glosarium, terms, kredibilitas — yang menyebut Invezgo sebagai vendor data berlisensi BEI/KSEI, atau menyebut dari mana data broker summary dan KSEI diperoleh **[OBS]**. Untuk website publik ini adalah risiko hukum yang belum terpetakan.
- **SDK resmi nyata dan terpelihara.** `@invezgo/sdk` di npm: versi terbaru 1.3.2, publikasi pertama 1 Nov 2025, terakhir 25 Jul 2026, lisensi MIT **[OBS]**. Ini bukti bahwa produk API-nya hidup, bukan sekadar halaman pemasaran.
- **MCP server nyata**: `https://mcp.invezgo.com/mcp`, mendukung OAuth 2.1 / Bearer / query param **[DOC]**.

---

## 3. Matriks fitur ↔ sumber data

Kolom "Invezgo" dan "Arjum" = ketersediaan menurut spesifikasi/dokumentasi resmi, **belum diuji**.

| Kebutuhan | Invezgo | Arjum (IDX Edge) | IDX langsung | Yahoo | TradingView | Catatan penentu |
|---|---|---|---|---|---|---|
| Daftar emiten | `/analysis/list/stock` **[DOC]** | `/api/search` (autocomplete) **[DOC]** | `GetStockSummary` (963 baris/hari) **[OBS]** | — | — | Invezgo tanpa emiten delisting |
| OHLCV harian (EOD) | `/analysis/chart/stock/{code}` per emiten **[OBS]** | `/api/history/{code}` **[DOC]** | **1 request = seluruh pasar** **[OBS]** | `v8/finance/chart` **[OBS]** | Widget saja | IDX paling efisien, tapi hanya via browser |
| Backfill histori | 2 th reguler / 2010 Enterprise **[DOC]** | Kedalaman **[UNK]** | Per tanggal, manual **[OBS]** | Panjang, tapi tidak stabil | — | Tidak ada yang memberi >2 th tanpa Enterprise |
| Harga ter-*adjust* corporate action | **Diklaim** di landing **[MKT]**, **nol penyebutan "adjust" di seluruh OpenAPI** **[OBS]** | **[UNK]** | Tidak (harga apa adanya) | Ada (`adjclose`) | — | **Celah kritis** |
| Corporate actions | `/analysis/calendar` (11 tipe) **[OBS]** | **[UNK]** | Via situs IDX, manual | Terbatas | — | Payload Invezgo tidak bertipe |
| Fundamental kuartalan | `/analysis/financial-statement/{code}` **[OBS]** | Tidak ada di 8 endpoint publik **[OBS]** | XBRL/XLSX manual | Rasio saja | — | Basis standalone vs YTD **[UNK]** di Invezgo |
| Rasio & valuasi | `/analysis/keystat/{code}` **[DOC]** | `/api/analysis/{code}` **[DOC]** | DER via XLSX IDX Screener **[OBS]** | PER/PBV/ROE **[OBS]** | — | |
| Broker summary | `/analysis/summary/stock/{code}`, RG/NG/TN terpisah, EOD 18:00 WIB **[DOC]** | `/api/broker-summary/{code}` **[DOC]** | Tidak publik | — | — | Invezgo: 1 request per (emiten × pasar × filter investor) |
| Foreign flow | `/analysis/top/foreign` (EOD >18:00) **[DOC]**; net = buy − sell **[DOC]** | Netflow **[DOC]** | **ForeignBuy/ForeignSell per emiten per hari** **[OBS]** | — | — | IDX memberi gross harian gratis |
| Kepemilikan / KSEI | `/analysis/shareholder/ksei/{code}`, update **tanggal 02 tiap bulan** **[DOC]** | **[UNK]** | KSEI terpisah | — | — | |
| Intraday / order book | `/analysis/intraday*`, `/order-book`, `/queue` **[DOC]** | Hanya di Web UI, **bukan** REST **[DOC]** | Tidak | 1m terbatas | Widget | Hanya Invezgo yang punya via API |
| Running trade | `/analysis/running-trade/{code}` **[DOC]** | Halaman `/running-trade` **[OBS]**, bukan endpoint publik | Tidak | — | — | |
| Seasonality | `/analysis/price-seasonality/{code}` **[DOC]** | `/api/seasonal/{code}` **[DOC]** | — | — | — | |
| Backtesting | Tidak ada endpoint; harus dibangun dari OHLCV | Win-rate historis di screener **[DOC]** | — | — | — | Terhalang harga tak ter-adjust + tak ada delisting |
| Chart untuk pengguna | — | — | — | — | Widget `IDX:{kode}` **[DOC]** | Display-only, lihat bagian 9 |

---

## 4. Matriks endpoint Invezgo dan kekurangan datanya

Semua baris di bawah ini berasal dari `openapi.json` dan docs, **bukan dari pemanggilan nyata**.

### 4.1 Endpoint inti

| Endpoint | Metode | Parameter wajib | Respons (contoh resmi) | Histori | Update | Yang belum diketahui |
|---|---|---|---|---|---|---|
| `/analysis/list/stock` | GET | — | `code, name, sector, logo` | — | Saat ada perubahan/IPO | Tidak ada `listed_shares`, `free_float`, status suspensi, tanggal listing, atau emiten delisting |
| `/analysis/information/{code}` | GET | `code` | Profil, sektor, industri, direksi, anak usaha, tanggal listing | — | Bulanan | Format field belum dilihat |
| `/analysis/notation` | GET | — | Notasi khusus BEI | — | Saat ada perubahan | Skema respons **[UNK]** |
| `/analysis/chart/stock/{code}` | GET | `code`, `from`, `to` | `date, open, high, low, close, volume` | 2 th / **2010** Ent. | "Realtime" | **Tidak ada `value`/turnover, tidak ada `frequency`, tidak ada flag adjusted, tidak ada batas jumlah baris per request** |
| `/analysis/chart/multi-time/{code}` | GET | `code`, `from`, `to`, `timeframe` | idem | 1m:3bln, 5m:6bln, 15m:1th, 30m/60m/D/W/M: 2th | "Realtime" | Sama seperti di atas |
| `/analysis/intraday-data/{code}` | GET | `code` | `open, high, low, close, avg, volume, freq, value, prev, bid_price, bid_lot, bid_freq, offer_*, iep, iev` | — | Realtime / historis dengan `date` | Lihat 4.2 soal satuan |
| `/analysis/order-book/{code}` | GET | `code` | `bidNprice, bidNlot, bidNfreq` + offer | Historis via `date`+`time` | Realtime | Kedalaman level sebenarnya **[UNK]** |
| `/analysis/summary/stock/{code}` | GET | `code`, `from`, `to`, `investor` (all/f/d), `market` (RG/NG/TN) | `code, buy_freq, buy_volume, buy_value, sell_freq, sell_volume, sell_value, ...` | 2 th / **2016** Ent. | **EOD 18:00 WIB** | Nilai dikembalikan sebagai **string**. Tidak ada opsi gabungan lintas pasar — RG+NG+TN = 3 request |
| `/analysis/top/foreign` | GET | **[UNK]** | Top foreign accumulation/distribution | 2 th / **2010** Ent. | EOD setelah 18:00 WIB | Hanya "top", bukan seluruh emiten. Definisi gross/net per pasar **[UNK]** |
| `/analysis/inventory-chart/stock/{code}` | GET | `code` + periode | Time series broker activity | 2 th / **2016** Ent. | EOD 18:00 WIB | **Definisi "inventory" tidak pernah dijelaskan.** Karena data awal 2016 = era broker summary, **[INF]** kuat: ini akumulasi transaksi dalam rentang, **bukan** kepemilikan aktual. Harus dikonfirmasi |
| `/analysis/shareholder/ksei/{code}` | GET | `code` | Komposisi KSEI | 2 th / **2009-03** Ent. | **Tanggal 02 tiap bulan** | Tidak ada pembedaan **tanggal efektif laporan** vs **tanggal masuk sistem** |
| `/analysis/shareholder/{code}` | GET | `code` | Komposisi kepemilikan | — | Bulanan sesuai laporan emiten | idem |
| `/analysis/financial-statement/{code}` | GET | `code`, `statement` (BS/IS/CF), `type` (FY/Q/Q1–Q4), `limit` | `rows[].{id, name, level, values[].{col, year, amount, period}}` hierarkis | 2 th / **2020** Ent. | "Real-time sesuai laporan emiten" | **Tidak ada flag standalone vs YTD kumulatif, tidak ada konsolidasi vs entitas induk, tidak ada restatement, tidak ada tanggal publikasi, tidak ada mata uang, tidak ada satuan** |
| `/analysis/keystat/{code}` | GET | `code` | PER, PBV, ROE, DER, dividend yield | 2 th / **2020** Ent. | idem | Basis TTM vs FY **[UNK]** |
| `/analysis/calendar` | GET | minimal satu dari `code`/`date`/`type` | `{totalPage, page, nextPage, data[].{code, type, payload}}` | **[UNK]** | **[UNK]** | **`payload` tidak bertipe dan berbeda per `type`** → parsing rasio split/dividen harus ad-hoc. Tipe: IPO, PUBLIC_EXPOSE, REVERSE, RIGHT, RUPS_RESULT, RUPS_SCHEDULE, SPLIT, WARRANT, BONUS, CONVERTION, DIVIDEND |
| `/screener/screen` | POST | body **[UNK]** | — | — | — | **Dibatasi 3 request / 15 menit** |
| `/batch/{order-book,intraday-data,intraday-index}/{code}` | GET | `code` dipisah `\|` atau `,` | Array objek | — | Realtime | Batas kode kontradiktif (2.2) |
| `/usage/api` | GET | — | Pemakaian, sisa kuota, waktu reset | — | — | Berguna untuk guard rail ingestion |

### 4.2 Celah semantik yang belum terjawab (harus dikonfirmasi sebelum ingestion)

1. **Adjusted vs unadjusted.** Kata "adjust" **tidak muncul sama sekali** dalam 283 KB spesifikasi OpenAPI **[OBS]**, sementara landing mengklaim "Data harga ter-adjust corporate action" **[MKT]**. Sampai dijawab, asumsikan **unadjusted** dan rencanakan penyesuaian sendiri dari `/analysis/calendar`.
2. **Satuan volume.** Pada `/analysis/intraday-data`, contoh resmi: `volume 66.044.100`, `value 570.441.405.000`, `avg 8.637,28`. `value / volume ≈ 8.637` = harga rata-rata → **[INF]** volume dalam **lembar**, value dalam **IDR**. Tetapi di endpoint yang sama, `bid_lot` bernilai 2.177.700; jika itu benar-benar lot, nilai best bid ≈ Rp1,9 triliun — tidak masuk akal → **[INF]** `bid_lot`/`offer_lot` kemungkinan juga lembar meski dinamai "lot". **Penamaan field tidak konsisten dengan satuannya. Wajib dikonfirmasi.**
3. **Konvensi tanggal.** Contoh `/analysis/chart/stock`: `"date":"2024-09-08T17:00:00.000Z"`. 17:00 UTC = 00:00 WIB hari berikutnya → **[INF]** bar tersebut kemungkinan mewakili hari bursa **2024-09-09**, bukan 09-08. Salah baca satu hari akan merusak seluruh indikator. Wajib diverifikasi terhadap satu hari yang diketahui.
4. **Mata uang.** Tidak pernah dinyatakan. Emiten yang melapor dalam USD (mis. sebagian emiten energi) **[UNK]**.
5. **Fundamental standalone vs kumulatif.** Contoh resmi menampilkan `Q1 2025` dan `Q2 2025` sebagai kolom terpisah, tapi tidak dinyatakan apakah `Q2` = kuartal itu saja atau YTD 6 bulan. Perbedaannya mengubah semua rasio TTM.
6. **IPO, suspensi, delisting, perubahan simbol.** Tidak ada endpoint riwayat. `/analysis/notation` mungkin menutup sebagian (notasi khusus BEI) tapi skemanya belum diketahui. **Tidak ada jalur untuk riwayat perubahan kode emiten.**
7. **Broker summary intraday.** Endpoint dinyatakan **EOD 18:00 WIB** — jadi angka broker hari berjalan **tidak tersedia via API ini**. Apakah ada estimasi intraday di produk lain Invezgo, dan apakah itu observasi nyata atau estimasi, **[UNK]**.
8. **Pagination.** Hanya `/analysis/calendar` yang jelas berpaginasi. Batas baris `/analysis/chart/stock` untuk rentang 2 tahun **[UNK]** — menentukan apakah backfill 1 atau N request per emiten.
9. **Concurrency & IP restriction.** Tidak disebut di mana pun **[UNK]**.

---

## 5. Paket, biaya, kuota, dan estimasi konsumsi

### 5.1 Paket API Invezgo (terverifikasi 20 Sep 2026)

| Paket | Harga promo/bulan | Harga normal/bulan | Tahunan (promo) | Rate limit | Kuota/bulan | Batch |
|---|---|---|---|---|---|---|
| Advance | **Rp499.900** | Rp999.000 | Rp4.999.000 | 250 req/menit | 30.000 | Tidak |
| Prime | **Rp999.000** | Rp1.999.000 | Rp9.990.000 | 500 req/menit | 65.000 | Tidak |
| Max | **Rp1.999.900** | Rp3.999.000 | Rp19.999.000 | 1.000 req/menit | 145.000 | 3 atau 10 (kontradiktif) |
| Elite | **Rp4.000.000** | Rp8.000.000 | Rp40.000.000 | 2.000 req/menit | 320.000 | 10 atau 25 (kontradiktif) |
| Enterprise | Tidak dipublikasikan | — | — | — | — | Kontak `admin@invezgo.com` |

Pajak: **tidak disebutkan** di halaman mana pun **[UNK]**. Tahunan = 10× bulanan (dipasarkan "Gratis 1 Bulan"). Paket aplikasi (Starter–Ultra, Rp39.900–Rp299.900/bulan) **tidak** memberi akses API.

### 5.2 Asumsi perhitungan (eksplisit, silakan koreksi)

- Jumlah emiten: **963** (angka nyata `recordsTotal` IDX untuk 18 Sep 2026) **[OBS]**; dibulatkan 950 untuk skenario watchlist.
- Hari bursa: **20 per bulan**, **240 per tahun** — asumsi, bukan data resmi.
- Durasi sesi efektif: **300 menit/hari** — asumsi (IDX Sen–Kam 09:00–12:00 & 13:30–15:49; Jum lebih pendek). Polling 5 menit → **60 polling/hari**.
- Kuota dipotong hanya pada 2xx **[DOC]**. Retry gagal tidak memotong kuota.
- Batch **tidak** berlaku untuk chart/OHLCV, broker summary, fundamental — hanya intraday-data, order-book, intraday-index **[DOC]**.
- Tidak ada endpoint "seluruh emiten sekaligus" untuk OHLCV harian → **1 request per emiten**.

### 5.3 Estimasi

| # | Skenario | Perhitungan | Request/bulan | Paket minimum |
|---|---|---|---|---|
| 1 | **EOD OHLCV 950 emiten, harian** | 950 × 20 hari | **19.000** | Advance (sisa 11.000) |
| 2 | **Backfill histori awal (2 tahun)** | 950 × 1 request rentang penuh | **950** (sekali) | — |
| 2b | Backfill bila ada batas baris → per tahun | 950 × 2 | **1.900** (sekali) | — |
| 3 | **Fundamental berkala** | 950 × 3 statement (BS/IS/CF) + 950 keystat | **3.800** per siklus | Kuartalan: 3.800/kuartal. Bulanan: 3.800/bulan |
| 4 | **Watchlist 50 emiten / 5 menit** — tanpa batch | 50 × 60 × 20 | **60.000** | Prime (65.000) — nyaris habis |
| 4b | idem — batch 10 (Elite) | 5 × 60 × 20 | **6.000** | Elite |
| 4c | idem — batch 3 (Max, versi docs) | 17 × 60 × 20 | **20.400** | Max |
| 5 | **Seluruh 950 emiten / 5 menit** — tanpa batch | 950 × 60 × 20 | **1.140.000** | **Tidak ada paket yang cukup** (3,6× Elite) |
| 5b | idem — batch 10 (Elite versi docs) | 95 × 60 × 20 | **114.000** | Elite (cukup) |
| 5c | idem — batch 25 (Elite versi landing/OpenAPI) | 38 × 60 × 20 | **45.600** | Elite (sangat longgar) |
| 5d | idem — batch 3 (Max versi docs) | 317 × 60 × 20 | **380.400** | **Melebihi Max 2,6×** |
| 6 | **Broker summary harian, 950 emiten, RG saja, investor=all** | 950 × 20 | **19.000** | — |
| 6b | idem, RG+NG+TN | 950 × 3 × 20 | **57.000** | — |
| 6c | idem, + pecahan asing/domestik (3 pasar × 3 investor) | 950 × 9 × 20 | **171.000** | Elite |

**Kombinasi realistis untuk aplikasi screener harian** (skenario 1 + 3 bulanan + 6 RG saja) = 19.000 + 3.800 + 19.000 = **41.800 req/bulan** → **Prime (Rp999.000/bulan)**.

**Kombinasi dengan pemantauan intraday seluruh pasar** (di atas + skenario 5b) = 41.800 + 114.000 = **155.800** → **Elite (Rp4.000.000/bulan)**, dan itu **bergantung pada batch 10 di Elite benar-benar berlaku**.

Biaya per request: Advance ≈ Rp16,7 · Prime ≈ Rp15,4 · Max ≈ Rp13,8 · Elite ≈ Rp12,5.

### 5.4 Arjum / IDX Edge PRO

Kuota harian gratis untuk setiap akun terdaftar, reset penuh **00:00 WIB**, dapat dinaikkan lewat Developer Dashboard setelah login **[DOC]**. **Angka kuota tidak dipublikasikan** sebelum login **[UNK]**. Tidak ada harga berbayar yang dipublikasikan **[UNK]**.

---

## 6. Hak penggunaan yang menentukan keputusan

### 6.1 Invezgo

**Diizinkan eksplisit**
- Penggunaan API oleh pemegang akun dengan langganan aktif dan API key valid **[DOC]**.
- Penyimpanan API key di vault/secret manager; dokumentasi menganjurkan HashiCorp/Infisical — **[INF]** ini pengakuan implisit bahwa pemakaian dari backend server memang diharapkan.
- `/analysis/list/stock` disebut berguna *"untuk menampilkan daftar saham di website"* **[DOC]** — satu-satunya kalimat yang menyinggung penayangan di website, dan hanya untuk daftar kode emiten, bukan data pasar.

**Dilarang eksplisit**
- Mendistribusikan ulang, memperjualbelikan, atau mengomersialkan kembali data maupun akses API. Sanksi: suspensi permanen akun dan API key **tanpa pengembalian dana**, serta kemungkinan tindakan hukum **[DOC]**.
- Konsumsi konten di luar "personal, non-commercial use"; berbagi langganan antar-orang **[DOC]**.
- Menyalin, membagikan, atau menjual konten tanpa izin, kecuali potongan kecil sesekali untuk tujuan non-komersial **[DOC]**.

**Belum jelas / perlu konfirmasi tertulis**
- Menyimpan hasil API ke PostgreSQL sendiri (cache/warehouse) — tidak diatur sama sekali.
- Menampilkan **data turunan** (indikator, skor, ranking) ke pengguna pihak ketiga. **Jangan berasumsi transformasi menghapus batasan.** Larangan yang tertulis adalah "mengomersialkan kembali data/akses", dan produk screener berbayar berbasis data ini jelas masuk zona abu-abu.
- Ekspor CSV/Excel oleh pengguna akhir aplikasi kita.
- Retensi data setelah langganan berhenti — **tidak ada klausul sama sekali**.
- Kewajiban atribusi — **tidak ada**.
- Apakah Enterprise mengizinkan website publik. Yang terbukti hanya: Enterprise membuka kedalaman histori **[DOC]**. **Tidak ada bukti bahwa Enterprise = izin redistribusi.**
- Status lisensi Invezgo terhadap BEI/KSEI — tidak dinyatakan di mana pun.
- SLA: landing mengklaim 99,9% **[MKT]**; terms justru menyatakan platform bisa down dan Invezgo tidak bertanggung jawab **[DOC]**. **Tidak ada dokumen SLA dengan remedy.**
- Refund: "Refunds are only granted if an error is proven to be made by Invezgo"; selain itu tidak ada refund setelah pembelian **[DOC]**.

### 6.2 Arjum / IDX Edge PRO (Terms 30 Juli 2026)

**Diizinkan eksplisit:** pemakaian REST API dengan kuota harian oleh akun terdaftar.
**Dilarang eksplisit:** percobaan peretasan, scraping berlebihan yang mengganggu server, eksploitasi celah kuota.
**Belum jelas:** **semuanya yang lain** — redistribusi, penyimpanan, website publik gratis/berbayar, atribusi, retensi, sumber data upstream, SLA. Terms juga menyatakan dapat diubah sewaktu-waktu tanpa pemberitahuan **[OBS]**. Untuk produk berbayar, ini risiko kontraktual yang nyata.

### 6.3 Kompetitor (ihsgscreener.com)

File publik seperti `fin_data.json` dan `running_trade.json` dapat diambil tanpa login **[OBS]**. **Aksesibilitas bukan izin.** Tidak ada lisensi, tidak ada terms, tidak ada atribusi. Boleh dipakai sebagai **fixture uji lokal sekali ambil** untuk memvalidasi parser; **tidak boleh** dijadikan endpoint ingestion rutin maupun ditayangkan ulang.

### 6.4 TradingView & Yahoo — lihat bagian 9.

---

## 7. Peta integrasi kompetitor berdasarkan bukti

Catatan: `index.html` kompetitor dilindungi login (`auth_check.js` → `login.html`) **[OBS]**, dan file frontend yang disebut dalam brief **tidak dilampirkan** ke sesi ini. Saya tidak mengaku membacanya. Peta di bawah dibangun dari: halaman publik, file JSON publik, dan **halaman `developer.html` yang ternyata dapat diakses tanpa login**.

| Fitur | Jalur frontend/proxy | Sumber terbukti | Bukti | Kepastian | Sifat |
|---|---|---|---|---|---|
| OHLCV & data pasar harian | Panel admin "Data IDX Real-Time — Multi Hari", kotak paste H-6…H-0 | **idx.co.id `/primary/TradingSummary/GetStockSummary?startDate=…&endDate=…`** | Link `idxLink1..7` ter-hardcode di `developer.html` dengan tanggal 2026-09-10 … 2026-09-16 | **Tinggi** | **Input manual admin** — admin membuka link di browser, menyalin JSON, menempel ke panel |
| Harga terkini di dataset publik | `import_idx.php?action=enrich&price_only=1` | **Yahoo Finance** | Tombol "Update Harga (Yahoo)" + `data.json` berisi `"meta":{"enrich":{"msg":"956/958 saham di-enrich dari Yahoo Finance"}}` | **Tinggi** | Otomatis (dipicu manual) |
| IHSG di landing | `yahoo_quote.php?symbols=^JKSE` | **Yahoo Finance** (proxy server-side) | Teramati di network log saat memuat halaman depan | **Tinggi** | Otomatis |
| Dataset screener utama | `data.json` (cache-bust `?t=`) | Deklarasi sendiri: `"source":"IDX Screener (info+DER) + Yahoo Finance (fundamental+harga)"`, `"total":958` | Diambil langsung, `Last-Modified` Jum 18 Sep 2026 10:01 UTC | **Tinggi** | **Snapshot JSON** |
| DER & info emiten | Upload **XLSX IDX Screener** di panel admin | **IDX (file XLSX)** | "Upload file XLSX dari IDX Screener", plus mode "Update DER Saja (Aman)" | **Tinggi** | **Input manual admin** |
| Fundamental kuartalan | `bulk_fetch.php` → `fin_data.json` | **Arjum (stock.arjum.com / IDX Edge PRO)** | `fin_data.json` diawali `{"source":"arjum","basis":"standalone","updated":"13 Sep 2026 13:03"}`; teks panel: "hasil Bulk Fetch laporan keuangan Arjum, per kuartal berdiri sendiri" | **Tinggi** untuk sumber; **Sedang** untuk endpoint (endpoint `financial` tidak ada di 8 endpoint publik Arjum) | Otomatis (dipicu manual), snapshot mingguan |
| Broker summary / akumulasi / seasonality | (disebut di brief sebagai `arjum_proxy.php?ep=…`) | **Arjum** — `/api/broker-summary/{code}`, `/api/broker-accumulation/{code}`, `/api/seasonal/{code}`, `/api/history/{code}` semuanya nyata dan dipublikasikan | Halaman FAQ `stock.arjum.com` | **Sedang-Tinggi** (nama `ep` cocok persis; file proxy tidak dapat saya baca) | Otomatis |
| Running trade | `running_trade.json` | **[UNK]** — tidak ada penanda sumber di dalam file | Diambil langsung: `Last-Modified` Jum 18 Sep 08:59 UTC (15:59 WIB, sekitar penutupan). Isi: `{"t","c":"buy/sell","a":"15:49:57","p","l","v","tn":"202609180001838376","ts"}` | **Tinggi** bahwa file terisi selama jam bursa; **[UNK]** sumber upstream | Otomatis (worker) |
| Whale Alert | Panel admin, paste "Data Buy & Sell dari RTI / IPOT" | **RTI / IPOT** (aplikasi pihak ketiga) | Teks panel admin | **Tinggi** | **Input manual admin** |
| BPJS Day Trade | Panel admin, paste Data Buy + Market | **RTI / IPOT** | Teks panel admin | **Tinggi** | **Input manual admin** |
| Manajemen delisting | Daftar blokir manual di panel | Admin | Teks panel admin | **Tinggi** | **Input manual admin** |
| ARA/ARB | `ara_data.json`, `ara_history.json` (`?v=YYYYMMDDHH`) | **[UNK]** | Teramati di network log | Sedang | Snapshot JSON |
| Invezgo sebagai sumber | — | **Tidak ditemukan.** Kata "invezgo" tidak muncul sama sekali di `developer.html` maupun halaman publik kompetitor | Pencarian teks pada DOM | — | **[UNK]** — klaim `invezgo_proxy.php` dan `finBuka src=1 → Invezgo` **tidak dapat diverifikasi** tanpa file frontend |
| TradingView / DeepSeek | — | Tidak ditemukan referensi di halaman publik yang saya periksa | — | **[UNK]** | Kemungkinan hanya di area ber-login |

### 7.1 Tiga kesimpulan dari peta ini

1. **Kompetitor tidak punya ingestion IDX otomatis.** Tulang punggung data pasar hariannya adalah **manusia membuka link IDX di browser dan menempel JSON**. Ini bukti kuat bahwa hambatan Cloudflare yang Anda temui adalah hambatan nyata yang juga belum dipecahkan kompetitor — bukan kekurangan di pihak Anda.
2. **Satu-satunya bagian yang benar-benar otomatis dan bernilai adalah Arjum** (fundamental, broker summary, seasonality) **dan Yahoo** (harga). Keduanya tersedia untuk Anda juga.
3. **Kualitas operasionalnya rendah.** Fundamental `fin_data.json` sudah **7 hari basi** saat saya periksa, hanya mencakup ~611 dari 963 emiten, dan panel admin sendiri memuat peringatan bahwa import yang salah pernah merusak PER sampai "estimasi upside meledak sampai jutaan persen" **[OBS]**. Bar yang harus Anda lewati untuk unggul tidak tinggi.

### 7.2 Catatan etis & keamanan

Panel `developer.html` kompetitor — termasuk manajemen pengguna, langganan, dan tombol publikasi — **dapat diakses tanpa autentikasi**. Saya hanya **membaca** halaman itu; saya tidak menekan tombol apa pun, tidak membuka `bulk_fetch.php` (berpotensi memicu job), tidak menyentuh data pengguna, dan tidak mereproduksi identitas apa pun dari panel tersebut. Saya sarankan tim Anda juga tidak berinteraksi dengannya.

### 7.3 Kelayakan data kompetitor sebagai fixture vs endpoint

| Pemakaian | Penilaian |
|---|---|
| **Fixture uji lokal** (validasi parser, bentuk skema, uji indikator) | **Layak terbatas.** `fin_data.json` dan `running_trade.json` bentuknya bersih dan realistis. Ambil **sekali**, simpan lokal, jangan tayangkan. Ingat: kolom `p` posisional tanpa legenda → Anda harus merekayasa balik arti kolom, dan itu rapuh |
| **Endpoint ingestion rutin** | **Tidak layak.** Tidak ada izin, tidak ada SLA, tidak ada kontrak, dapat hilang kapan saja, sudah terbukti basi 7 hari, dan polling rutin ke properti pihak ketiga tanpa izin adalah masalah hukum sekaligus etika |

---

## 8. TradingView, Yahoo, dan Stooq

### TradingView
- **Fungsi:** widget Advanced Chart dengan simbol `IDX:{kode}` — **display-only di browser**. Tidak ada API data untuk backend.
- **Batasan yang menentukan** **[DOC]**: terms melarang penggunaan *non-display* — "automated trading, automated order generation, price referencing, order verification, algorithmic decision-making... atau proses berbasis mesin apa pun yang tidak melibatkan tampilan langsung yang terbaca manusia". Juga melarang sublicensing/distribusi konten market data.
- **Artinya:** TradingView boleh dipakai untuk **menampilkan chart kepada pengguna**, dan **tidak boleh** menjadi sumber angka untuk indikator, screener, sinyal, atau backtest kita. Atribusi wajib.

### Yahoo Finance
- **Status akses:** endpoint `query1.finance.yahoo.com/v8/finance/chart/{kode}.JK` dan `^JKSE` **bukan API resmi ber-SLA** — ini endpoint internal situs. Sepanjang 2025–2026 terdapat laporan luas mengenai pemblokiran, 401 intermiten, dan kebutuhan `crumb`/cookie; pustaka komunitas seperti `yfinance` berulang kali rusak **[DOC/komunitas]**.
- **Ketentuan** **[DOC]**: dilarang menjual/menyewakan/mensublisensikan API atau memperoleh pendapatan dari penyediaannya tanpa izin tertulis; dilarang dipakai untuk produk yang bersaing dengan layanan Yahoo; dan terdapat kewajiban menghapus data Yahoo dalam **24 jam** kecuali dokumentasi API mengizinkan penyimpanan permanen. **Ini bertabrakan langsung dengan kebutuhan Anda menyimpan histori di PostgreSQL.**
- **Jangan** memperlakukan pustaka komunitas atau endpoint yang kebetulan bisa diakses sebagai API resmi.

### Stooq
Muncul sebagai alternatif data IHSG. **Tidak saya verifikasi pada sesi ini** — cakupan per-emiten IDX, kedalaman histori, dan ketentuan penggunaannya **[UNK]**.

### Yang tetap tidak terpenuhi bila hanya memakai TradingView + Yahoo
Broker summary, foreign flow per emiten, kepemilikan KSEI, order book, running trade, corporate action terstruktur, laporan keuangan terstandardisasi, notasi khusus, riwayat delisting/suspensi — **tidak satu pun tersedia**. Ditambah larangan retensi 24 jam Yahoo dan larangan non-display TradingView, kombinasi ini **tidak dapat menopang produk Anda**, bahkan untuk prototipe yang menyimpan histori.

---

## 9. Rancangan sumber sementara dan sumber produksi (tanpa implementasi)

### Lapis A — Prototipe privat, sekarang (biaya Rp0, tidak dipublikasikan)
- **OHLCV harian + foreign flow + notasi + listed shares:** IDX `GetStockSummary`, satu request per hari bursa, dijalankan dari sesi browser manusia. 963 emiten sekaligus. **Bukan otomatis** — akui ini sebagai keterbatasan yang diketahui, bukan solusi.
- **Fundamental, broker summary, seasonality:** Arjum/IDX Edge — daftar akun, ambil API key gratis, uji 8 endpoint.
- **Fixture uji:** satu salinan `fin_data.json` dan `running_trade.json` untuk memvalidasi parser. Sekali ambil, lokal saja.
- **Chart untuk mata manusia:** widget TradingView, dengan atribusi, **tidak** dijadikan sumber angka.

### Lapis B — Prototipe privat berbayar (setelah uji Lapis A)
- **Invezgo Advance atau Prime**, dipakai sebagai sumber tunggal untuk OHLCV + fundamental + broker summary, dengan `/usage/api` sebagai guard rail kuota.
- Simpan mentah di PostgreSQL apa adanya, plus kolom `source`, `fetched_at`, dan `as_of` terpisah dari `report_date`. Jangan pernah menggabungkan tanggal efektif laporan dengan tanggal pembaruan sistem.
- Tangani penyesuaian corporate action sendiri dari `/analysis/calendar` sampai Invezgo menegaskan status adjusted.

### Lapis C — Produksi untuk website publik
Hanya setelah salah satu dari ini beres:
1. **Konfirmasi tertulis** dari Invezgo bahwa paket tertentu (kemungkinan Enterprise) mengizinkan penayangan data dan data turunan kepada pengguna pihak ketiga, dengan batas yang jelas; **atau**
2. **Konfirmasi tertulis** serupa dari Arjum/IDX Edge, beserta pengungkapan sumber upstream mereka; **atau**
3. **Lisensi Layanan Data BEI** langsung (IDX Equity EoD / Professional / Basic), yang secara eksplisit menyasar *financial application developer* dan *fintech startup*.

Tanpa salah satu dari ketiganya, website publik tidak boleh diluncurkan dengan data dari sumber-sumber ini.

### Prinsip desain yang berlaku di semua lapis
- Abstraksikan penyedia di balik satu antarmuka internal sejak awal; jangan mengunci skema ke bentuk respons satu vendor.
- Simpan `raw_payload` untuk setiap tarikan. Semua kekacauan satuan/tanggal di bagian 4.2 hanya bisa diperbaiki retroaktif bila payload mentahnya masih ada.
- Pisahkan tegas empat stempel waktu: **waktu kejadian transaksi**, **waktu penyedia memproses**, **waktu respons API**, **waktu tampil**. Lihat bagian 10.

---

## 10. Klaim realtime — pemisahan yang wajib dilakukan

| Lapis waktu | Yang diketahui |
|---|---|
| **Waktu kejadian transaksi di bursa** | Tidak pernah dinyatakan oleh Invezgo. Tidak ada field latensi sumber di respons mana pun **[UNK]** |
| **Waktu penyedia memproses** | Diklaim "Update every 5s" **[MKT]**. Tidak ada timestamp di payload yang membuktikannya. Untuk data EOD, dinyatakan jelas: broker summary, foreign flow, inventory, seasonality semua **18:00 WIB** **[DOC]** |
| **Waktu respons API** | Diklaim "< 50ms", "< 35ms avg" **[MKT]**. Halaman demo menampilkan "124ms" pada contohnya sendiri **[OBS]** |
| **Interval polling aplikasi** | Sepenuhnya pilihan kita, dan inilah yang menentukan biaya (bagian 5) |
| **Waktu data tampil di layar** | Tergantung arsitektur kita |

**Pengukuran delay belum dapat dilakukan** dan saya tidak melakukannya: (a) hari ini Minggu, bursa tutup; (b) tidak ada API key; (c) tidak ada timestamp sumber di payload contoh untuk dibandingkan. **Jangan menyamakan "update 5 detik" atau "latensi 50ms" dengan "data bursa tanpa delay".** Keduanya adalah pernyataan tentang infrastruktur penyedia, bukan tentang jarak ke bursa.

Tambahan penting: karena **tidak ada WebSocket** **[DOC]**, satu-satunya cara memanfaatkan pembaruan 5 detik adalah polling 5 detik — yang untuk 950 emiten berarti 950 × 720 polling/hari × 20 hari = **13,68 juta request/bulan**, 43× kuota Elite. Klaim 5 detik secara praktis **tidak dapat dikonsumsi** pada skala seluruh pasar dengan paket mana pun.

---

## 11. Pertanyaan untuk dikirim ke Invezgo (jangan dikirim otomatis — kirim sendiri)

**Akses & teknis**
1. Berapa batas kode per request batch yang sebenarnya untuk MAX dan ELITE? Dokumentasi Anda menyebut 3/10 di `/api-usage/batch/`, sedangkan landing page dan `openapi.json` menyebut 10/25.
2. Apakah ada trial atau free tier untuk paket API? Landing menyebut "Free Tier API key instan" tetapi halaman paket tidak menunjukkannya.
3. Apakah ada pembatasan IP, batas concurrency, atau pembatasan endpoint tertentu per paket selain rate limit dan kuota?
4. Apakah satu API key boleh dipakai dari server produksi terjadwal tanpa browser? Ada batas jumlah key per akun?

**Semantik data**
5. Apakah harga pada `/analysis/chart/stock/{code}` sudah disesuaikan terhadap corporate action (split, reverse split, dividen, rights issue)? Landing menyebut "ter-adjust", tetapi kata "adjust" tidak muncul sama sekali di `openapi.json`.
6. Pada `/analysis/intraday-data`, apakah `volume` dalam lembar dan `bid_lot`/`offer_lot` dalam lot atau lembar? Contoh resmi Anda tampak tidak konsisten.
7. Pada `/analysis/chart/stock`, `"date":"2024-09-08T17:00:00.000Z"` mewakili hari bursa yang mana — 8 atau 9 September?
8. Pada `/analysis/financial-statement` dengan `type=Q`, apakah `amount` adalah kuartal berdiri sendiri atau kumulatif YTD? Konsolidasi atau entitas induk? Apa mata uang dan satuannya? Apakah ada tanggal publikasi dan penanda restatement?
9. Apakah tersedia riwayat emiten delisting, suspensi, dan perubahan kode? `/analysis/list/stock` menyatakan tidak menyertakan emiten delisting.
10. Apa definisi tepat "inventory" pada `/analysis/inventory-chart/*` — akumulasi transaksi dalam rentang, atau kepemilikan aktual?
11. Pada `/analysis/top/foreign`: net atau gross, mencakup pasar apa saja (RG/NG/TN), dan apakah tersedia versi seluruh emiten (bukan hanya "top")?
12. Apakah broker summary intraday tersedia di produk mana pun? Jika ya, apakah angkanya observasi nyata atau estimasi?
13. Pada `/analysis/shareholder/ksei`, apakah respons membedakan tanggal efektif laporan dan tanggal masuk sistem?
14. Berapa batas jumlah baris untuk satu request `/analysis/chart/stock` dengan rentang 2 tahun? Apakah ada pagination?
15. Apakah ada skema respons resmi untuk `payload` pada `/analysis/calendar` per tipe aksi korporasi?

**Komersial & hukum**
16. Apakah kami boleh menyimpan hasil API ke database kami sendiri secara permanen? Berapa lama kami boleh menyimpannya setelah langganan berakhir?
17. Apakah ada paket yang mengizinkan menampilkan data Anda — mentah maupun turunan (indikator, skor, ranking) — kepada pengguna pihak ketiga di website kami, gratis maupun berbayar? Jika ya, paket mana, dan apa batasannya?
18. Apakah Enterprise mengubah hak redistribusi, atau hanya menambah kedalaman histori?
19. Apakah pengguna akhir kami boleh mengekspor data ke CSV/Excel?
20. Apakah ada kewajiban atribusi, dan bagaimana bentuknya?
21. Apakah Invezgo merupakan vendor data berlisensi dari BEI dan/atau KSEI? Bisakah kami menerima salinan atau nomor rujukan lisensinya?
22. Apakah ada dokumen SLA dengan remedy? Status page Anda menunjukkan uptime API 99,702% pada 23 Jun–20 Sep 2026, sementara landing mengklaim 99,9%.
23. Apa bentuk kolaborasi dengan BlackRock, Fidelity, SSGA, Bank of China, Julius Bär, dan Schroders yang disebut di halaman Kredibilitas?
24. Apakah harga yang ditampilkan sudah termasuk PPN?

**Untuk Arjum / IDX Edge PRO (terpisah)**
25. Berapa kuota harian gratis, dan berapa batas maksimum setelah dinaikkan lewat dashboard?
26. Berapa kedalaman histori `/api/history/{code}`, dan apakah harganya ter-adjust corporate action?
27. Apakah ada endpoint laporan keuangan? Bila ya, apa dasarnya (standalone/kumulatif) dan berapa cakupan emitennya?
28. Dari mana data broker summary Anda berasal, dan apakah Anda pemegang lisensi data BEI?
29. Bolehkah data Anda ditampilkan di website publik kami — gratis dan/atau berbayar? Apakah ada kewajiban atribusi?
30. Apakah tersedia paket berbayar dengan SLA dan komitmen terms yang tidak berubah tanpa pemberitahuan?

---

## 12. Daftar bukti

Semua pemeriksaan pada **20 September 2026**, antara **05:10–06:10 UTC (12:10–13:10 WIB)**, kecuali disebutkan lain.

| # | URL | Observasi kunci |
|---|---|---|
| E1 | `https://invezgo.com/id/` | Halaman produk konsumen; fitur screener/AI/workspace; tidak menyebut API |
| E2 | `https://invezgo.com/id/data-api-saham-indonesia` | Tabel paket API + klaim "Update every 5s", "<50ms", "99.9% Uptime SLA", "15+ Tahun Data Historis 2009—2026", "900+ emiten", "Corporate Actions Adjusted". Tabel batch: Max 10, Elite 25. Toggle Bulan/Tahun menampilkan angka identik |
| E3 | `https://invezgo.com/pricing` | Hanya paket aplikasi (Trial–Ultra). Tidak ada paket API |
| E4 | `https://invezgo.com/terms` | "personal, non-commercial use only"; larangan menyalin/membagikan/menjual konten; tidak ada SLA; refund hanya bila terbukti kesalahan Invezgo |
| E5 | `https://docs.invezgo.com/api-usage/` | "membatasi data maksimal 2 tahun ke belakang untuk seluruh endpoint pada paket berlangganan reguler"; larangan redistribusi/komersialisasi ulang; kontak Enterprise `admin@invezgo.com` |
| E6 | `https://docs.invezgo.com/api-usage/endpoint/` | Daftar 7 kategori endpoint; menautkan ke `api.invezgo.com/openapi.json`. **Tidak memuat endpoint chart/OHLCV** |
| E7 | `https://api.invezgo.com/openapi.json` | OpenAPI 3.0, 283.808 karakter, **94 path**; securityScheme API key via header `Authorization`; `Data Awal … [ENTERPRISE]` per endpoint; **0 kemunculan kata "adjust"**; contoh respons per endpoint |
| E8 | `https://docs.invezgo.com/api-usage/batch/` | Batch hanya MAX & ELITE; tabel **MAX 3 / ELITE 10**; contoh `curl` dengan `Authorization: Bearer`; batch = 1 request kuota; pesan error 400 dikutip |
| E9 | `https://docs.invezgo.com/api-usage/quota/` | Kuota per paket; kuota hanya dipotong pada 2xx; `/usage/api` memberi sisa & waktu reset |
| E10 | `https://docs.invezgo.com/api-usage/rate-limit/` | Rate limit per paket; **screener 3 req/15 menit**; header `X-RateLimit-*`; cooldown 5 menit |
| E11 | `https://docs.invezgo.com/api-usage/api-key/` | Key ditampilkan sekali; reset mengetik "RESET"; anjuran vault/secret manager |
| E12 | `https://docs.invezgo.com/api-usage/mcp/` | `https://mcp.invezgo.com/mcp`; OAuth 2.1 / Bearer / query param; **kuota MCP & REST digabung** |
| E13 | `https://docs.invezgo.com/api-usage/sdk-library/` | SDK JS/TS, Python, Go, Rust, PHP dengan repo GitHub |
| E14 | `https://registry.npmjs.org/@invezgo/sdk` | v1.3.2; rilis pertama 1 Nov 2025; terakhir 25 Jul 2026; MIT |
| E15 | `https://docs.invezgo.com/getting-started/subscription/` | Paket Developer: Advance Rp499.900/bln atau Rp4.999.000/th; Prime, Max, Elite; batch hanya Max & Elite |
| E16 | `https://docs.invezgo.com/getting-started/credibility/` | Klaim kolaborasi: Blackrock, Fidelity, SSGA, Bank of China, Julius Bär, Danantara, Schroders, BPRIN UNAIR. Klien: Paper To Billion, Stock Wise, Cak Investment, Jonathan Thamrin |
| E17 | `https://docs.invezgo.com/glossary/foreign-flow/`, `/glossary/broker-summary/` | foreign flow = buy − sell (net); sumber upstream tidak diungkap |
| E18 | `https://status.invezgo.com/` | Per 20 Sep 2026 05:19 UTC: semua online. Uptime jendela 23 Jun–20 Sep: API **99,702%**, Main 99,627%, MCP 99,815%, Stock Data Companion **98,049%** |
| E19 | `https://ihsgscreener.com/` | Memerlukan login. Network log: `data.json`, `ara_data.json`, `ara_history.json`, `auth.php`, `tracker.php`, **`yahoo_quote.php?symbols=^JKSE`** |
| E20 | `https://ihsgscreener.com/developer.html` | **Dapat diakses tanpa login.** Link IDX `GetStockSummary` H-6…H-0 ter-hardcode; upload XLSX IDX; "Update Harga (Yahoo)"; `import_idx.php?action=enrich&price_only=1`; "Bulk Fetch laporan keuangan Arjum, per kuartal berdiri sendiri"; paste RTI/IPOT untuk Whale Alert & BPJS Day Trade; manajemen delisting manual. Referensi PHP: `bulk_fetch.php`, `import_idx.php`, `auth.php`, `tracker.php`, `api_user.php`, `subscription_admin_api.php`, `mail_api.php`. **0 kemunculan "invezgo"** |
| E21 | `https://ihsgscreener.com/fin_data.json` | `Last-Modified` Min 13 Sep 2026 13:03 UTC. Header: `{"source":"arjum","basis":"standalone","updated":"13 Sep 2026 13:03"}`. ±611 emiten, ±6.032 baris kuartalan, tahun 2022–2026, template `umum`/`bank`/`keuangan`, kolom `p` posisional tanpa legenda |
| E22 | `https://ihsgscreener.com/data.json` | `Last-Modified` Jum 18 Sep 2026 10:01 UTC. `"source":"IDX Screener (info+DER) + Yahoo Finance (fundamental+harga)"`, `"total":958`, `"enriched":956` |
| E23 | `https://ihsgscreener.com/running_trade.json` | `Last-Modified` Jum 18 Sep 2026 08:59 UTC (15:59 WIB). 108.996 byte. Field `t,c,a,p,l,v,tn,ts`; `v = p × l × 100` → `l` dalam **lot**, `v` dalam IDR. `tn` berformat nomor transaksi IDX. **Sumber upstream tidak tertera** |
| E24 | `https://stock.arjum.com/` | **IDX Edge PRO**. "REST API gratis", header `X-API-Key`, 8 endpoint: `/api/screener/latest`, `/api/analysis/{code}`, `/api/broker-summary/{code}`, `/api/broker-accumulation/{code}`, `/api/history/{code}`, `/api/seasonal/{code}`, `/api/search`, `/api/health`. Kuota harian reset 00:00 WIB. Realtime hanya di Web UI, bukan REST |
| E25 | `https://stock.arjum.com/terms` | Terakhir diperbarui 30 Juli 2026. Mengatur kuota, larangan scraping berlebihan, disclaimer. **Tidak ada klausul redistribusi.** Dapat diubah sewaktu-waktu tanpa pemberitahuan |
| E26 | `https://stock.arjum.com/api/health` | `{"ok":true,"status":"healthy"}` — endpoint publik tanpa key (1 request) |
| E27 | `https://github.com/budikuatno2-ship-it/auto-cuan/pull/539` | PR publik pihak ketiga: klien `stock.arjum.com` dengan `X-API-Key`, mengambil broker summary, broker accumulation, insider. Bukti independen identitas Arjum |
| E28 | `https://www.idx.co.id/primary/TradingSummary/GetStockSummary?startDate=2026-09-18&endDate=2026-09-18` | **Berhasil di browser.** `recordsTotal: 963`. 32 field per emiten termasuk `OpenPrice, High, Low, Close, Volume, Value, Frequency, ForeignSell, ForeignBuy, ListedShares, TradebleShares, Remarks, DelistingDate, NonRegularVolume/Value/Frequency`. Parameter `length=5` diabaikan — seluruh pasar dikembalikan |
| E29 | `https://www.idx.co.id/id/produk/layanan-data-bei` | Produk lisensi resmi: Market Data BEI, distribusi *system to system*, Real Time / Delayed / End of Day / Log Data. Varian IDX Equity EoD / Professional / Basic / Indices / Recapitulation, ditujukan antara lain untuk *Data Vendor, Financial application developer, Fintech Startup* |
| E30 | `https://www.tradingview.com/policies/` | Larangan penggunaan non-display (algorithmic decision-making, price referencing, dll); kewajiban atribusi; larangan sublicensing market data |
| E31 | Yahoo Developer/API terms + laporan komunitas | Larangan menjual/mensublisensikan/memperoleh pendapatan; larangan bersaing dengan layanan Yahoo; **kewajiban menghapus data dalam 24 jam** kecuali diizinkan; endpoint `query1` tidak resmi dan sering diblokir |
| E32 | Uji egress kontainer ini | `curl` ke `api.invezgo.com`, `stock.arjum.com`, `ihsgscreener.com`, `www.idx.co.id`, `query1.finance.yahoo.com` semuanya **ditolak gateway (403 CONNECT, policy denial)** |

### Keterbatasan investigasi ini — dibaca sebelum mengambil keputusan

1. **Tidak ada satu pun request API yang dieksekusi dengan API key.** Tidak ada paket yang dibeli. Semua pernyataan tentang Invezgo bersifat terdokumentasi, bukan teruji.
2. **Akses server sama sekali tidak dapat diuji dari lingkungan ini.** Egress kontainer memblokir seluruh host yang relevan pada level kebijakan gateway (E32). **Keberhasilan browser di laporan ini bukan bukti bahwa backend Anda dapat menjangkau host yang sama.** Ini harus diuji dari infrastruktur Anda sendiri.
3. **File kompetitor yang disebut di brief tidak dilampirkan** ke sesi ini. `arjum_proxy.php`, `invezgo_proxy.php`, `fin_arjum.php`, `sentiment_proxy.php`, dan fungsi `finBuka` **tidak saya baca** dan tidak saya klaim terverifikasi. Pemetaan `src=1 → Invezgo` tetap terbuka.
4. **Area ber-login kompetitor tidak dimasuki.** Tidak ada percobaan autentikasi.
5. **Tidak ada tombol yang ditekan di panel admin kompetitor**; `bulk_fetch.php` sengaja tidak dibuka karena berpotensi memicu job.
6. **Bursa tutup** (hari Minggu) — pengukuran latensi dan verifikasi data intraday tidak mungkin dilakukan.
7. **Harga dapat berubah.** Semua angka rupiah adalah harga promosi per 20 Sep 2026 dan tidak menyertakan keterangan pajak.

---

## 13. Langkah uji minimum sebelum melanjutkan pembangunan

Urutan ini dirancang supaya pengeluaran terbesar terjadi paling akhir.

**Tahap 0 — tanpa biaya, tanpa vendor (1–2 hari)**
1. Dari **server produksi Anda sendiri** (bukan browser, bukan lingkungan ini), uji apakah `api.invezgo.com`, `stock.arjum.com`, dan `query1.finance.yahoo.com` dapat dijangkau. Catat kode status dan header. Tanpa ini, seluruh rencana ingestion masih berpijak pada asumsi.
2. Kirim pertanyaan bagian 11 ke Invezgo dan ke Arjum. Jangan lanjut ke Tahap 2 sebelum pertanyaan 5, 6, 7, 8, 16, 17, dan 18 terjawab tertulis.

**Tahap 1 — Arjum gratis (2–3 hari)**
3. Daftar akun Arjum, ambil API key gratis, catat kuota harian sebenarnya.
4. Tarik `/api/history/{code}` untuk 5 emiten uji: satu likuid (BBCA), satu yang pernah *stock split*, satu yang pernah *reverse split*, satu IPO baru, satu yang pernah disuspensi. Bandingkan close-nya dengan `GetStockSummary` IDX pada 5 tanggal acak. **Ini uji yang menentukan apakah harganya ter-adjust.**
5. Tarik `/api/broker-summary/{code}` untuk 1 emiten pada 1 tanggal dan bandingkan jumlah buy volume seluruh broker dengan `Volume` IDX pada tanggal yang sama. Selisih besar = cakupan pasar berbeda.
6. Ukur berapa emiten yang benar-benar tercakup, bukan yang diklaim.

**Tahap 2 — Invezgo, paket terkecil, satu bulan (1 minggu uji)**
7. Beli **Advance** saja (Rp499.900). Jangan langsung Elite.
8. Jalankan uji yang sama seperti langkah 4–6 terhadap `/analysis/chart/stock`. Verifikasi khusus: **konvensi tanggal T17:00Z** terhadap satu hari bursa yang diketahui pasti.
9. Rekonsiliasi `volume` dan `value` `/analysis/intraday-data` terhadap `Volume`/`Value` IDX untuk menetapkan satuan secara empiris.
10. Tarik `/analysis/financial-statement` untuk 3 emiten (satu umum, satu bank, satu keuangan) dengan `type=Q`, dan uji apakah Q1+Q2+Q3+Q4 = FY. **Bila ya → standalone. Bila Q4 ≈ FY → kumulatif YTD.** Ini menyelesaikan pertanyaan 8 secara empiris tanpa menunggu jawaban.
11. Hitung berapa emiten dari 963 yang benar-benar mengembalikan 200 untuk tiap endpoint inti. Catat berapa yang 204.
12. Pantau `/usage/api` untuk mengukur konsumsi nyata satu siklus ingestion harian penuh, lalu bandingkan dengan estimasi bagian 5. **Baru setelah angka nyata ini ada, pilih paket.**
13. Ukur latensi respons nyata dari server Anda pada jam bursa, dan catat selisih antara timestamp payload dan waktu terima. Ini satu-satunya cara menguji klaim 5 detik.

**Gerbang keputusan**
- Bila langkah 4/8 membuktikan harga **tidak** ter-adjust dan `/analysis/calendar` tidak memberi rasio split yang dapat diurai secara terprogram → **backtesting tidak dapat dipercaya** dan cakupan produk harus dipersempit.
- Bila pertanyaan 17/18 dijawab "tidak" oleh Invezgo dan Arjum tidak memberi izin tertulis → **jalur website publik hanya tersisa lisensi BEI**, dan itu harus dianggarkan sebelum membangun apa pun yang menghadap publik.
- Bila Tahap 0 langkah 1 gagal dari server Anda → tidak ada vendor yang relevan sampai masalah jaringan itu selesai.

---

*Laporan ini tidak menjanjikan akurasi sinyal entry. Tersedianya data tidak sama dengan validnya strategi; keduanya harus diuji terpisah.*
