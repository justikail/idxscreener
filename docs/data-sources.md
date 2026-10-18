# Sumber Data

Keputusan sumber terbaru ada di `AGENTS.md` §3 (4 Okt 2026): **Arjum adalah
kandidat sumber utama**; IDX langsung bukan sumber utama karena terblokir
challenge; EODHD dikeluarkan; Invezgo belum dipilih; Index Alpha/Yahoo opsional.

## Arjum — integrasi dataset tambahan, 2026-10-05 (malam)

Kode: `src/server/providers/arjum/adapter.ts` (endpoint baru: insiders,
broker-accumulation, seasonal, health; parameter `year` financial-statements,
`broker_limit`/`all_data` broker-summary — dua yang terakhir belum terbukti),
normalizer di `src/server/ingestion/arjum-*.ts`, jadwal di
`src/server/jobs/datasets.ts`.

Struktur respons semua endpoint di atas diverifikasi live 6 Okt 2026 00.01 WIB
(20 panggilan) — rincian di `docs/arjum-integration-status.md` §0.

**Permintaan pengguna (6 Okt 2026).** Selain jadwal admin, pengguna login
dapat meminta 4 dataset per saham; dikerjakan worker dari antrean bersama
setelah jadwal admin dengan anggaran harian tersendiri (bawaan 30 request).
Rincian aturan: `docs/progress.md` (lanjutan 2), kode `src/server/requests/core.ts`.

**Kuota.** Satu key saja (`ARJUM_API_KEY`, atau key pertama dari
`ARJUM_API_KEYS`; rotasi acak dihapus). Budget = `min(ARJUM_DAILY_BUDGET,
ARJUM_ACCOUNT_QUOTA=1000)`; bawaan 990. Header `x-ratelimit-limit/remaining`
setiap respons disimpan di `provider_quota_usage.provider_*`; reservasi
menolak bila sisa menurut header habis (rekonsiliasi dengan pemakaian di luar
aplikasi, mis. audit). Pemakaian 5 Okt (WIB): 1.087 tercatat aplikasi — di atas
kuota akun, akibat `ARJUM_DAILY_BUDGET=5000` + 5 key; kini dipotong ke 1.000.

**Jadwal per dataset** (`dataset_schedules`, panel admin "Dataset tambahan"):

| Dataset | Bawaan | Request/kode | Catatan |
|---|---|---|---|
| health | aktif, 3 jam, 8/hari | 1 | biaya penyedia 0 menurut audit, tetap dihitung 1 secara lokal |
| price | nonaktif | 1 | hanya daftar kode (maks 50), interval ≥ 15 menit |
| financials | nonaktif | 4 | IS kuartalan 8 + IS tahunan 3 + BS kuartalan 8 + CF kuartalan 8 |
| broker_summary | nonaktif | 1 | sesi terakhir; parameter tambahan menunggu bukti |
| broker_summary (lanjutan) | — | — | dikirim `all_data=true` (terbukti lengkap 63 broker, probe 6 Okt) |
| insiders | nonaktif | ≤3 | halaman 1 + lanjut dari checkpoint halaman; dedup kunci komposit |
| broker_accumulation | nonaktif | 1 | rentang bawaan penyedia (±80 sesi), top 5 per sisi; olahan penyedia |
| seasonal | nonaktif | 1 | olahan penyedia, metode tidak diketahui; ditampilkan terpisah dari hitungan lokal |

Alasan nonaktif: OHLCV harian ±957 saham memakai ±959 dari 1.000 request/hari,
sisa ±40 dikurangi health. Dataset berjalan setelah pembaruan harian final
(harga & health boleh lebih awal dengan kuota OHLCV dicadangkan); kode tertua
dikerjakan dulu (`dataset_fetch_state` = checkpoint); berhenti saat kuota habis,
401/403, atau respons non-JSON.

**Tanpa request tambahan:** kolom `close/listed_shares/market_cap/turnover_ratio`
`/api/market-cap` kini disimpan (`market_cap_snapshots`) saat daftar saham
diperbarui (mingguan, atau sekali bila tabel masih kosong); `f_buy/f_sell/
n_foreign` `/api/history` disimpan di `daily_bars.foreign_*` (lembar) dan bisa
diisi mundur dari raw snapshot dengan `pnpm jobs:backfill-foreign` (0 request).

## Arjum — harga batch `/api/price/list`, 2026-10-18

Probe nyata (1 request, 3 kuota) dari VPS produksi, Minggu 18 Okt 2026 11:18 WIB:
`codes=BBCA,GOTO,ZZZQ` → HTTP 200 JSON, 642 ms, `X-Quota-Cost: 3`, `x-ratelimit-remaining: 997`.

- ZZZQ (fiktif) dilewati di respons (`count: 2`) tetapi **tetap ditagih**. Aplikasi hanya mengirim kode dari database.
- Entri: code, last_price, freq, lot, value, vwap, change (Rp), change_pct, source_date, data_ts, quote_age_ms. `market`: status, label, next_open.
- Akhir pekan: data sesi terakhir (source_date 2026-10-16, data_ts null), freq/lot/value tidak nol (berbeda dari /api/price yang lama).
- lot × 100 = volume lembar di `history` (GOTO 426.579.721 lot = 42.657.972.100 lembar, 16 Okt).
- BBCA 5.175, change −900 (−14,81%) konsisten dengan `history` tersimpan (6.075 → 5.175). Ini konsistensi antar-endpoint penyedia yang sama, bukan verifikasi independen.

Implementasi:
- Adapter `priceList()`: reservasi kuota = jumlah kode unik; batch > 50 kode tanpa retry otomatis.
- Normalisasi `normalizeListQuote()`:
  - Ada source_date → harga untuk tanggal itu; fallback bila < hari ini.
  - Tanpa source_date tetapi ada data_ts → transaksi hari ini (tanggal = waktu fetch WIB).
  - Keduanya kosong → fallback.
  - change_pct penyedia tidak dipakai (contoh dokumentasi tidak konsisten); persentase dihitung dari last − change.
- Dataset `price` (worker) memakai batch:
  - 200 kode per request; boleh scope "semua saham berharga".
  - Hanya Senin–Jumat 08:45–17:00 WIB.
  - Canary 1 kode dulu: bila belum ada transaksi hari ini (libur), berhenti dengan biaya 1.
  - Interval berlaku per putaran.
  - Kode yang tidak ada di respons ditandai gagal.
- Kapasitas: satu potret semua saham ≈ jumlah saham berharga (±957) kuota. Pembaruan OHLCV harian sudah ±960/hari. Dengan satu akun 1.000/hari (aturan sinkronisasi berkala produksi, §3), potret semua saham tidak muat tanpa kenaikan kuota resmi.

## Arjum — audit kapasitas, 2026-10-05

Ringkasan dan bukti: `docs/arjum-capacity-audit.md`, angka terstruktur
`docs/arjum-capacity-audit.json`, kontrak per endpoint
`docs/arjum-endpoint-inventory.csv`, status integrasi
`docs/arjum-integration-status.md`, manifest `docs/arjum-audit/`.
Fakta utama (75 panggilan, satu key): 963 kode (2026-10-02), 1 panggilan = 1
unit kuota termasuk respons kosong, `/api/health` gratis, history menerima
rentang tanggal, done-details hanya tersimpan beberapa bulan terakhir.

## Arjum — pembaruan harian otomatis (lapis 1), 2026-10-05

| Aspek | Status | Dasar |
| --- | --- | --- |
| `/api/history` saat bursa buka | **Diamati 1×**: tidak memuat candle hari berjalan | 2026-10-05 09.38 WIB (Senin, sesi berjalan): patokan BBCA → data terakhir 2026-10-02. Satu pengamatan, bukan jaminan perilaku penyedia |
| Kapan candle harian penyedia final | **Belum diketahui** | Aturan aplikasi (asumsi): candle hari ini tidak disimpan sebelum 16.30 WIB hari kerja (`unfinishedSessionDate`); jadwal pertama 17.00 WIB, ulang tiap jam s.d. 5× |
| Pembaruan inkremental | **Terbukti live** | Run manual via panel admin → worker: 50/50 saham × 20 candle, 999 baris di-upsert (1 dikarantina: BNLI 2026-10-01 open=0, anomali lama), total `daily_bars` arjum tetap 14.945, 0 duplikat; kuota 51 request |
| Biaya per hari | Terjadwal: 1 request (patokan) bila belum ada sesi baru; 1 + jumlah saham tertinggal bila ada (±964 untuk semua saham) | Cakupan = instrumen live yang sudah punya riwayat; saham baru lewat backfill |
| Libur bursa | **Tidak ada kalender resmi** | Tanpa sesi baru sampai percobaan ke-5 → status `no_session` ("libur bursa atau penyedia terlambat"); tidak dibedakan |
| Hitungan kuota per key | **Diukur 2026-10-05** | 1 request per key ke `/api/market-cap?per_page=1`: kelima key `x-ratelimit-limit: 1000`, `remaining` 986/988/989/991/990 → tiap key punya penghitung sendiri. Bertentangan dengan teks dashboard ("per akun, gabungan semua key"); budget aplikasi tetap total ≤ kuota satu akun |
| Daftar semua saham | **Terbukti live** | `pnpm jobs:universe`: 963 saham (data 2026-10-02) dalam 20 halaman; 907 instrumen baru; 6 kode bentrok dengan demo dilewati |

Penjadwal: `pnpm worker` (lokal, sedang dipakai) atau cron `pnpm jobs:daily --scheduled`.
Scheduler di hosting **belum dipasang** karena aplikasi belum di-deploy.

## Arjum — status per 2026-10-04

### Ringkasan

| Aspek | Status | Dasar |
| --- | --- | --- |
| Keterjangkauan dari lingkungan pengembangan ini | **Terbukti** | `GET /api/health` tanpa auth → HTTP 200 `{"ok":true,"status":"healthy"}`, `application/json`, 1,26 s (diuji 2026-10-04) |
| Respons data dengan API key | **Belum diuji** | `ARJUM_API_KEY` belum ada di `.env.local` |
| Kredensial lokal yang ada | **Tidak dapat dipakai** | `ARJUM_BEARER` adalah JWT sesi login web (claim `sub,email,role`), terbit 2026-09-20 09:00 UTC, **kedaluwarsa 2026-09-27 09:00 UTC** (didekode lokal, nilai tidak ditampilkan). Panggilan `GET /api/screener/latest` dengan token ini → **timeout 15 s**, status HTTP tidak diketahui; tidak diulang. Token sesi web juga tidak cocok untuk job otomatis karena umurnya ~7 hari. |
| Bentuk respons endpoint data | **Diamati, belum lewat API key** | Skema dari pengamatan browser di `audit-dashboard-invezgo-arjum.md` §C.2 (18–20 Sep 2026). Satu-satunya respons nyata ber-auth yang tersimpan: `test/arjum-auth-response.json` (`/api/screener/latest`, HTTP 200, 20 Sep 2026) |
| Kuota | **Dokumentasi/UI penyedia, belum diukur** | FREE 1.000 request/hari per akun (gabungan semua key), reset 00:00 WIB (teks UI Usage Analytics, audit §E.4). Header kuota pada respons belum teramati (health hanya mengirim `cf-cache-status`, `cf-ray`, `server`). Apakah `/api/health` dan respons 4xx memotong kuota: belum diketahui |
| Hak penggunaan | **Sebagian jelas** | Terms 30 Juli 2026 (`investigasi-sumber-data-saham-id.md` §6.2): diizinkan pemakaian REST API berkuota oleh akun terdaftar; **dilarang** peretasan, scraping berlebihan, dan **eksploitasi celah kuota**; **belum jelas** penyimpanan, redistribusi, website publik, atribusi, retensi. Pekerjaan lokal tidak terhambat; penayangan publik menunggu kejelasan tertulis |

### Yang SENGAJA tidak dilakukan

- Tidak memanggil endpoint data (`/api/history`, `/api/market-cap`, dll.) tanpa
  key, walau audit mencatat beberapa merespons tanpa auth dari browser. Itu
  jalur frontend, bukan produk API berkuota; memakainya untuk ingestion berarti
  menghindari sistem key/kuota penyedia — Terms melarang eksploitasi celah kuota.
- Tidak memakai key yang terlihat (sebagian tersamar) di `test/running-trade.js`
  atau screenshot. Direktori `test/` kini di-`.gitignore`. **Saran: cabut
  (revoke) key "Testing" di Developer Dashboard bila key itu pernah utuh di
  file tersebut, lalu buat key baru.**
- Tidak mengaktifkan WebSocket running trade (butuh akun paid, di luar scope).

### Endpoint dan kegunaan dalam aplikasi

| Endpoint | Dipakai untuk | Parameter dibatasi di adapter |
| --- | --- | --- |
| `GET /api/history/{code}` | **Ingest** OHLCV harian (`daily_bars`, `source='arjum'`) | `limit` 20–500 (default 120), `frame` daily/weekly/monthly |
| `GET /api/market-cap` | **Ingest** daftar kode + nama (opsi `--top`) | `per_page` ≤ 50, `codes` ≤ 50 |
| `GET /api/financial-statements/{code}` | Probe saja | `limit` ≤ 40 |
| `GET /api/broker-summary/{code}` | Probe saja | — |
| `GET /api/price/{code}` | Probe saja (cek metadata waktu) | — |

Satuan yang dipakai (dari audit §D.1, perlu dikonfirmasi probe pertama):
`volume` history = **lembar**, `value` = **Rupiah**. Volume disimpan apa adanya
dalam lembar, tidak dikonversi. Foreign flow (`f_buy`, `f_sell`, `n_foreign`)
hanya disimpan di raw snapshot — satuan `f_buy/f_sell` belum terkonfirmasi.

Status penyesuaian corporate action (split/dividen) data Arjum **belum
diverifikasi** — baris disimpan dengan `is_adjusted=false` dan
`adjustment_method='unverified'`. Probe `history-monthly-500` dirancang untuk
memeriksa kedalaman histori; verifikasi split butuh tanggal split yang masuk
jangkauan data.

**Terjawab 2026-10-05 (audit kapasitas, live):** `/api/history` **menghormati**
`start_date`/`end_date` — jendela 2020-01-02..2020-03-31 mengembalikan 63 baris
tepat di rentang itu. Catatan audit browser §C.2 ("tidak ada parameter rentang
tanggal") keliru. Adapter masih hanya memakai `limit` (celah #2 di
`docs/arjum-integration-status.md`).

### Cara menjalankan (setelah key tersedia)

```
# 1. Tambahkan ke .env.local (lokal, jangan ke chat/git):
#    ARJUM_API_KEY=sk_live_...
# 2. Probe read-only, maks 10 percobaan HTTP termasuk retry:
pnpm arjum:probe -- --code=BBCA
#    -> ringkasan ke docs/probes/arjum-probe-<tanggal>-BBCA.json,
#       body mentah ke tabel provider_raw_snapshots (bukan git)
# 3. Ingestion kecil (maks 50 kode per run), lalu hitung metrik:
pnpm ingest:arjum -- --codes=BBCA,BBRI,TLKM --limit=120
pnpm jobs:run
```

Pengaman yang aktif di kode: base URL terkunci, kode saham divalidasi sebelum
masuk path, reservasi kuota atomik di `provider_quota_usage` sebelum setiap
percobaan (termasuk retry), budget default 800/hari (`ARJUM_DAILY_BUDGET`),
lock job berbasis lease di `job_locks`, tanpa retry untuk 401/403/4xx/non-JSON,
Retry-After dihormati (ditolak bila > 60 s), run berhenti bila kuota habis atau
auth ditolak.

## IDX langsung (riwayat, bukan sumber utama)

- **Provider DEMO**: aktif sejak M1, data sintetis deterministik. Lihat bagian
  "Provider DEMO" di bawah.
- **Provider IDX (LIVE)**: adapter, validasi, skema, dan test SUDAH DIBANGUN
  dan diverifikasi (unit + integration dengan mock/fixture). **Akses
  server-side sungguhan ke idx.co.id DIBLOKIR Cloudflare** dari lingkungan
  pengembangan sesi ini (dikonfirmasi 2026-09-20, lihat bagian "Hasil uji
  akses nyata" di bawah). **Belum ada satu baris data harga real pun yang
  tersimpan di database** — pipeline siap, tapi belum pernah benar-benar
  dilalui data aktual. Ingest LIVE tidak dijadwalkan otomatis (manual CLI saja,
  default nonaktif).
- **Gerbang legal tambahan**: laporan riset mencatat Terms of Use BEI secara
  eksplisit melarang scraping/crawling bahkan untuk non-komersial, dan
  mewajibkan izin tertulis untuk penggunaan komersial. Ini independen dari
  blokir Cloudflare — lihat bagian "Gerbang legal" di bawah. **Jangan
  mengaktifkan ingest produksi terjadwal sampai ada izin eksplisit dari BEI.**

## Provider DEMO

Data sintetis, deterministik (seed tetap `20260919`), dibuat oleh
`src/server/providers/demo/generate.ts` dan ditulis ke database lewat
`pnpm db:seed`. Tidak ada koneksi keluar ke internet dari provider ini.
Label "DATA DEMO" tampil di seluruh layar terkait instrumen dengan
`instruments.data_mode = 'demo'` (lihat `src/components/DataModeBadge.tsx`).

## Hasil uji akses nyata (2026-09-20)

Diuji langsung dari environment eksekusi sesi ini (bukan browser), sesuai
instruksi M3 poin 3 — status dicatat apa adanya, TIDAK ada percobaan bypass:

```
curl -A "Mozilla/5.0 ..." "https://www.idx.co.id/primary/TradingSummary/GetStockSummary?date=20260814"
→ HTTP 403, Content-Type: text/html; charset=UTF-8, body: halaman "Just a moment..." Cloudflare

curl -A "Mozilla/5.0 ..." "https://www.idx.co.id/primary/TradingSummary/GetStockSummary?date=20260715"
→ HTTP 403, sama persis

curl -I "https://www.idx.co.id/" (homepage, bukan hanya endpoint API)
→ HTTP 403, header cf-mitigated: challenge, server: cloudflare
```

**Kesimpulan**: ini bukan pembatasan khusus endpoint API, melainkan proteksi
Cloudflare di seluruh situs yang menolak request non-browser dari alamat
jaringan sandbox ini. Laporan riset (lihat bagian di bawah) sudah memperingatkan
persis kemungkinan ini: "keberhasilan di browser bersesi tidak membuktikan
akses server tanpa sesi" — sekarang terkonfirmasi negatif secara langsung.

Sesuai instruksi eksplisit: **tidak dilakukan** bypass Cloudflare, penyalinan
cookie browser, rotasi identitas/User-Agent berulang, proxy publik, atau
pengulangan request yang sudah terbukti diblokir. Kedua tanggal hanya dicoba
SATU KALI masing-masing; homepage dicek sekali untuk memastikan ini bukan
masalah endpoint spesifik. Tidak ada percobaan lanjutan setelah pola blokir
jelas.

## Gerbang legal: Terms of Use BEI

Laporan riset (`claude-opus-5-effort-high-extension-bei-analyst.md`, bagian
"Tingkat: PEMBLOKIR") mendokumentasikan bahwa Terms of Use resmi situs BEI
**melarang scraping/crawling bahkan untuk penggunaan non-komersial**, dan
mewajibkan izin tertulis untuk penggunaan komersial. Ini adalah gerbang
KEBIJAKAN, terpisah dari dan independen terhadap blokir teknis Cloudflare di
atas — bahkan jika blokir teknis suatu saat bisa dilewati secara sah (mis.
lewat akses resmi/berizin), penggunaan otomatis TETAP memerlukan izin
tertulis dari BEI sebelum diaktifkan sebagai integrasi produksi (AGENTS.md §5).

**Implikasi konkret**: `src/jobs/ingest-idx-daily.ts` HANYA boleh dijalankan
manual oleh pengembang untuk pengujian terbatas dengan pemahaman keterbatasan
ini. Job ini TIDAK dihubungkan ke worker terjadwal (`src/jobs/worker.ts`)
dan tidak akan dihubungkan sampai jalur penggunaan resmi diperoleh.

## Skema field GetStockSummary (dari laporan riset, BUKAN dokumentasi resmi)

Endpoint: `GET https://www.idx.co.id/primary/TradingSummary/GetStockSummary?date=YYYYMMDD`

Respons berupa **array datar** (bukan `{data:[...]}`, tidak ada amplop
pagination `draw`/`recordsTotal`). `start`/`length`/`draw` dilaporkan diabaikan
pada endpoint ini — **perilaku ini TIDAK digeneralisasikan ke endpoint lain**
(`GetFinancialReport` dan `GetAnnouncement` dilaporkan punya pagination yang
bekerja).

32 nama field dilaporkan per baris (laporan sumber sendiri menyebut "30
field" — **diskrepansi ini didiamkan di sumber, dicatat di sini, TIDAK
diselesaikan sepihak oleh kami**):

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

Diimplementasikan di `src/server/providers/idx/schema.ts` (Zod, `.passthrough()`
untuk field tak dikenal — lihat `extractUnknownKeys()`).

Catatan wajib per field (dari laporan, dipatuhi di kode — lihat komentar
inline di `schema.ts` dan `validate-daily-bars.ts`):
- **Remarks**: string notasi/status papan, "kamus resmi tidak ditemukan,
  perlu reverse-engineering". Disimpan mentah di `extra`, TIDAK
  diinterpretasikan jadi status apa pun oleh aplikasi.
- **TradebleShares**: laporan mengoreksi diri sendiri (Revisi 1.1) — "belum
  terbukti setara free float resmi BEI, perlakukan sebagai proksi berlabel".
  TIDAK dipakai kalkulasi apa pun di M3.
- **ForeignBuy/ForeignSell**: tidak ada konfirmasi unit/mata uang di laporan
  manapun. TIDAK diasumsikan rupiah, TIDAK dipakai kalkulasi.
- **Volume=0 dengan Close terisi**: dikonfirmasi NORMAL ("tidak ada
  transaksi"), bukan indikasi data hilang — `validateAndNormalizeDailyBars`
  menandai `hasTransaction=false` tanpa membuat issue.
- **Tanggal/hari libur/tanggal tidak valid**: semuanya bisa menghasilkan HTTP
  200 dengan array kosong. Status code TIDAK dipakai sebagai sinyal sukses;
  `data[0].Date`-setara divalidasi per baris.
- **Kemungkinan kontaminasi data pengujian BEI sendiri**: laporan mencatat
  jendela 18–19 September 2026 mungkin terkontaminasi data DUMMY dari
  pengujian situs BEI sendiri. Baris dengan kode/nama mengandung "DUMMY"
  dikecualikan otomatis oleh `validateAndNormalizeDailyBars` (case-insensitive).

Baris konfirmasi jumlah data dari laporan (BELUM diverifikasi ulang oleh kami
sendiri karena akses server-side diblokir — lihat di atas): 2026-08-14 = 963
baris, 2026-07-15 = 965 baris, 2026-09-18 (default/tanpa param) = 963 baris,
2020-01-02 = 671 baris (tanggal paling awal yang dilaporkan berhasil), semua
tanggal ≤2019 = 0 baris.

## Endpoint lain (dilaporkan, BELUM diimplementasikan di M3)

M3 hanya mengimplementasikan `GetStockSummary` (harga harian) sesuai instruksi
("mulai dari harga harian... fundamental, profil, dan pengumuman menyusul").
Untuk referensi milestone berikutnya:

| Dataset | Endpoint (dilaporkan) | Parameter (dilaporkan) | Field (dilaporkan) |
| --- | --- | --- | --- |
| Laporan keuangan | `/primary/ListedCompany/GetFinancialReport` | `indexFrom,pageSize,year,reportType=rdf,EmitenType=s,periode(tw1/tw2/tw3/audit),kodeEmiten,SortColumn,SortOrder` | `Attachments[]` dengan `File_Name,File_Path,File_Size,File_Type,File_Modified` (xlsx/XBRL zip/pdf) |
| Pengumuman | `/primary/ListedCompany/GetAnnouncement` | `kodeEmiten,emitenType,indexFrom,pageSize,dateFrom,dateTo(YYYYMMDD),lang,keyword` | `NoPengumuman,TglPengumuman,JudulPengumuman,PerihalPengumuman,JenisPengumuman,Kode_Emiten,Form_Id,attachments[].FullSavePath` |
| Profil emiten | `/primary/ListedCompany/GetCompanyProfilesDetail?KodeEmiten=BBCA&language=id-id` | — | `Profiles`, `PemegangSaham[]`, `Direktur[]`, `Komisaris[]`, `KomiteAudit[]`, `AnakPerusahaan[]` (nested) |
| Broker agregat | `/primary/TradingSummary/GetBrokerSummary?date=YYYYMMDD` | — | Belum divalidasi |
| Indeks | `/primary/StockData/GetConstituent` | — | Nama endpoint TIDAK membuktikan isi anggota indeks (belum divalidasi) |

Catatan: `GetFinancialReport`/`GetAnnouncement` dilaporkan punya pagination
yang BEKERJA (kontras dengan `GetStockSummary`) — jangan generalisasikan
perilaku satu endpoint ke endpoint lain saat mengimplementasikannya nanti.

**Akses in-browser vs server-side**: laporan riset eksplisit mencatat
request berhasil HANYA di dalam browser yang sudah lolos tantangan Cloudflare
(`/cdn-cgi/challenge-platform/` teramati), dan secara eksplisit TIDAK
memastikan hal yang sama berlaku dari script server-side. Revisi 1.1 laporan
tersebut kemudian mengoreksi diri dan mengonfirmasi HTTP 403 dari client
non-browser pada kedua URL uji — **konsisten dengan hasil uji kami sendiri di
atas**.

## Catatan pembatas yang WAJIB dipatuhi sebelum aktivasi produksi

- Blokir Cloudflare TERKONFIRMASI dari lingkungan ini (lihat di atas) — ini
  gerbang TEKNIS.
- Terms of Use BEI melarang scraping — ini gerbang LEGAL, independen dari
  yang teknis (lihat "Gerbang legal" di atas).
- `startDate`/`endDate` dilaporkan tidak bekerja pada `GetStockSummary` — satu
  tanggal per panggilan. Perilaku ini TIDAK digeneralisasikan ke endpoint lain.
- HTTP 200 dapat berisi array kosong atau data tanggal default; tidak boleh
  disamakan otomatis dengan hari libur bursa — ditegakkan di
  `validateAndNormalizeDailyBars` (`empty_response` adalah issue severity
  `info`, bukan disimpulkan jadi "hari libur").
- Data DUMMY pada pengujian situs asal dikecualikan otomatis, tidak pernah
  masuk sebagai baris produksi (lihat `dummy_row_excluded`).
- Snapshot dan endpoint kompetitor (Arjum/Invezgo dan sejenisnya) TIDAK dipakai
  sebagai sumber produksi maupun fixture yang diam-diam dianggap aktual.
- Hormati 401/403/429; tidak ada bypass proteksi, rotasi identitas, atau
  pengambilan cookie sesi pengguna — `IdxBlockedError` di
  `src/server/providers/idx/client.ts` sengaja TIDAK di-retry.

## Apa yang dibutuhkan untuk melanjutkan M3 dengan data aktual

Dua jalur konkret (bukan janji, ini permintaan eksplisit ke pengguna):

1. **Akses provider yang sah**: baik izin tertulis dari BEI untuk akses
   otomatis (menyelesaikan gerbang legal DAN kemungkinan membuka jalur teknis
   resmi, mis. IP allowlist), ATAU langganan penyedia data pasar berlisensi
   yang datanya boleh diproses otomatis.
2. **Sampel JSON mentah dari pengguna**: bila pengguna punya akses browser
   yang sudah lolos tantangan Cloudflare (seperti pembuat laporan riset asli),
   respons JSON mentah GetStockSummary untuk satu-dua tanggal kerja terbaru
   bisa diberikan secara manual untuk memvalidasi `src/server/providers/idx/schema.ts`
   terhadap data sungguhan (bukan fixture sintetis) — TANPA kami perlu
   mengakses idx.co.id sendiri. Ini tidak menyelesaikan gerbang legal untuk
   ingest otomatis berkelanjutan, tapi cukup untuk validasi adapter satu kali.

Tanpa salah satu di atas, pipeline LIVE tetap dalam status "siap tapi belum
pernah dilalui data aktual" — lihat `docs/progress.md` bagian M3 untuk detail
lengkap apa yang sudah/belum terbukti.
