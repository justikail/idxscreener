# Metodologi Perhitungan

Sumber acuan: `src/domain/indicators.ts`, `src/domain/fundamentals.ts`,
`src/domain/filter-ast.ts`. Dokumen ini menjelaskan definisi dan alasan pemilihan;
kode adalah sumber kebenaran untuk implementasi persis.

## Prinsip status data

Setiap metrik punya `value`, `unit`, `as_of`/`period`, `source`, dan `status`.
Status yang dipakai: `ok`, `null_missing` (data belum tersedia), `not_applicable`
(secara matematis/bisnis tidak bermakna dihitung), `stale` (data lampau dari
tanggal run terbaru), `unavailable`. Tidak ada fallback `missing -> 0` di jalur
manapun — nilai 0 asli (mis. volume nol) berbeda dari data hilang.

## Fundamental

- **TTM (trailing twelve months)**: dihitung dari 4 kuartal FLOW (revenue,
  net_income) yang DISKRIT, berurutan tanpa gap, dan tidak mengandung nilai null
  (`ttmFromQuarters`). Kurang dari itu -> TTM `null` (tidak dihitung), bukan
  estimasi. Balance sheet (ekuitas, liabilitas, aset) TIDAK di-TTM-kan — dipakai
  nilai akhir periode terbaru (instant), sesuai sifatnya sebagai titik waktu.
- **Sumber fakta live (Arjum, formula_version 2, sejak 5 Okt 2026)** — lihat
  `src/server/ingestion/arjum-financials.ts`:
  - Hanya path respons yang terlihat pada respons nyata yang dipetakan
    (`FINANCIAL_CONCEPT_MAP`, tiap entri mencatat buktinya). Pos lain disimpan
    utuh di `financial_reports.data` tanpa diberi arti.
  - **Basis kuartal diverifikasi**, tidak diasumsikan: jumlah laba rugi Q1–Q4
    dibandingkan laporan tahunan tahun yang sama (toleransi 1%). Cocok dengan
    jumlah → kuartal mandiri (`period_basis = quarter`); Q4 ≈ tahunan → YTD
    (disimpan `ytd`, kuartal mandiri diturunkan dari selisih dengan
    `validation = derived_from_ytd`; EPS tidak diturunkan karena saham
    tertimbang berubah). Tanpa tahun lengkap/tidak konsisten →
    `quarter_unverified`: ditampilkan abu-abu, **tidak** masuk TTM. Contoh
    BBCA 2025Q2–2026Q1: laba per kuartal ±14 T (bukan kumulatif).
  - **0 dari penyedia**: penyedia mengisi 0 untuk pos yang tidak dilaporkan
    (bukti: grup `laba_rugi_per_saham.total = 0` sementara anaknya 119). Untuk
    konsep yang mustahil 0 (EPS; neraca/pendapatan setelah dipetakan) nilai 0
    disimpan `null` + `validation = zero_as_missing`.
  - `published_at` kosong: penyedia hanya memberi `fetched_at` (waktu penyedia
    mengambil data), disimpan terpisah sebagai `provider_fetched_at`.
  - Konsolidasi: tidak dinyatakan penyedia; laporan memuat pos kepentingan non
    pengendali (ciri laporan konsolidasian) → dicatat `consolidated` (asumsi).
  - Tahun buku = tahun kalender (asumsi untuk tanggal awal/akhir periode).
  - Revisi: isi laporan berubah → `version + 1`; versi lama tidak ditimpa.
    Perhitungan memakai versi terbaru.
- **PER** (data live) = kapitalisasi pasar (harga × saham tercatat terbaru) /
  laba TTM (laba milik entitas induk bila neraca induk tersedia). Tidak memakai
  EPS sumber: dibulatkan ke Rupiah dan untuk sebagian emiten bernilai 0/tidak
  dilaporkan (TLKM, probe 6 Okt). Data demo: laba TTM / saham tertimbang.
  Laba TTM ≤ 0 → `not_applicable`. EPS kuartalan tetap ditampilkan apa adanya.
- **Q4 turunan**: bila sumber tidak menerbitkan Q4 (contoh TLKM 2025Q4) dan
  basis mandiri terverifikasi, Q4 = tahunan − (Q1+Q2+Q3) untuk pos Rupiah
  (`validation = derived_from_annual`); EPS tidak diturunkan.
- **PBV** = (harga × saham tercatat terbaru dari `/api/market-cap`, tanggal
  snapshot dicatat) / ekuitas terbaru. Ekuitas milik entitas induk bila
  tersedia; bila tidak, total ekuitas. Saham tercatat adalah jumlah SAAT INI,
  dipakai terhadap harga saat ini (kapitalisasi), bukan sebagai jumlah saham
  historis. Ekuitas ≤ 0 → `not_applicable`.
- **ROE** = laba TTM / rata-rata ekuitas (neraca terakhir dan neraca 4 kuartal
  sebelumnya; bila yang awal tidak ada, neraca terakhir saja). Laba induk
  berpasangan dengan ekuitas induk; bila salah satunya tidak ada, laba total
  dengan total ekuitas — tidak pernah dicampur.
- **ROA** = laba TTM / rata-rata total aset (definisi rata-rata sama dengan ROE).
- **NPM** = laba TTM / pendapatan TTM. Pendapatan hanya terisi bila pos
  pendapatan terpetakan untuk format laporan emiten (bank tidak punya pos
  "pendapatan" tunggal; NPM bank = data belum tersedia, bukan dihitung dari pos lain).
- **DER** = total liabilitas (akhir periode) / total ekuitas (akhir periode).
  Definisi ini memakai TOTAL liabilitas, bukan hanya utang berbunga. **Bank dan
  nonbank tidak dibandingkan pada peer group yang sama untuk DER** karena
  struktur permodalan bank secara inheren berbeda (deposito nasabah tercatat
  sebagai liabilitas).
- **Kapitalisasi pasar** = penutupan terakhir × saham tercatat terbaru.

## Data pasar tambahan

- **Volume asing** (`daily_bars.foreign_*`, dari `f_buy/f_sell/n_foreign`
  `/api/history`): satuan LEMBAR — diverifikasi per baris (f_buy, f_sell ≤
  volume; bila lot, ×100 melampaui volume) dan `n_foreign = f_buy − f_sell`.
  Baris yang melanggar disimpan tanpa data asing (null) + dicatat. Tidak
  dikalikan harga menjadi nilai Rupiah.
  - `foreign_net_5d` = Σ net asing 5 sesi terakhir (lembar);
    `foreign_net_ratio_5d` = Σ net / Σ volume 5 sesi yang sama. Butuh data
    asing di kelima sesi; volume 0 → `not_applicable`.
- **Ringkasan broker** (`broker_summaries`): satu baris = agregat satu rentang
  dari penyedia. Rentang berbeda tidak dijumlahkan (bisa tumpang tindih).
  Kelengkapan: Σ volume beli semua broker = volume pasar sesi itu (lembar) →
  `complete`; = volume/100 → `complete` satuan lot; lebih kecil → `partial`
  (top broker; total pasar tidak dihitung dari baris broker); volume harian
  belum tersimpan → `unknown`. Bukti 4 Okt (BBCA 2 Okt): 20 broker = 78,9%
  volume, bval/bvol ≈ harga → bvol lembar, bval Rupiah.
- **Harga terbaru** (`latest_quotes`, `/api/price`): cache terpisah dari
  candle; tidak pernah membentuk OHLCV. `is_fallback_close` = penyedia
  menyatakan tidak ada transaksi hari ini, atau `source_date` bukan hari ini
  WIB, atau tidak ada `source_date`. `quote_age_ms` = usia transaksi terakhir,
  bukan latensi feed. Tidak pernah dilabeli realtime.

## Seasonality (pola bulanan) — dihitung lokal

`src/domain/seasonality.ts`: return bulan M = penutupan terakhir M /
penutupan terakhir bulan kalender tepat sebelumnya − 1. Hanya bulan lengkap
(bulan berjalan WIB tidak dihitung); bulan pertama data dan bulan setelah celah
dilewati, tidak diisi. Statistik per bulan: n, rata-rata, median, jumlah tahun
naik. Pola baru ditampilkan normal bila ≥ 3 tahun per bulan; di bawah itu UI
memberi label cakupan parsial. Harga belum terverifikasi disesuaikan corporate
action. Metode ini **tidak diklaim identik** dengan `/api/seasonal` penyedia
(definisi penyedia belum diperiksa). "Naik / tahun" adalah catatan masa lalu,
bukan probabilitas.

## Teknikal

- **SMA**: rata-rata sederhana `period` closes terakhir.
- **EMA**: seed = SMA dari `period` titik pertama, lalu smoothing `k = 2/(period+1)`.
  Ini konvensi umum (bukan satu-satunya varian) — didokumentasikan agar hasil
  reproducible dan dapat dibandingkan lintas waktu.
- **RSI 14**: smoothing Wilder standar. Seed dari rata-rata gain/loss 14 perubahan
  pertama, lalu smoothing rekursif `(prev*(n-1)+baru)/n`. Edge case harga datar
  berturut-turut (gain=loss=0) -> RSI 50 (netral), bukan error/NaN.
- **MACD**: EMA12 - EMA26 = garis MACD; sinyal = EMA9 dari garis MACD (dihitung
  mulai dari titik pertama garis MACD valid, bukan dari awal array harga).
  Histogram = MACD - sinyal.
- **Volume relatif 20 hari**: volume sesi / rata-rata volume 20 sesi SEBELUMNYA
  (tidak termasuk sesi berjalan). Tidak dipakai untuk membandingkan candle
  berjalan (belum final) dengan volume harian penuh tanpa penyesuaian — pada M1
  seluruh sesi yang disimpan dianggap sudah final (data harian, bukan intraday).

## Filter screener

Filter dievaluasi sebagai AST typed (`FilterNode`) dengan allowlist field dan
operator (lihat `src/domain/filter-ast.ts`). Field unknown pada satu kandidat
membuat kondisi tersebut `unknown` — TIDAK otomatis dianggap lolos, dicatat di
`missingFields` agar UI dapat menawarkan opsi "hanya tampilkan data tersedia".
Preset awal (`src/domain/presets.ts`) bersifat contoh edukatif dengan ambang
yang bisa disesuaikan, BUKAN rekomendasi transaksi maupun jaminan probabilitas.


## Metrik strategi Rekomendasi (formula_version 3, sejak 12 Okt 2026)

Kode: `src/domain/strategy-metrics.ts`, dihitung di `src/server/services/metrics.ts`.
Semua dari data HARIAN tersimpan; data kurang → null (tidak pernah 0).

- `change_1d` = penutupan terakhir ÷ penutupan sesi sebelumnya − 1.
- `return_5d`, `return_20d` = penutupan terakhir ÷ penutupan 5 / 20 sesi lalu − 1.
- `close_position` = (penutupan − terendah) ÷ (tertinggi − terendah) sesi terakhir
  (0 = tutup di harga terendah, 1 = tertinggi). Tertinggi = terendah → null.
- `value_avg_20d` = rata-rata nilai transaksi 20 sesi (butuh 20 sesi bernilai).
- `close_vs_sma20`, `close_vs_sma50` = penutupan ÷ SMA − 1; `sma20_vs_sma50` = SMA20 ÷ SMA50 − 1.
- `range_position_52w` = posisi penutupan di rentang tertinggi–terendah 250 sesi
  terakhir (butuh ≥ 120 sesi).
- `net_income_growth_yoy`, `revenue_growth_yoy` = TTM 4 kuartal terakhir ÷ TTM 4
  kuartal sebelumnya − 1; butuh 8 kuartal mandiri berurutan; TTM sebelumnya ≤ 0
  → `not_applicable`.
- `broker_top3_net_ratio` = jumlah net beli 3 broker pembeli bersih terbesar ÷
  nilai transaksi sesi yang sama; hanya bila ringkasan broker tersimpan untuk
  sesi TERAKHIR saham itu. Ukuran konsentrasi aktivitas broker, bukan identitas
  pemilik dana.

## Strategi Rekomendasi

Aturan lengkap (ambang, urutan, kolom) ada di `src/domain/strategies.ts` dan
ditampilkan apa adanya di setiap halaman strategi (teks dibangkitkan dari
aturan yang sama). Saham dengan data kurang masuk "belum bisa diuji", tidak
pernah dianggap lolos. Ringkasan ambang:

- **BPJS**: nilai transaksi rata-rata 20h ≥ Rp5 M, harga ≥ 100, naik 2–20%,
  posisi penutupan ≥ 70%, volume ≥ 1,5× rata-rata, RSI ≤ 80.
- **BSJP**: nilai rata-rata ≥ Rp5 M, harga ≥ 100, naik 1–15%, posisi penutupan
  ≥ 90%, volume ≥ 1,2×, net asing 5 hari ≥ 0.
- **Bandarmologi**: konsentrasi beli 3 broker ≥ 5% nilai transaksi, nilai
  rata-rata ≥ Rp1 M, harga ≥ SMA20 − 5%.
- **Growth** mingguan: kenaikan 5h ≥ 3%, harga ≥ SMA20, RSI 55–75, volume ≥ 1,2×,
  nilai rata-rata ≥ Rp1 M. Bulanan: kenaikan 20h ≥ 8%, harga ≥ SMA50, SMA20 ≥
  SMA50, RSI ≤ 75. Jangka panjang: laba TTM tumbuh ≥ 15%, ROE ≥ 12%.
- **Value** mingguan: PER ≤ 12, PBV ≤ 1,5, posisi 1 tahun ≤ 35%, RSI ≤ 45.
  Bulanan: PER ≤ 12, PBV ≤ 1,5, ROE ≥ 8%, kenaikan 20h ≥ 0. Jangka panjang:
  PER ≤ 15, PBV ≤ 2, ROE ≥ 12%, laba tidak menyusut. Semua dengan nilai
  rata-rata ≥ Rp500 jt.

Ambang adalah titik awal yang disusun tim, belum diuji historis (backtest).
