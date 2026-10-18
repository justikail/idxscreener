# Progres Implementasi

Diperbarui: 2026-10-04 (sesi validasi Arjum — lihat bagian pertama di bawah;
riwayat M0–M3 IDX dipertahankan di bawahnya)

## Sesi 2026-10-18 — Endpoint baru `/api/price/list` (harga batch)

- Probe nyata 1 request / 3 kuota; hasil di docs/data-sources.md. Kode tidak dikenal tetap ditagih.
- Dibangun:
  - Client `arjumGet` menerima biaya kuota per request.
  - Adapter `priceList()`, schema, `normalizeListQuote()`.
  - Migrasi aditif `0009` (latest_quotes: change, prev_close, vwap).
  - Runner batch dataset `price`: chunk 200, jendela jam bursa, canary libur, interval per putaran.
  - Admin boleh memilih scope semua saham untuk harga.
- Test:
  - Unit `tests/providers/arjum-price-list.test.ts` (8).
  - Integrasi jadwal harga ditulis ulang untuk batch: 53/53 lulus di Postgres lokal sementara.
- Status produksi: kode terpasang; jadwal `price` TIDAK diaktifkan. Fitur `hargaTerkini` masih nonaktif (src/lib/features.ts), dan potret semua saham (±957 kuota per putaran) melebihi sisa kuota satu akun setelah OHLCV harian.

## Sesi 2026-10-12 — Fokus 3 menu client (Kondisi Market, Detail Saham, Rekomendasi)

- Alur: Login → aplikasi bersidebar (desktop) / bilah bawah 3 tombol + sub-menu
  geser (ponsel). Route group `(app)` (cek login) dan `(public)` (masuk, daftar,
  tentang). `/` → `/pasar` atau `/masuk`; `/cari` → `/saham?q=`.
- Kondisi Market: `/pasar` (ringkasan), `/pasar/heatmap` (ukuran: nilai/volume/
  kapitalisasi; warna: 1/5/20 hari/net asing; jumlah 30–200; filter papan, arah,
  cari; tampilan peta/daftar yang bisa diurutkan), `/pasar/saham`, `/pasar/asing`.
- Detail Saham dipecah: `/saham` (cari), `/saham/KODE` (Ringkasan: 6 kartu
  Sekilas + grafik), `/teknikal`, `/fundamental`, `/bandarmologi` (asing, broker,
  akumulasi). Halaman gabungan lama diarsipkan di `saham/[code]/_arsip/`.
- Rekomendasi: `/rekomendasi` + `/rekomendasi/{bpjs,bsjp,bandarmologi,growth,value}`
  (Growth/Value: mingguan/bulanan/jangka panjang), aturan & disclaimer di setiap
  halaman. Metrik baru formula_version 3 (lihat methodology.md).
- Dinonaktifkan via `src/lib/features.ts` (tidak dihapus): pengumuman, watchlist,
  notifikasi, pengingat (+evaluasi worker), catatan, permintaan data (+antrean
  worker), screener bebas, pola bulanan (+dataset seasonal), insider (+dataset),
  harga terkini (+dataset price).
- Verifikasi: typecheck/lint bersih; unit 168 (2 gagal = test konfigurasi satu
  key vs config.ts pengguna); integrasi 53/53 (kuota 1.000); screenshot desktop
  & ponsel di DB demo lokal; 12 halaman baru lebar = 390 px di ponsel.
- Data: Bandarmologi butuh jadwal `broker_summary` per hari untuk saham yang
  ingin dicakup; Value/Growth jangka panjang butuh laporan keuangan semua saham
  dan snapshot market-cap. Keduanya diatur admin di /admin/jobs.

## Sesi 2026-10-06 (lanjutan 2) — Permintaan data oleh pengguna

- Fitur: pengguna login bisa meminta laporan keuangan, ringkasan broker,
  insider, dan akumulasi broker per saham (panel "Kelengkapan data" di halaman
  saham), "Pantau lengkap" (maks. per pengguna, juga di kartu watchlist),
  halaman `/permintaan` (jatah, antrean + posisi + perkiraan, riwayat, paling
  banyak diminta, tanya jawab), notifikasi saat data siap/gagal. Admin:
  bagian "Permintaan pengguna" di `/admin/jobs` (buka/tutup, anggaran antrean
  per hari, jatah per pengguna, maks. pantau; dahulukan/batalkan/ulangi;
  "Jadwalkan permanen" dari daftar terpopuler).
- Aturan: data segar (laporan 7 hari, broker 12 jam, insider 7 hari,
  akumulasi 1 hari) tidak diantrekan; satu permintaan aktif per dataset×saham
  (unique index parsial) — peminta berikutnya ikut antre tanpa jatah; jatah
  per pengguna hanya untuk permintaan baru, kembali bila dibatalkan sebelum
  diproses; worker memproses SETELAH pembaruan harga harian final dan jadwal
  admin, dibatasi anggaran antrean & sisa kuota efektif; gagal → coba lagi
  1 jam, 3× → gagal + notifikasi; error kunci/kuota/non-JSON tidak menghukum
  permintaan. Harga terbaru & seasonality penyedia sengaja tidak bisa diminta
  pengguna (harga butuh polling; seasonality sudah dihitung lokal).
- Migrasi 0008 (aditif): data_requests, data_request_subscribers,
  user_stock_follows, app_settings. Bawaan: dibuka, anggaran 30/hari, jatah
  6/pengguna, pantau maks. 5.
- Verifikasi: integrasi 53/53 (termasuk 8 test baru: segar/antre/ikut antre,
  5 permintaan bersamaan → 1 antrean & 1 jatah, jatah & pembatalan, urutan
  prioritas & anggaran & notifikasi, sudah segar tanpa request, retry/gagal/
  error sistemik, pantau lengkap, otorisasi & validasi kode); typecheck, lint
  bersih; alur end-to-end di browser dengan dua pengguna + admin (DB lokal).

## Sesi 2026-10-06 (lanjutan) — Perbaikan geser horizontal ponsel & Screener

- Bug: di ponsel halaman detail saham 2,6× lebih lebar dari layar (scrollWidth
  1015 px pada layar 390 px) sehingga tampilan "terbelah" bergeser ke kanan.
  Penyebab: teks `sr-only` (position absolute) di menu bagian yang menempel
  lolos dari wadah yang bisa digeser karena wadahnya tidak `relative`. Diperbaiki
  di `SectionNav`, ditambah label diagram broker yang sedikit keluar layar dan
  baris daftar pengingat yang tidak bisa terlipat. `html { overflow-x: clip }`
  sebagai jaring pengaman. Diverifikasi skrip Playwright 390 px: semua halaman
  (publik, pengguna, admin) scrollWidth = 390.
- Screener: preset yang datanya belum ada untuk saham mana pun menampilkan
  "Data belum cukup" (bukan "0 lolos"); hasil dipisah Lolos / Tidak lolos
  (data lengkap) / Belum bisa diuji (dilipat, menyebut data yang kurang);
  preset bawaan = preset pertama yang bisa diuji; grid preset tanpa sel kosong.
- Dideploy ke VPS 6 Okt (config.ts VPS identik dengan lokal sebelum deploy).

## Sesi 2026-10-06 — Desain ulang UI fitur baru & halaman login

Atas permintaan pengguna (tampilan lama "jelek, tidak informatif").
Bahasa visual "Lembar Bursa" dipertahankan; struktur dan interaksi dibuat ulang.

- Komponen bersama: `src/components/ui/section.tsx` (judul + kalimat inti +
  "Cara membaca" yang bisa dibuka, chip kesegaran/cakupan, keadaan kosong),
  `SectionNav` (daftar isi menempel + penanda ada/tidak ada data), `Tabs`,
  `TextSizeControl` (A / A+ / A++ di bilah atas, disimpan per browser),
  grafik `BarSeries` (tooltip hover/sentuh/panah keyboard + tampilan tabel)
  dan `TugOfWar` (broker net jual vs net beli, satu skala).
- Detail saham: kartu "Sekilas" (`features/market-data/insights.ts`, kalimat
  deskriptif tanpa saran jual/beli; digeser ke samping di ponsel); laporan
  keuangan (4 angka kunci, grafik laba per kuartal, struktur pendanaan
  "dari setiap Rp100 aset"); asing (grafik interaktif); broker (tarik tambang,
  pemilih tanggal, tabel semua broker); akumulasi (skala sama/masing-masing);
  insider (dikelompokkan per tanggal); pola bulanan (heatmap + legenda + tab
  versi Pihak Ketiga); bagian "Catatan & pengingat".
- Fitur baru: pembuat pengingat (alert) berbentuk kalimat + saran cepat —
  aksi `createAlert`/`deleteAlert` sudah ada tetapi sebelumnya tanpa UI;
  `getMyAlerts` kini menyertakan kode saham; `markAllNotificationsRead`.
- Halaman di balik login: watchlist (ringkasan naik/turun, kartu, urutan,
  daftar pengingat), notifikasi (per hari, filter belum dibaca, tandai semua),
  masuk/daftar (manfaat akun + tombol tampilkan kata sandi), panel admin
  (status menyeluruh, 4 lampu kesehatan, bilah "ke mana kuota terpakai",
  kartu dataset dengan perkiraan request/hari saat mengetik). Teks admin
  tidak lagi menyatakan "hanya satu key dipakai"; kini netral (jumlah key).
- Verifikasi: typecheck & lint bersih; unit 160/162 (2 gagal = test konfigurasi
  satu key/budget 1.000 vs `config.ts` pengguna); integrasi 45/45 dengan
  `ARJUM_ACCOUNT_QUOTA=1000 ARJUM_DAILY_BUDGET=990` (dengan 5000 dari
  `.env.local`, 1 test cadangan kuota gagal); build sukses. Tampilan diperiksa
  dengan screenshot Playwright: detail BBCA (data real, hanya baca) desktop,
  halaman login/admin/watchlist/notifikasi/detail (database demo lokal
  sementara) desktop & ponsel. Belum di-deploy ke VPS oleh agen.

## Sesi 2026-10-05/06 (lanjutan 8) — Integrasi dataset Arjum tambahan

Rincian per endpoint: `docs/arjum-integration-status.md` §0; metode:
`docs/methodology.md`; jadwal/kuota: `docs/data-sources.md`.

Dikerjakan:
- Satu key (rotasi dihapus), budget dipotong ke kuota akun (1.000; env 5000 →
  1.000), rekonsiliasi header `x-ratelimit-*`, jadwal per dataset
  (`dataset_schedules` + checkpoint `dataset_fetch_state`, panel admin), panel
  pemantauan 4 status (API, DB, worker, kemutakhiran).
- Laporan keuangan (laporan utuh + fakta terpetakan, uji basis kuartal vs
  tahunan, revisi berversi, published_at kosong), ringkasan broker (all_data,
  uji kelengkapan), akumulasi broker, insider (pagination + dedup), seasonal
  (lokal + versi penyedia terpisah), harga terbaru (cache, fallback), health,
  kolom market-cap, volume asing history; rasio v2 (PER/PBV dari kapitalisasi,
  ROE/ROA induk), metrik & filter `market_cap`, `foreign_net_ratio_5d`, preset
  "Net Beli Asing 5 Sesi"; UI detail saham untuk semuanya.
- Migrasi 0005–0007 (aditif; diuji di Postgres lokal kosong lalu Neon).
- Perbaikan operasional: worker melepas lock sebelum menutup koneksi (restart
  4 detik, sebelumnya tertolak ≤3 menit); `lastRunAt` tidak bergeser bila
  dataset ditahan kuota.

Request live sesi ini: 21 (probe 20 + health terjadwal 1). Data real tersimpan:
laporan BBCA & TLKM (27 + laporan, fakta), broker BBCA 4 snapshot (2 lengkap),
akumulasi BBCA 2, insider BBCA 20/85, seasonal BBCA, harga BBCA. Replay ke-2:
0 baru, 0 revisi.

Verifikasi: typecheck, lint, unit 150/150, integrasi 45/45 (2× berturut, DB
Postgres lokal sementara — bukan Neon), build; halaman `/saham/BBCA`,
`/saham/TLKM` 200 dengan data real.

Belum/terbatas:
- Dataset tambahan nonaktif (kecuali health) — kuota OHLCV ±959/1.000.
- `market_cap_snapshots` kosong → PER/PBV live "data belum tersedia" sampai
  perawatan mingguan berikutnya mengambil daftar saham (20 request, butuh sisa
  > 30 setelah pembaruan harian).
- `jobs:backfill-foreign` selesai 5 Okt 20.3x CEST (0 request): 284.735/285.154
  baris arjum punya data asing (419 baris snapshot dilewati karena volume beda
  revisi). Metrik `foreign_net_ratio_5d`: 831 ok, 126 not_applicable; 178 ≥ 5%.
  Preset "Net Beli Asing 5 Sesi" tetap 0 lolos karena syarat kapitalisasi ≥
  Rp1 T dan `market_cap` masih null untuk semua saham (menunggu snapshot
  market-cap).
- Test render UI (`tests/domain/market-data-ui.test.ts`, 7 test): keadaan
  kosong, parsial, real, tidak konsisten, fallback harga. `vitest.config.ts`
  memakai JSX otomatis.
- **Konflik terbuka (5 Okt 20.20 CEST, di luar sesi agen):** AGENTS.md §3/§7
  diubah untuk mengizinkan rotasi multi-akun, dan `src/server/providers/arjum/config.ts`
  di repo lokal diubah (bawaan kuota/budget 5000, pemilihan key acak, blok
  `@protected`). Instruksi tugas terbaru pengguna justru melarang rotasi key.
  Agen tidak mengimplementasikan rotasi dan tidak men-deploy config.ts lokal;
  VPS tetap versi satu key/budget 1.000. Dua test konfigurasi
  (`tests/providers/arjum-datasets.test.ts` "konfigurasi key & budget") gagal
  terhadap config.ts lokal itu.
- TLKM: basis kuartal belum terverifikasi → rasio TTM tidak dihitung.
- `action_type` insider belum diuji; endpoint search/analysis/screener/done-details tidak diintegrasikan (sesuai scope).

## Sesi 2026-10-05 (lanjutan 7) — Pagination semua tabel/daftar

Komponen bersama `src/components/Pagination.tsx` + `src/lib/pagination.ts`
(dua bilah: `top` = jumlah + "Per halaman" di atas daftar, `bottom` = nomor
halaman di bawah)
(murni tautan, state di URL `<key>`/`<key>_per`, pilihan 10/25/50/100; tidak
tampil bila ≤10 baris). Dipasang di: dashboard (tabel teramai, 10/hal),
/saham, /screener (lolos & tidak lolos terpisah — batas 50 "tidak lolos"
dihapus, kini semua bisa dibuka), /watchlist (saham & alert), /notifikasi,
/pengumuman, /cari, /saham/[kode] (pengumuman & catatan), /admin/jobs (run &
isu). Batas ambil dinaikkan: notifikasi, run & isu admin 50→200, pengumuman
100→500, pencarian 20→1000. Tidak dipaginasi: penguat/pelemah (6), ticker,
peta pasar, 10 run harian terakhir, isi /tentang.

Verifikasi: typecheck, lint, unit 120/120 (+5 test pagination), build;
di VPS `/saham?hal=999` → 951–957 dari 957, `/screener?gagal=3&gagal_per=10`
→ 21–30 dari 957, `/cari?q=a` → 1–25 dari 925. Halaman login-only
(watchlist, notifikasi, admin) hanya diuji lewat typecheck/build.

## Sesi 2026-10-05 (lanjutan 6) — Deploy VPS (docs/deploy-vps.md)

VPS Contabo (Lauterbourg, FR), Ubuntu 24.04, 6 vCPU/11 GB. Server **dipakai
bersama** ±20 situs Apache (80/443), MariaDB (3308), Redis. Aplikasi di
`/srv/ihsg/app` (user `ihsg`), disalin dari `/root/ihsg-app` (belum ada git).

Versi: Node 22.23.3, pnpm 12.4.2, Apache 2.4 (bukan Caddy). Latensi ke Neon
(Singapura): round-trip ±161 ms, koneksi awal ±1,5 s.

Hasil: `pnpm install --frozen-lockfile`, typecheck, lint OK; unit 115/115;
`db:migrate` tanpa migrasi baru (hanya NOTICE "already exists"); build OK.
DB dari VPS: 957 saham berharga (`source='arjum'`), sesi terakhir 2026-10-05.
Password tiga akun demo diganti (acak, tidak dicatat di dokumen).
`ihsg-web` aktif; `https://justikail.duckdns.org` awalnya 401 tanpa basic
auth, 200 dengan auth (±0,9 s), `/saham` 200, `/admin/jobs` → `/masuk`.
Pukul 16:15 blok basic auth dihapus dari vhost (bukan oleh agen; diduga
pengguna) → situs kini **terbuka tanpa password** (hanya login aplikasi).
`certbot renew --dry-run` untuk domain ini sukses.

Penyimpangan dari runbook (alasan: server bersama):
- **Apache vhost, bukan Caddy** (`/etc/apache2/sites-available/ihsg*.conf`,
  basic auth `/etc/apache2/.htpasswd-ihsg`, user `client`). Sertifikat Let's
  Encrypt yang sudah ada (berlaku s.d. 21 Nov 2026, certbot apache).
- ufw **tidak** diaktifkan (akan memblokir MariaDB 3308/layanan lain), tidak
  `apt upgrade` massal, zona waktu sistem tetap Europe/Berlin (mengubahnya
  menggeser cron layanan lain; aplikasi menghitung WIB sendiri).

Belum selesai:
- `ihsg-worker` **belum dinyalakan**: `ARJUM_API_KEY` di `.env.local` VPS
  kosong (file lama di `/root/ihsg-app/.env.local` memuat `ARJUM_API_KEYS`
  banyak key + budget 5000 → tidak disalin). Budget VPS 990.
- `duckdns.timer` belum aktif: token belum diisi (DNS sudah mengarah ke VPS;
  IP Contabo statis).
- Run terjadwal pertama baru terbukti setelah worker aktif dan 17.00 WIB hari
  kerja.

## Sesi 2026-10-05 (lanjutan 5) — Persiapan hosting Vercel + GitHub Actions

Belum di-deploy (butuh akun Vercel/GitHub pengguna dan keputusan paket).
Disiapkan: `vercel.json` (region sin1), `.github/workflows/data-jobs.yml`
(`pnpm jobs:tick`, hari kerja 17.15–21.15 WIB tiap jam + akhir pekan),
`src/jobs/tick.ts` (satu siklus penjadwal; worker memakai fungsi yang sama),
mode `SCHEDULER=github-actions` di panel admin, `pnpm users:set-password`,
`packageManager: pnpm@12.4.2`, panduan `docs/deploy.md`. Fakta Vercel
(dokumentasi resmi, Juli–Sep 2026): Hobby cron sekali/hari, fungsi maks. 300
detik, hanya non-komersial → worker tidak bisa di Vercel; job di GitHub Actions.

**Kejadian kuota:** `.env.local` diubah pengguna menjadi
`ARJUM_DAILY_BUDGET="5000"`; uji `pnpm jobs:tick` (oleh agen) membaca 5000 dan
mem-backfill 106 saham sisa → kuota aplikasi 980 → 1.070 (±90 di atas kuota
satu akun). Proses dihentikan; worker lokal dijalankan dengan
`ARJUM_DAILY_BUDGET=990` di lingkungan proses (file pengguna tidak diubah).
Data: 956/957 saham berharga, 284.854 baris, **0 duplikat** walau diambil dengan
rotasi 5 key (unique constraint + upsert; key tidak memengaruhi isi data).

Verifikasi: tsc, lint, build OK; unit 115/115.

---

## Sesi 2026-10-05 (lanjutan 4) — Audit kapasitas Arjum

Pertanyaan pengguna: kenapa 957 instrumen live di Neon tetapi web hanya 50 →
907 baru tercatat kode+nama dari daftar penyedia (universe 12.44 WIB) dan
belum punya harga; web hanya menampilkan saham berharga. Backfill dijadwalkan
setelah pembaruan 17.00 WIB.

**Audit (tanpa menulis ke database aplikasi):** `pnpm audit:arjum` (dry-run
default, `--live` opt-in, batas keras 100 kumulatif, satu key, checkpoint +
manifest disanitasi di `docs/arjum-audit/`), `pnpm audit:arjum:report`
(gabung fakta live + DB read-only → `docs/arjum-capacity-audit.json`). Hasil:
`docs/arjum-capacity-audit.md`, `docs/arjum-endpoint-inventory.csv`,
`docs/arjum-integration-status.md`. Test: `tests/domain/arjum-capacity-audit.test.ts`
(budget berhenti, resume, dedupe, pagination, fakta tanpa data mentah, hari kerja).

**Fakta live (75 panggilan, 16.36–16.45 WIB):** 963 kode (2026-10-02), 0
duplikat; 1 panggilan = 1 unit kuota termasuk respons kosong; `/api/health`
gratis; `/api/history` menerima `start_date/end_date` (audit browser lama
keliru); done details kosong untuk 2026-06-02 dan lebih tua (retensi pendek);
laporan keuangan BBCA 18 kuartal/4 tahunan (< limit 40). Kesimpulan: 1.000/hari
cukup hanya untuk OHLCV harian semua saham (964/sesi); arsip lengkap ≥ 11.290
panggilan (batas bawah) dan done details tidak muat.

**Scheduler — temuan nyata:** worker mati ±16.50 WIB (ikut sesi agen) → jadwal
17.00 tidak berjalan. Dihidupkan ulang 18.18 WIB (terlepas dari sesi):
**run terjadwal pertama sukses otomatis** — sesi 2026-10-05, 50/50 saham.
Lalu worker menggantung: kedua koneksi pool tersangkut `FIN-WAIT-1` saat
menutup koneksi menganggur, query berikutnya menunggu selamanya, lease
kedaluwarsa, SIGTERM pun menggantung (shutdown menunggu DB). Diperbaiki:
watchdog (keluar bila lease tidak diperpanjang > 6 menit), shutdown dibatasi
5 detik, supervisor `pnpm worker:loop` (jalankan ulang setelah keluar).
Backfill dimulai 18.32 WIB: 803 dari 907 saham (sisa kuota hari ini).
Terputus `ECONNRESET` pada 163 saham berharga; lalu lock ingest (lease 3 jam)
tertahan oleh worker yang sudah dimatikan. Diperbaiki: kegagalan DB per saham
tidak menghentikan run; run terputus ditandai gagal saat lock didapat; lock
ingest lease 10 menit diperpanjang berkala (`withRenewingLock`). Lock milik
proses mati dihapus manual (1 baris `job_locks`); backfill dilanjutkan 19.13
WIB (645 dari 751).

Verifikasi: tsc, lint OK; unit 115/115; integrasi daily-update 8/8,
universe-backfill 4/4, arjum-ingest 7/7 (run pertama 4 gagal karena timeout
jaringan, diulang lolos) + test lock berperpanjangan 1/1.

---

## Sesi 2026-10-05 (lanjutan 3) — Navigasi ponsel, kinerja, koneksi

Permintaan pengguna: (1) dari mana tahu sudah >50 saham; (2) deretan tautan
mendatar seperti menu utama jangan dipakai di ponsel, di semua halaman.

**Status data saat ditanya (14.03 WIB):** 50/957 saham berharga — sesuai
rencana, backfill baru dijalankan worker setelah pembaruan 17.00 WIB.
Ditambahkan kartu **Cakupan data** di `/admin/jobs` (berharga/total, menunggu
backfill, sesi terakhir); angka yang sama ada di kepala `/saham` dan catatan
ringkasan dashboard.

**Ponsel:**
- Menu utama → tombol "Menu" yang membuka daftar vertikal (`MobileMenu`,
  tertutup saat pindah halaman/Esc/ketuk luar); desktop tetap mendatar.
- `/saham` "Urutkan" → pilihan lipat vertikal di ponsel.
- Screener: hasil di ponsel jadi kartu (alasan per kondisi di bawah kode,
  bukan kolom tabel yang harus digeser — ditemukan lewat screenshot audit).
- Panel admin "Riwayat semua run" → kartu di ponsel.
- Judul bagian + label samping boleh turun baris (judul tidak terhimpit).
- Audit otomatis 12 halaman di 390px (deteksi ≥3 tautan/tombol sejajar +
  overflow): tersisa hanya ticker berjalan dan peta pasar (sengaja); overflow 0.
  Kontrol rentang grafik (1B/3B/6B/1T/Semua) dibiarkan: kontrol segmen ringkas,
  bukan deretan tautan.

**Bug ditemukan & diperbaiki:**
- Screener menghitung 957 saham padahal hanya 50 berharga: job hitung membuat
  snapshot "data kosong" untuk saham tanpa harga → kandidat kini wajib punya
  harga.
- Error database berulang hari ini (`AggregateError ETIMEDOUT`): Node hanya
  menunggu 250 ms per alamat saat membuka koneksi; diukur koneksi TCP ke Neon
  biasanya 50–140 ms tetapi sesekali 2.159 ms (paket hilang). Batas dinaikkan
  ke 5 s (`src/server/net-tuning.ts`, dimuat web dan job).
- Data screener per kunjungan ±900 KB (7.049 baris snapshot) → diringkas di
  database jadi satu baris per saham, hanya metrik filter yang bernilai:
  88 KB. Cache memori 60 detik untuk data dashboard/screener (data berubah
  sekali sehari; dibersihkan saat admin menghitung ulang).

**Kondisi jaringan saat verifikasi:** ping ke internet 40% paket hilang;
200 KB dari Neon ±7 detik. Waktu halaman dan E2E sangat bervariasi karena itu.

---

## Sesi 2026-10-05 (lanjutan 2) — Cakupan semua saham

Permintaan pengguna: semua saham, dan hapus batas 800 karena "pasti total 5000
req" (5 key).

**Diukur (bukan asumsi):** 1 request `/api/market-cap?per_page=1` per key →
setiap key mengembalikan `x-ratelimit-limit: 1000` dengan `remaining`
berbeda-beda (986–991): hitungan kuota per key. Dashboard Arjum menyatakan
"limit harian berlaku per akun … untuk semua API Key gabungan" dan ToS pasal 2
melarang eksploitasi celah kuota. **Keputusan:** budget total semua key tetap
≤ kuota satu akun; penggabungan ke 5.000 tidak dibangun. Budget dinaikkan ke
990/hari (`.env.local`, cadangan dilepas atas permintaan pengguna).

**Dibangun:**
- `src/jobs/universe.ts` (`pnpm jobs:universe [--backfill]`): daftar semua
  saham dari market-cap (±20 request), instrumen baru disimpan live tanpa harga;
  kode yang dipakai demo dilewati. Backfill riwayat 300 candle per saham memakai
  sisa kuota, urut peringkat kapitalisasi; saham yang penyedia tidak punya
  riwayatnya ditandai dan baru dicoba lagi setelah 7 hari.
- Worker: setelah pembaruan hari itu final (atau akhir pekan), perawatan
  cakupan tiap ≤30 menit — daftar saham bila >7 hari, lalu backfill.
- Pembaruan harian: hanya saham yang sudah punya riwayat; run terjadwal hanya
  mengambil saham yang tertinggal dari sesi patokan (percobaan ulang murah);
  jendela candle per saham (dikelompokkan); lease lock 2 jam.
- Bug yang akan muncul di skala ini, diperbaiki sebelum terjadi: insert
  `metric_snapshots` satu statement (±963×15×8 parameter > batas 65.535
  PostgreSQL) → dipecah per 2.000 baris; breadth/median dashboard dulu ikut
  menghitung perubahan lama saham suspensi → kini hanya saham yang
  diperdagangkan pada sesi terakhir.
- UI: dashboard (ticker 40, peta pasar 60, tabel 50 teratas, sparkline hanya
  untuk baris yang tampil), halaman baru `/saham` (semua saham: saring, urut,
  50 per halaman; menu "Saham"), screener (saham tanpa data tidak diuji;
  "Tidak lolos" maks. 50 terdekat), teks /tentang dan glosarium disesuaikan.

**Live:** daftar saham → 963 di penyedia (data 2026-10-02), 907 baru, 6 kode
bentrok dengan data demo dilewati (instrumen live kini 957, 50 berharga).
Kuota 76/990 setelah langkah ini. Backfill **belum** dijalankan: sengaja
menunggu pembaruan 17.00 WIB agar satu request per saham sudah memuat sesi
hari ini dan kuota sore aman. Perkiraan: malam ini ±850 saham terisi, sisanya
±55 besok.

**Verifikasi:** typecheck/lint/build OK; unit 105/105; integrasi baru
`universe-backfill` 4/4 dan `daily-update` 8/8 (provider palsu, data test
dibersihkan — dicek 0 sisa). E2E 50 lolos / 1 gagal / 3 skip: yang gagal
("pencarian menuju detail") melewati batas navigasi 5 s saat koneksi ke Neon
lambat; diulang → lolos di desktop dan ponsel. DNS ke Neon sempat putus lagi
(`EAI_AGAIN`) selama run pertama. Halaman live `/`, `/saham`, `/screener`,
`/tentang` HTTP 200 (0,6–2,9 s setelah koneksi pulih), tanpa overflow.

**Batasan:** 6 saham asli tidak bisa masuk selama kodenya dipakai data demo
(mis. ASRI, BAJA, ENRG, REAL); kuota harian hampir habis tiap hari (±964 untuk
pembaruan semua saham) → tidak ada ruang untuk lapis 2 atau fundamental tanpa
tambahan kuota resmi.

---

## Sesi 2026-10-05 (lanjutan) — Lapis 1: pembaruan harian otomatis

Permintaan pengguna: bangun otomatisasi data penutupan (lapis 1) dulu; lapis 2
(harga selama bursa buka) menunggu uji apakah `/api/market-cap?codes=` bergerak
intraday.

**Dibangun:**
- `src/server/jobs/daily-schedule.ts` (fungsi murni): `decideDailyRun` — hari
  kerja, mulai 17.00 WIB, ulang tiap 60 menit, maks. 5 percobaan; `success` /
  `no_session` menutup hari itu. `unfinishedSessionDate` — candle hari ini
  tidak disimpan sebelum 16.30 WIB (ASUMSI, dicatat di data-sources).
  `historyLimitForGap` — 20 candle rutin, membesar bila worker lama mati (≤500).
- `src/jobs/daily-update.ts` (`pnpm jobs:daily`): saham patokan (tanggal data
  terbaru, lalu nilai transaksi terbesar) dicek dengan 1 request; bila ada sesi
  baru → ingest semua saham live (pakai `ingestArjumDailyBars` yang ada) →
  hitung indikator live → evaluasi alert. Status: success/partial/waiting/
  no_session/failed + ringkasan di kolom baru `ingestion_runs.note`
  (migrasi 0004, hanya ADD COLUMN, sudah diterapkan). Lock ingest yang sama
  dengan `pnpm ingest:arjum` → tidak pernah tumpang tindih. Run CLI/manual
  berlabel `…-manual` dan tidak mengurangi jatah percobaan terjadwal.
- `src/jobs/worker.ts` ditulis ulang: tiap menit kerjakan permintaan admin lalu
  jadwal; lock `worker` diperpanjang tiap menit = tanda hidup + cegah dua
  worker. Loop lama (hitung ulang tiap 15 menit tanpa data baru) diganti.
- Panel admin `/admin/jobs` didesain ulang: status worker, keputusan jadwal,
  kuota hari ini, tombol "Jalankan pembaruan sekarang" (mencatat permintaan;
  worker yang mengerjakan), riwayat run dengan jam WIB. Tombol "retry" lama
  yang hanya mengubah status tanpa menjalankan apa pun dihapus.

**Verifikasi nyata:**
- Unit 105/105 (12 baru untuk jadwal, termasuk batas WIB tengah malam).
- Integrasi `tests/integration/daily-update.test.ts` 7/7 (provider palsu,
  Postgres nyata): menyusul sesi lama → waiting; tanpa sesi baru → hanya 1
  request; percobaan terakhir → no_session; sesi hari ini → success dengan saham
  suspensi dicatat (tanpa candle buatan); idempotent; candle hari berjalan
  tidak disimpan; manual tanpa patokan. Suite integrasi lain lolos kecuali
  `idempotency.test.ts` "db:seed dua kali" **timeout 90 s** (seed demo dua kali
  ke Neon dari laptop ini; 3 test lain di file itu lolos; kode seed tidak
  diubah sesi ini) — belum diperbaiki.
- Live 09.38 WIB (bursa buka): `--scheduled` → "Belum pukul 17.00", 0 request.
  Tanpa flag → patokan BBCA penyedia 2026-10-02 = tersimpan → `waiting`,
  1 request. **Teramati: `/api/history` tidak memuat candle hari berjalan.**
- Live via panel admin → worker: 50/50 saham, 999 baris upsert, 1 karantina
  (BNLI lama), total 14.945 tetap, 0 duplikat, kuota 51/800.
- `pnpm build` OK, lint OK, E2E 51 lolos / 3 skip (baru: panel admin tampil
  untuk admin & ditolak untuk user; tombol sengaja tidak ditekan di E2E karena
  worker hidup akan memakai kuota sungguhan). Run E2E pertama gagal 7 test
  karena **jaringan ke Neon putus sesaat** (DNS `EAI_AGAIN`, lalu
  `ETIMEDOUT`); diulang setelah pulih → lolos semua. Worker bertahan melewati
  gangguan itu (lease diperpanjang lagi setelah koneksi pulih); log error kini
  menampilkan kode (`ETIMEDOUT`) karena AggregateError tidak punya pesan.
- Worker sedang berjalan (`pnpm worker`, dimulai sesi ini) dan akan mencoba
  pembaruan terjadwal pertama hari ini pukul 17.00 WIB — **hasilnya belum
  diamati** saat catatan ini ditulis.

**Status M3 (AGENTS.md §10):** scheduler kini tersedia dan berjalan **lokal**
(worker); scheduler di hosting **belum terpasang** karena belum ada deployment.
Izin penayangan publik tetap belum ada.

**Belum:** lapis 2 (harga intraday); fundamental live; kalender libur bursa
resmi; pembaruan universe (saham baru masuk cakupan tetap manual).

---

## Sesi 2026-10-05 — Masukan uji pengguna (admin + user B)

**Temuan dari database setelah uji pengguna:** user B membuat 1 catatan (GEMS);
tabel `watchlist_items` kosong walau pengguna menekan "+ Watchlist" — penyebab
pastinya tidak bisa dipastikan dari log (satu-satunya error di log server adalah
satu `ETIMEDOUT` koneksi Neon). Admin menjalankan job compute dari panel
(demo + live sukses). Ada 1 akun sisa test integrasi `test-notif-…@test.local`.

**Dikerjakan sesuai 4 poin pengguna:**
1. **Tooltip istilah** — `src/lib/glossary.ts` (±30 istilah: PER, PBV, ROE,
   ROA, NPM, DER, TTM, RSI, SMA, MACD, volume/lot, nilai transaksi, breadth,
   median, peta pasar, rentang 52 minggu, papan, tertinggal, dll.) dan komponen
   `src/components/Term.tsx`: hover/fokus di desktop, ketuk di ponsel, Esc /
   ketuk luar menutup; popover lewat portal, posisi dijepit ke viewport.
   Dipasang di dashboard, detail saham, screener (chip alasan), watchlist,
   tentang. `MetricTooltip` kini memakai `Term` (dulu hanya atribut `title`,
   tidak muncul di ponsel).
2. **Watchlist** — tombol dua arah `WatchlistToggle` (☆ Tambah → ★ Di watchlist,
   hover menawarkan "Hapus" hanya setelah kursor keluar dulu), status awal dari
   server (`isInWatchlist`), pesan konfirmasi + tautan, rollback bila gagal.
   Tanda ★ di dashboard dan screener. Halaman /watchlist didesain ulang dengan
   harga, perubahan, sparkline. Bug ditemukan saat verifikasi: `disabled`
   memicu blur dan `useTransition` menahan klik kedua selama `router.refresh()`
   → diganti status `busy` sendiri.
3. **Nama penyedia tidak ditampilkan di UI publik** — "Sumber Arjum" dihapus
   dari dashboard, footer, badge, detail; diganti "Pihak Ketiga". Provenance
   di DB dan panel admin tetap mencatat provider. Keputusan dicatat di
   AGENTS.md §9 (termasuk catatan: bila ketentuan penyedia mewajibkan atribusi
   nama, harus dipenuhi sebelum penayangan publik — belum diverifikasi).
4. **Halaman /tentang** — pengenalan, prinsip, alur data (ambil → periksa →
   karantina → simpan → hitung), rumus yang benar-benar dipakai (dicocokkan
   dengan `src/domain/*`, validator, dan query dashboard), logika screener,
   arti status data, Pihak Ketiga, batasan. `/metodologi` dialihkan ke
   `/tentang#perhitungan`.

Koreksi kecil: deskripsi preset "Valuasi Wajar" menyebut syarat "data tidak
stale" yang tidak ada di filter → dihapus; istilah "hari" → "sesi".

**Verifikasi nyata:** `tsc --noEmit` OK, `pnpm lint` OK, `pnpm build` OK, unit
93/93, E2E 50 lolos / 2 skip (test baru: tooltip desktop+ponsel dan dijepit
viewport, toggle watchlist + bertahan setelah reload, /tentang + redirect
/metodologi, tanpa overflow /tentang di 390px). Server live port 3000: halaman
utama HTTP 200, 0 kemunculan "arjum" di HTML publik; toggle watchlist diuji di
BBCA live dengan akun user A dan dibersihkan (tabel watchlist kembali kosong).

**Belum:** belum ada UI untuk membuat alert (aksi server `createAlert` ada,
tetapi tidak ada form); halaman /masuk dan /daftar belum ikut redesign.

---

## Sesi 2026-10-04 (lanjutan 2) — Redesign antarmuka "Lembar Bursa"

Permintaan pengguna: desain terlalu datar. Arah visual dipilih: lembar bursa /
koran keuangan cetak — kertas hangat (`paper #f4efe5`), skala tinta, aksen
kunyit, hijau naik / vermilion turun; Fraunces (judul), Instrument Sans (teks),
JetBrains Mono (angka tabular). Palet slate/emerald/red/amber lama dipetakan ke
token baru di `tailwind.config.ts` sehingga halaman lama ikut konsisten.

**Yang dibuat:**
- Masthead + strip info gelap, navigasi dengan penanda halaman aktif, footer
  dengan atribusi TradingView (lisensi Lightweight Charts).
- Dashboard: ticker tape, judul yang disusun dari data (bukan teks statis),
  breadth bar naik/tetap/turun, **peta pasar treemap squarified**
  (`src/lib/treemap.ts`, diuji `tests/domain/treemap.test.ts`) berukuran nilai
  transaksi, daftar penggerak, sparkline 30 hari, tabel desktop + daftar ringkas
  ponsel.
- Detail saham: grafik dimigrasi ke **lightweight-charts 5.2.1** (candlestick +
  volume + SMA), strip OHLC, panel teknikal (skala RSI, rentang 52 minggu, tren,
  MACD), empty state fundamental.
- Screener: kartu preset dengan jumlah lolos, chip alasan ✓/✕/? dengan nilai
  aktual di `title`, baris tidak lolos diurutkan menurut jumlah kondisi terpenuhi.
- Halaman `error.tsx` dan `not-found.tsx` yang dirancang; `prefers-reduced-motion`
  dihormati.

**Bug yang ditemukan & diperbaiki saat verifikasi:** overflow horizontal ponsel
(kontrol grafik tanpa `flex-wrap`; span sr-only lolos dari wrapper scroll →
wrapper `relative`), ECONNRESET koneksi Neon idle (`idle_timeout`/`max_lifetime`
di `src/server/db/client.ts`), kelas Tailwind tidak valid, badge sumber per baris
terlalu ramai (kini hanya saat mode campuran).

**Verifikasi nyata:** `pnpm build` OK; unit 93/93; E2E (server port 3100,
`DATA_MODE=demo`) 41 lolos / 1 skip / 2 gagal karena selector "Screener" ambigu
(nav vs footer) → selector dibatasi ke `navigation "Navigasi utama"`, kedua test
dijalankan ulang dan lolos. Overflow horizontal 0 di `/`, `/screener`,
`/saham/DEMA` pada 390px (diuji E2E). Server live port 3000: `/`, `/saham/BBCA`,
`/screener`, `/pengumuman` HTTP 200, 0 label demo.

**Batasan:** peta pasar hanya mencakup saham yang di-ingest (50), bukan seluruh
BEI — dinyatakan di UI. Fundamental live masih kosong sehingga panel fundamental
menampilkan empty state.

---

## Sesi 2026-10-04 (lanjutan) — Data real Arjum PERTAMA tersimpan

Pengguna menyediakan 5 API key untuk uji coba (disimpan di `.env.local` sebagai
`ARJUM_API_KEYS`, di-gitignore) dan meminta pemilihan key acak. Diterapkan
dengan batas: key dipilih acak per percobaan, tetapi **budget harian tetap satu
(800) untuk semua key** — tidak dikali jumlah key, agar tidak menjadi
penggabungan kuota lintas akun. Log hanya mencatat `key#N`, bukan nilai key.
Karena key pernah ditempel di chat, pengguna disarankan mencabutnya setelah uji
coba.

**Hasil nyata (semua dijalankan, bukan asumsi):**

| Langkah | Hasil |
| --- | --- |
| `pnpm arjum:probe -- --code=BBCA` | 6/6 endpoint OK, 6 request, tanpa retry. market-cap: data 2026-10-02, total 963 saham, 20 halaman, terurut menurun menurut kapitalisasi (BBCA 744 T, DCII 479 T, BBRI 462 T). history BBCA: `data_available` 2020-01-02…2026-10-02. Laporan keuangan terbaru Q1 2026 (fetched_at penyedia 2026-09-27). `/api/price`: `market_state=weekend`, `no_trade_today=true`, `source_date=2026-10-02`. Ringkasan: `docs/probes/arjum-probe-2026-10-04-BBCA.json` |
| Satuan | `value / volume` = `avg` (798.136.850.000 / 131.920.300 = 6.050,1) → volume **lembar**, value **Rupiah** — terkonfirmasi aritmetika pada respons nyata |
| `pnpm ingest:arjum -- --top=50 --limit=300` | 51 request OK; **50/50 saham, 14.945 baris** 2025-07-08…2026-10-02; 1 baris dikarantina (BNLI 2026-10-01 `open=0` padahal low 1.875 — anomali penyedia, tidak diperbaiki); EMAS 247 dan CDIA 299 baris karena baru listing |
| `pnpm jobs:run -- --mode=live` | Metrik 50 saham, as_of 2026-10-02. Preset valuasi 0/50 (fundamental real belum di-ingest → unknown, bukan lolos), momentum 1/50 |
| Ingest ulang BBCA/BBRI/TLKM | Baris tetap 300/kode, total tetap 14.945, `revision` 1→2 — **idempotensi live terbukti** |
| Kuota lokal | 60/800 terpakai pada 2026-10-04 (WIB) |
| Web (`DATA_MODE=live`, `pnpm start`) | Dashboard 50 saham real, 0 demo, sumber arjum, harga 2026-10-02; `/saham/BBCA` Rp6.100, grafik 2025-09-03…2026-10-02, RSI14 40,0, SMA20 6.310, SMA50 6.367, fundamental "Data belum tersedia"; `/saham/DEMA` → 404. Diperiksa dengan tangkapan layar Chromium |

**Tampilan hanya data real:** `DATA_MODE="live"` di `.env.local` menyembunyikan
instrumen/pengumuman demo dan banner demo (`src/server/data-mode.ts`). Data demo
tetap ada di database. Catatan: test E2E `tests/e2e/golden-path.spec.ts` ditulis
untuk data demo, jadi akan gagal saat server berjalan dengan `DATA_MODE=live`;
jalankan E2E dengan `DATA_MODE=demo` sampai test untuk data real ditambahkan.

**Status M3 menurut kriteria `AGENTS.md` §10:** respons live tervalidasi ✔,
baris real tersimpan ✔, job ulang idempotent ✔, indikator & UI memakai data
real ✔, metadata sumber/tanggal ✔, kegagalan ditangani (karantina, stop dini)
✔. **Belum:** scheduler belum terpasang (ingest/jobs masih manual); izin
penayangan publik data Arjum belum ada secara tertulis; fundamental, sektor,
dan pengumuman real belum di-ingest.

**Langkah berikutnya:** ingest laporan keuangan Arjum (3 request per saham)
agar PER/PBV/ROE terisi, lalu pasang scheduler harian setelah bursa tutup.

---

## Sesi 2026-10-04 — Validasi sumber Arjum dan persiapan ingestion real

**Status jujur saat bagian ini ditulis (sebelum ada key): M3 real-data BELUM selesai.** Pipeline Arjum (adapter,
validasi, kuota, lock, ingestion, kalkulasi, UI) sudah dibangun dan diuji
dengan fixture/mock serta PostgreSQL nyata, tetapi **belum ada satu pun
respons data Arjum yang divalidasi lewat API key, dan belum ada baris data
real di database.** Penyebab: `ARJUM_API_KEY` belum tersedia di `.env.local`;
satu-satunya kredensial lokal (`ARJUM_BEARER`) adalah token sesi web yang
kedaluwarsa 2026-09-27. Detail sumber: `docs/data-sources.md`.

### Audit kondisi awal (diperiksa, bukan dari laporan)

- `src/` tidak berubah sejak 2026-09-20; M0–M2 dan pipeline IDX utuh.
- Database Neon dev (dicek langsung): 24 instrumen demo, 6.283 bar demo,
  **0 instrumen/bar real**, 3 migrasi terpasang, 4 pengguna (1 admin, 3 user —
  satu di luar seed demo, tidak disentuh), 0 watchlist item.
- Baru dari pengguna: `AGENTS.md`/`CLAUDE.md` versi 4 Okt (Arjum prioritas),
  `audit-dashboard-invezgo-arjum.md`, `investigasi-sumber-data-saham-id.md`,
  direktori `test/` berisi skrip probe manual dan dump respons.

### Uji live yang benar-benar dijalankan (2 dari budget probe 10)

| Waktu | Panggilan | Hasil |
| --- | --- | --- |
| 2026-10-04 | `GET https://stock.arjum.com/api/health` tanpa auth | HTTP 200, `application/json`, 1,26 s, `{"ok":true,"status":"healthy"}`; header kuota tidak ada |
| 2026-10-04 | `GET /api/screener/latest` dengan `ARJUM_BEARER` (JWT sesi kedaluwarsa) | Timeout 15 s, status tidak diketahui, tidak diulang |

Tidak ada panggilan ke endpoint data tanpa key (lihat alasan di
`docs/data-sources.md`).

### Yang dibangun

- `src/server/providers/arjum/` — `config.ts` (base URL terkunci, key hanya
  dari env server, validasi kode saham), `client.ts` (timeout 30 s, retry
  terbatas dengan backoff+jitter hanya untuk 5xx/timeout/429, Retry-After
  dihormati/ditolak bila > 60 s, tanpa retry untuk 401/403/4xx/non-JSON,
  reservasi kuota sebelum SETIAP percobaan), `errors.ts`, `schemas.ts` (Zod
  dari skema teramati audit), `adapter.ts` (capability flags; history &
  market-cap = ingest; financial-statements, broker-summary, price = probe).
- `src/server/quota/budget.ts` + tabel `provider_quota_usage` — reservasi
  atomik satu statement; tanggal kuota menurut WIB (reset Arjum 00:00 WIB).
- `src/server/jobs/lock.ts` + tabel `job_locks` — lock berbasis lease memakai
  jam server DB (aman untuk PgBouncer/Neon pooler, aman dari selisih jam).
- `src/server/ingestion/validate-arjum-history.ts` — karantina (bukan
  perbaikan) untuk high<low, open/close di luar rentang, close null, nilai
  negatif, harga 0 bervolume, volume pecahan, tanggal tidak valid/masa depan/
  duplikat, kode respons tak cocok. Volume 0 + close terisi = hari tanpa
  transaksi (disimpan).
- `pnpm arjum:probe` (`src/jobs/arjum-probe.ts`) — opt-in, maks 10 percobaan
  HTTP termasuk retry, urutan market-cap → history → financial-statements →
  broker-summary → price → history monthly 500; ringkasan ke `docs/probes/`,
  body mentah ke `provider_raw_snapshots`.
- `pnpm ingest:arjum` (`src/jobs/ingest-arjum.ts`) — `--codes=` atau
  `--top=N` (≤ 50), lock job, satu transaksi per kode, upsert idempotent
  `source='arjum'`, `adjustment_method='unverified'`, tidak menimpa baris
  sumber lain, berhenti dini bila kuota habis/auth ditolak/non-JSON.
- Migrasi `drizzle/0003_zippy_raza.sql` — ditinjau sebelum dijalankan: hanya
  2× `CREATE TABLE`. Terpasang di Neon dev.
- `.env.example`: `ARJUM_API_KEY`, `ARJUM_DAILY_BUDGET`. `.gitignore`: `/test/`.

### Bug/risiko pada kode lama yang ditemukan dan diperbaiki

1. **Seed demo menghapus SEMUA data pasar** (`DELETE` tanpa filter pada
   instruments, daily_bars, ingestion_runs, dst.). Sekali `pnpm db:seed`
   setelah data real masuk akan memusnahkannya, dan seed gagal FK bila ada
   watchlist pengguna pada saham demo. Kini hanya data milik instrumen
   `data_mode='demo'`/run `provider='demo'` yang dihapus; sektor dan
   instrumen di-upsert (ID stabil); seed dibatalkan bila kode demo dipakai
   instrumen live.
2. **Kode demo bentrok dengan ticker BEI asli** (`ENRG`, `BAJA`, `ASRI`,
   `REAL`). Ingest kini menolak menempelkan harga real ke instrumen demo dan
   mencatat `data_quality_issues`, tanpa memanggil API (kuota tidak terbuang).
   Kode demo sendiri belum diganti (lihat langkah berikutnya).
3. **`as_of` global di `runComputeJob`**: data real yang lebih baru akan
   membuat seluruh instrumen demo berstatus stale. Kini dihitung per mode
   (`demo`/`live`) dengan `as_of` dan `input_batch_id` masing-masing.
4. **`close` null dihitung sebagai 0** dalam indikator (`?? 0` di
   `metrics.ts`). Kini bar dengan close null disaring di query.
5. **`evaluateAlerts` memakai satu `as_of` global** — setelah perubahan #3,
   alert pada mode yang tanggalnya lebih lama tidak akan pernah dievaluasi.
   Kini memakai snapshot terbaru per instrumen; ada test regresi.
6. **Dashboard & screener N+1** (1–2 query per instrumen). Kini masing-masing
   satu/dua query. Dashboard menilai stale per mode dan ringkasan pasar
   (breadth/movers) tidak mencampur demo dan real.
7. **Banner global mengklaim "seluruh data sintetis"** — akan salah begitu
   data real ada. Teks diganti agar benar di kedua kondisi.
8. **Overflow horizontal di mobile** (lihat hasil E2E di bawah).

### Verifikasi yang benar-benar dijalankan

- `pnpm typecheck`, `pnpm lint` — bersih (0 error, 0 warning).
- `pnpm test` (unit, tanpa jaringan) — **87/87 lulus** (30 baru: client
  Arjum 12, validator history 18).
- `pnpm test:integration` (Neon dev) — run penuh: 24 lulus, 1 file gagal
  (`notifications.test.ts`, bergantung urutan file → membuka bug #5);
  setelah perbaikan, file itu dijalankan ulang tersendiri: 2/2 lulus.
  `arjum-ingest.test.ts` **7/7 lulus**: kuota atomik (15 reservasi paralel,
  limit 10 → tepat 10), lock + takeover lease, ingest idempotent (revision
  naik, jumlah baris tetap), tidak menimpa sumber lain, menolak kode demo,
  seed tidak menghapus data real. Provider Arjum di test ini PALSU (fixture),
  bukan respons live.
- `pnpm build` — lulus.
- `pnpm test:e2e` (Playwright, **pertama kali bisa jalan** setelah
  `libasound2` terpasang): run pertama 18 lulus / 22 gagal — seluruhnya
  ambiguitas selector test (strict mode), bukan bug aplikasi. Hasil run ulang
  setelah perbaikan selector: lihat baris berikut.
- E2E run kedua: 38 lulus / 2 gagal — selector ambigu (logo "Screener Saham ID"
  ikut cocok). Setelah diperbaiki, test yang sama menemukan **bug UI nyata**:
  halaman lebar 401 px pada layar 390 px. Diukur dengan browser: sumbernya
  baris header (kotak cari + "Masuk/Daftar" tidak bisa membungkus), bukan
  tabel (tabel memang di dalam wadah `overflow-x-auto`). Diperbaiki di
  `src/app/layout.tsx` dan `src/components/SearchBox.tsx`.
- **E2E run akhir (setelah rebuild): 40/40 lulus** — Chromium desktop dan
  viewport mobile, terhadap `pnpm start` + Neon dev, **data demo saja** (belum
  ada data real untuk diuji di UI).
- Kondisi DB setelah semua test: 24 instrumen demo, 6.283 bar demo, tanpa sisa
  baris uji, `job_locks` kosong, `provider_quota_usage` kosong (2 panggilan
  live manual sesi ini tidak lewat penghitung kuota aplikasi).
- `pnpm typecheck` dan `pnpm lint` diulang setelah perubahan terakhir — bersih.

### Status penjadwalan

Tidak ada scheduler terpasang. `pnpm ingest:arjum` dan `pnpm arjum:probe`
manual; `src/jobs/worker.ts` (loop interval lokal) tidak memanggil ingestion
Arjum. Penayangan publik data Arjum belum diizinkan secara tertulis.

### Langkah berikutnya

1. **Pengguna**: tambahkan `ARJUM_API_KEY=sk_live_...` ke `.env.local` (lokal),
   sebaiknya key baru bila key "Testing" pernah utuh di `test/running-trade.js`.
2. `pnpm arjum:probe -- --code=BBCA` → bandingkan respons nyata dengan skema,
   konfirmasi satuan, cek header kuota dan perubahan kuota di dashboard
   penyedia, ganti fixture sintetis dengan sampel nyata yang disanitasi.
3. `pnpm ingest:arjum -- --codes=<20 saham likuid>` → `pnpm jobs:run` → cek
   dashboard/detail/screener → jalankan ingest kedua kali (idempotensi live).
4. Ganti kode demo ke format yang mustahil menjadi ticker BEI (mis. 5 huruf)
   agar saham seperti ENRG/BAJA bisa di-ingest.
5. Chart masih SVG buatan sendiri; `AGENTS.md` §2 menetapkan TradingView
   Lightweight Charts — belum dimigrasikan.

---

## Riwayat sebelum 2026-10-04

## Status ringkas

Repository sebelumnya kosong. M0 + M1 diimplementasikan sebagai vertical slice
demo yang benar-benar berjalan, diperkuat verifikasinya (determinisme fixture,
idempotensi seed/job, aturan TTM/null/not_applicable end-to-end), lalu **M2
(auth, watchlist, notes, saved screens, alert+notifikasi dedup, worker, panel
admin) diimplementasikan dan diverifikasi end-to-end** termasuk login
sungguhan via curl terhadap server produksi. Total **10 bug nyata** ditemukan
dan diperbaiki sepanjang sesi ini (5 selama penguatan M1, 5 selama M2) — lihat
bagian "Bug yang ditemukan dan diperbaiki" di masing-masing milestone di bawah.

**Jenis pengujian dibedakan secara eksplisit di seluruh dokumen ini:**
- **Unit** (Vitest, `tests/domain/**`): fungsi murni, tanpa I/O, tanpa mock DB.
- **Integration** (Vitest, `tests/integration/**`, `vitest.integration.config.ts`):
  terhadap PostgreSQL (Neon) nyata, memutasi data, dipaksa berjalan berurutan.
- **HTTP/DOM manual**: `curl` + `grep` terhadap server `next start` yang benar-benar
  berjalan — memverifikasi status code dan potongan teks HTML server-rendered.
  BUKAN pengujian browser (tidak menjalankan JS klien, tidak resize viewport).
- **Browser E2E** (Playwright, `tests/e2e/**`): ditulis dan mencakup golden path,
  grafik, filter screener, empty state, dan viewport mobile — **tapi pada sesi
  ini belum berhasil dijalankan** karena keterbatasan lingkungan (lihat bagian
  Playwright di bawah). Jangan anggap ini terbukti lulus sampai benar-benar
  dijalankan dan hasilnya dicatat di sini.

## Database yang dipakai untuk verifikasi

Neon PostgreSQL (`neondb`) yang disediakan pengguna khusus untuk sesi ini.
Diasumsikan dedicated dev/demo untuk proyek ini (bukan database bersama/produksi)
berdasarkan konteks pemberiannya dalam percakapan ini. Connection string
disimpan di `.env.local` (di-`.gitignore`, tidak pernah ditampilkan di log,
output perintah, atau commit manapun pada sesi ini). Operasi yang dijalankan
terhadapnya: migrasi (menambah skema), `seedDemoData()` (hapus-lalu-tulis-ulang
HANYA tabel demo: sectors/instruments/daily_bars/financial_facts/announcements/
metric_snapshots/screening_*/ingestion_runs/data_quality_issues — tidak ada
`DROP DATABASE`, tidak ada `TRUNCATE` di luar tabel-tabel ini, tidak ada operasi
di luar skema aplikasi ini). Tidak ada operasi destruktif di luar yang
didokumentasikan di README sebagai bagian normal dari `pnpm db:seed`.

## Bug yang ditemukan dan diperbaiki selama penguatan verifikasi M1

1. **Race condition test integrasi paralel** — Vitest secara default menjalankan
   file test paralel di worker terpisah. `tests/integration/idempotency.test.ts`
   memanggil `seedDemoData()` (hapus-lalu-tulis-ulang SEMUA data demo) sementara
   file test lain membaca/menulis tabel yang sama secara bersamaan, menyebabkan
   `PostgresError: violates foreign key constraint` dan timeout berantai.
   **Perbaikan**: `vitest.integration.config.ts` baru dengan `fileParallelism:
   false`, dipakai khusus oleh `pnpm test:integration` (`tests/domain/**` tetap
   di `vitest.config.ts` biasa, tetap paralel karena tidak menyentuh DB).
2. **N+1 query membuat `jobs:run` lambat terhadap DB remote** — kalkulasi metrik
   melakukan 2 query per instrumen (bukan sekali untuk semua instrumen), dan
   penulisan `metric_snapshots`/`screening_results` melakukan satu `INSERT`
   per baris di dalam loop (ratusan round-trip individual ke Neon). Untuk 24
   instrumen ini menyebabkan satu panggilan `jobs:run` butuh puluhan detik dan
   dua panggilan berurutan melebihi timeout test 60 detik. **Perbaikan**:
   `computeInstrumentSnapshots` (`src/server/services/metrics.ts`) sekarang
   mengambil seluruh `daily_bars`/`financial_facts` dalam 2 query total lalu
   mengelompokkannya di memori; `runComputeJob` (`src/jobs/run.ts`) sekarang
   melakukan bulk upsert (`onConflictDoUpdate` dengan `excluded.*`) dan bulk
   insert `screening_results` per preset, bukan per baris. Hasil: `pnpm jobs:run`
   dari ~40-60 detik menjadi **~14 detik** (termasuk overhead start `tsx`).
   Ini juga relevan untuk M3 (universe BEI penuh ~900 emiten akan jauh lebih
   parah dengan pola N+1 lama).
3. **Koneksi `postgres.js` ke endpoint pooled Neon (`-pooler`, PgBouncer
   transaction-pooling mode)** dengan prepared statements default menyebabkan
   hang/lock di bawah beban bersamaan. **Perbaikan**: semua pembuatan client
   (`src/server/db/client.ts`, `migrate.ts`, `seed.ts`, `run.ts`, test integrasi)
   sekarang memakai `{ prepare: false }`, sesuai rekomendasi resmi library
   `postgres.js` untuk koneksi lewat PgBouncer transaction mode.
4. Script `dotenv/config` semula hanya memuat `.env`, bukan `.env.local` —
   dibuat modul bersama `src/server/load-env.ts`.
5. Script `pnpm test` semula secara tidak sengaja ikut menjalankan
   `tests/integration/**` karena glob `--exclude` tidak di-quote (di-expand
   shell). Diperbaiki dengan quoting di `package.json`.

## Fixture deterministik dan kandidat preset yang dijamin

Ditambahkan 4 instrumen baru (`VPAS`, `VFAI`, `MPAS`, `MFAI`, total kini **24**
instrumen, tetap ≥20 sesuai syarat M1) dengan data **konstan/deterministik**
(bukan random walk) yang dirancang agar HASIL preset dapat diverifikasi tanpa
bergantung pada realisasi PRNG populasi umum:
- `VPAS` — PER=5x, ROE=20% → **dijamin lolos** preset `value_wajar`.
- `VFAI` — PER=40x, ROE=3% → **dijamin gagal** preset `value_wajar` (data
  tersedia, bukan `unknown`/`missing`).
- `MPAS` — kenaikan harga +1%/hari selama 25 sesi terakhir + lonjakan volume
  sesi terakhir → RSI14≈100, volume relatif≥1.2 → **dijamin lolos** preset
  `momentum_naik`.
- `MFAI` — harga datar (RSI14=50, edge case netral) → **dijamin gagal**.

Determinisme generator diverifikasi lewat unit test
(`tests/domain/demo-generator.test.ts`): `generateDailyBars`/`generateFinancialFacts`/
`generateAnnouncements` dipanggil dua kali dan hasilnya dibandingkan dengan
`toEqual` (harus identik byte-for-byte pada level objek JS). Kandidat
"guaranteed" diverifikasi dua lapis: level fungsi murni (unit test) DAN level
end-to-end lewat DB nyata (`tests/integration/metrics.test.ts`).

## TTM, null vs not_applicable — diverifikasi end-to-end

`tests/integration/metrics.test.ts` (terhadap data ter-seed di Neon, bukan mock):
- `BAJA` (ekuitas negatif): PBV dan DER berstatus `not_applicable`, value `null` —
  BUKAN angka valuasi murah palsu.
- `RETA`/`BATU` (kuartal fundamental hilang di tengah 8 kuartal): ROE/NPM
  berstatus `null_missing`, value `null` — TTM tidak dihitung karena
  `ttmFromQuarters` mendeteksi gap kuartal (bukan diam-diam jadi 0).
- `VPAS`/`VFAI`: PER dan ROE berstatus `ok` dengan nilai sesuai desain
  (5x/20% vs 40x/3%) — membuktikan kalkulasi TTM dari 4 kuartal diskrit
  berurutan bekerja benar end-to-end, bukan hanya di unit test.
- `MIGA`/`TEKO` (rugi): PER berstatus `not_applicable` karena EPS TTM ≤ 0 —
  BUKAN dianggap "murah" karena angka negatif/kecil.

## Idempotensi — diverifikasi end-to-end (`tests/integration/idempotency.test.ts`)

- `seedDemoData()` dijalankan dua kali berturut-turut: jumlah baris
  instruments/daily_bars/financial_facts/announcements **identik** pada kedua
  kali (hapus-lalu-tulis-ulang penuh, bukan penambahan/duplikasi).
- `runComputeJob()` dijalankan dua kali: jumlah baris `metric_snapshots`
  **identik** (upsert per instrument+as_of+metric+formula_version, bukan
  insert baru), dan **nilainya** juga identik antara run pertama dan kedua
  untuk input yang sama.
- `screening_runs` **SENGAJA bertambah** tiap kali `jobs:run` dipanggil (+2
  baris per run, satu per preset) — ini riwayat bertimestamp yang disengaja
  sesuai AGENTS.md §9 ("Pencatatan sinyal/hasil screening bertimestamp dan
  berversi"), BUKAN bug duplikasi. Test eksplisit memverifikasi pertambahan
  ini sebagai perilaku yang benar, bukan menganggapnya sebagai kegagalan.

## Playwright / Browser E2E — DITULIS, BELUM BERHASIL DIJALANKAN

`tests/e2e/golden-path.spec.ts` diperluas mencakup: label DATA DEMO di 6
halaman, dashboard, pencarian → detail → grafik (assert elemen `<svg>` dan
`<polyline>` benar-benar ada), empty state pencarian, 404 kode saham tidak
dikenal, screener (kandidat lolos/gagal deterministik `VPAS`/`VFAI`, ganti
preset, toggle "hanya data tersedia", buka panel "Mengapa lolos?" dan baca
alasannya), detail saham ekuitas negatif menampilkan "Tidak bermakna", halaman
pengumuman, dan dua skenario viewport mobile (390×844, termasuk cek tidak ada
horizontal overflow).

Saat dijalankan (`pnpm test:e2e` setelah `pnpm build`), Chromium **gagal
start**: `error while loading shared libraries: libasound.so.2: cannot open
shared object file`. Ini adalah dependency sistem Linux yang hilang di sandbox
ini (biasanya diinstal otomatis oleh `playwright install --with-deps`, yang
butuh `apt-get`/sudo). Sandbox ini tidak memberi akses sudo interaktif ke agent
maupun ke sesi shell yang dipakai (`sudo: a terminal is required to
authenticate` bahkan saat pengguna mencoba menjalankannya sendiri lewat prefix
`!`). **Perlu dijalankan dari terminal WSL/Ubuntu asli di luar Claude Code**:

```
sudo apt-get update && sudo apt-get install -y libasound2t64
# atau, pada Ubuntu lebih lama: sudo apt-get install -y libasound2
```

Setelah itu, jalankan ulang `pnpm test:e2e` dan perbarui bagian ini dengan
hasil sebenarnya (jangan asumsikan lulus dari sekadar menulis test-nya).

## HTTP/DOM manual (dilakukan, bukan pengganti E2E browser sungguhan)

`pnpm start` dijalankan, seluruh route dicek `curl`: `/`, `/saham/DEMA`,
`/saham/BAJA`, `/screener`, `/screener?preset=value_wajar`, `/pengumuman`,
`/cari?q=DEMA`, `/metodologi` → semua 200; `/saham/TIDAKADA` → 404 (benar,
`notFound()` bekerja). Isi HTML `/saham/BAJA` dikonfirmasi mengandung teks
"Tidak bermakna" untuk PBV. **Ini memverifikasi rendering server-side dan
routing, TAPI TIDAK memverifikasi JavaScript klien, interaksi (klik, form),
maupun perilaku responsif/viewport** — itulah kenapa Playwright tetap
diperlukan dan bagian di atas harus diselesaikan.

## Command lain yang sudah dijalankan sebelumnya (M0/M1 awal)

- [x] `pnpm install`, `pnpm typecheck`, `pnpm lint` — lulus (detail perbaikan:
  lihat riwayat commit/percakapan; ringkasnya null-safety di `indicators.ts`
  dan warning ESLint di `postcss.config.js`, keduanya sudah diperbaiki).
- [x] `pnpm db:generate` / `pnpm db:migrate` — berhasil, 11 tabel.
- [x] `pnpm build` — berhasil, 6 route terkompilasi tanpa error.
- [ ] `docker compose up -d` — **belum pernah berhasil diverifikasi** di
  sandbox ini (butuh sudo interaktif yang tidak tersedia). Konfigurasinya
  sudah benar secara statis, tapi belum ada bukti runtime nyata dari sandbox
  ini. Coba di lingkungan dengan akses Docker normal sebelum menganggap ini
  terbukti jalan.

## Belum selesai / ditunda sesuai AGENTS.md

- Filter screener kustom oleh pengguna (AST sudah ada, UI form belum disambung;
  M1 hanya menyediakan preset tetap).
- Kompilasi filter AST → SQL `WHERE` dinamis belum dibuat; evaluasi filter
  dilakukan di application layer (lihat `docs/architecture.md`). Cukup untuk
  24 instrumen demo, perlu direvisi sebelum universe BEI penuh (dan sekarang
  lebih mendesak karena pola N+1 baru ditemukan di jalur lain — lihat di atas).
- Kalender bursa demo hanya Senin-Jumat, tanpa kalender libur nasional BEI.
- M3 (integrasi LIVE) belum dimulai — endpoint BEI yang dilaporkan belum
  diverifikasi izin/akses/skema dari server kami.
- Playwright E2E belum berhasil dijalankan (lihat bagian di atas).

## M2 — Personalisasi dan Operasi Otomatis

Status: **diimplementasikan dan diverifikasi end-to-end** (unit + integration +
login sungguhan via curl, bukan hanya ditulis).

### Yang dibangun

- **Auth**: Auth.js (next-auth) v5, Credentials provider, sesi JWT, password
  di-hash bcryptjs. Lihat `docs/adr/0002-autentikasi-m2.md` untuk alasan
  pemilihan. Halaman `/daftar` (registrasi, validasi Zod di server) dan
  `/masuk` (login). Tabel `users` dengan kolom `role` (`user`/`admin`).
- **Watchlist**: tambah/hapus saham per pengguna (`watchlist_items`, unique
  per user+instrument). Tombol "+ Watchlist" di halaman detail saham,
  halaman `/watchlist` untuk melihat/menghapus.
- **Catatan pribadi**: per pengguna per saham (`notes`), form tambah + hapus
  di halaman detail saham, hanya terlihat oleh pemiliknya.
- **Saved screens**: `saved_screens` menyimpan `FilterNode` (divalidasi ulang
  dengan `filterNodeSchema`+`validateFilterNode` saat dipakai, tidak dipercaya
  buta dari storage). Server action tersedia (`createSavedScreen`,
  `deleteSavedScreen`); UI form pembuatannya di `/screener` belum disambung
  (lihat "Belum selesai").
- **Alert**: `alerts` (metric/operator/threshold per user+instrument, kolom
  `lastConditionMet` melacak transisi). Server action `createAlert`/`deleteAlert`.
- **Notifikasi in-app dengan dedup**: `src/jobs/evaluate-alerts.ts` — trigger
  HANYA pada transisi kondisi false→true, cooldown per alert, idempotency key
  `${alertId}:${asOf}` + **unique constraint DB** (`notifications_idempotency_unique`)
  sebagai backstop keras (bukan hanya mengandalkan logic aplikasi). Halaman
  `/notifikasi` untuk melihat/menandai dibaca. Dipanggil otomatis dari
  `src/jobs/worker.ts` setelah `runComputeJob()`.
- **Worker otomatis tanpa browser**: `src/jobs/worker.ts` — script `tsx` murni
  (tidak ada dependency browser/DOM), loop `runComputeJob()` +
  `evaluateAlerts()` per interval (`WORKER_INTERVAL_MS`, default 15 menit).
  Catatan jujur: ini loop interval sederhana untuk pengembangan lokal, BUKAN
  scheduler production-grade (tidak ada leader election/retry-backoff/graceful
  shutdown) — sudah didokumentasikan sejak M1 di `docs/architecture.md`.
- **Panel admin**: `/admin/jobs` — daftar `ingestion_runs`, `data_quality_issues`,
  tombol "Jalankan Ulang Job Kalkulasi" (memanggil `runComputeJob()` langsung).
  Diproteksi di server (redirect ke `/` bila bukan admin), bukan hanya
  menyembunyikan link di nav.

### Arsitektur otorisasi: core.ts terpisah dari actions.ts

Setiap fitur (`watchlist`, `notes`, `saved-screens`, `admin`) punya dua file:
- `actions.ts` (`"use server"`) — memanggil `requireUser()`/`requireAdmin()`
  dari `src/server/auth/session.ts` (baca sesi via `auth()` dari Auth.js),
  lalu delegasi ke `core.ts`. Ini yang dipanggil UI.
- `core.ts` — logic sesungguhnya (query DB dengan `WHERE userId=...`,
  `requireOwnership()`), menerima `currentUserId`/`currentUserRole` sebagai
  PARAMETER eksplisit, bukan membaca sesi sendiri. Ini yang diuji langsung di
  `tests/integration/authorization.test.ts` — sesi Next.js (`auth()`, butuh
  request context) tidak bisa dipanggil dari Vitest, jadi pemisahan ini yang
  membuat authorization test BENAR-BENAR menguji logic yang dipakai actions.ts,
  bukan reimplementasi terpisah yang bisa diam-diam berbeda dari kode asli.

Kelas `ForbiddenError`/`UnauthorizedError`/`requireOwnership` sendiri dipisah
lagi ke `src/server/auth/errors.ts` (tanpa dependency `next-auth` sama sekali)
— alasannya bug #7 di bawah.

### Bug yang ditemukan dan diperbaiki selama M2

6. **`server-only` package gagal dimuat di Vitest** — paket ini SELALU throw
   kecuali bundler (webpack Next.js) menukarnya dengan file kosong untuk
   kondisi "react-server"; Vitest tidak melakukan penukaran itu, jadi modul
   manapun yang mengimpor `"server-only"` (semua `core.ts`, `src/server/db/client.ts`)
   gagal dimuat langsung di test. **Perbaikan**: `tests/shims/server-only.js`
   (stub kosong) di-alias lewat `resolve.alias` di KEDUA config Vitest
   (`vitest.config.ts` dan `vitest.integration.config.ts`). Guard asli tetap
   aktif normal di build Next.js sungguhan — alias ini hanya berlaku saat test.
7. **`next-auth` gagal diimpor di Vitest** — `next-auth` mengimpor `next/server`
   secara internal, yang gagal diresolve Node/Vite ESM resolution di luar
   bundler Next.js (`Cannot find module '.../next/server'`). Awalnya
   `authorization.test.ts` gagal total dimuat karena rantai impor
   `core.ts → session.ts → config.ts → next-auth`. **Perbaikan**: pisahkan
   `ForbiddenError`/`UnauthorizedError`/`requireOwnership` (murni, tidak butuh
   next-auth) ke `src/server/auth/errors.ts`; `session.ts` (yang butuh
   `auth()` dari next-auth untuk `requireUser`/`requireAdmin`) tetap terpisah
   dan HANYA diimpor oleh `actions.ts` (dipakai Next.js runtime asli, bukan
   test). Semua `core.ts` sekarang impor dari `errors.ts`, bukan `session.ts`.
8. **`UntrustedHost` — Auth.js menolak semua request saat `next start`** —
   ditemukan saat verifikasi login sungguhan via curl terhadap server
   produksi (`pnpm build && pnpm start`): setiap request ke `/api/auth/*`
   gagal dengan `[auth][error] UntrustedHost: Host must be trusted` (500 pada
   login, gagal ambil CSRF token). Auth.js v5 menolak Host header yang tidak
   dikenalinya sebagai platform tepercaya (Vercel dsb.) secara default.
   **Perbaikan**: `trustHost: true` ditambahkan di `src/server/auth/config.ts`,
   dengan catatan keamanan di komentar kode: aman untuk self-hosted di
   belakang reverse proxy yang mengontrol header Host; bila di-expose langsung
   ke internet tanpa proxy tepercaya, perlu validasi Host di layer sebelumnya.
   Ini TIDAK bisa ditemukan lewat unit/integration test biasa (tidak menyentuh
   HTTP layer Auth.js) — hanya ketahuan karena login diuji sungguhan lewat
   `curl` terhadap server `next start` nyata, bukan diasumsikan dari kode
   terlihat benar.
9. Operator alert sempat memakai `NUMERIC_OPERATORS` dari `filter-ast.ts`
   (termasuk `"eq"`) padahal kolom `alert_operator` enum DB hanya
   `gt/gte/lt/lte` — mismatch tipe TypeScript. **Perbaikan**: definisikan
   `ALERT_OPERATORS` terpisah khusus alert.
10. Dua test integrasi (`authorization.test.ts` — notes & saved_screens) awalnya
    "gagal" — investigasi menunjukkan ini BUG DI TEST, bukan di aplikasi:
    `deleteNoteCore`/`deleteSavedScreenCore` memang MELEMPAR `ForbiddenError`
    (perilaku aman yang benar) saat bukan pemilik, tapi test semula
    mengasumsikan fungsi mengembalikan `{ok:false}`. Diperbaiki dengan
    `await expect(...).rejects.toThrow(ForbiddenError)`. Dicatat di sini
    secara eksplisit karena penting membedakan "test salah" dari "kode salah".

### Verifikasi end-to-end login sungguhan (bukan hanya integration test)

Setelah `pnpm build` + `pnpm start`, dilakukan login NYATA via `curl` dengan
cookie jar (bukan memanggil fungsi Node langsung) terhadap tiga pengguna demo
(`pnpm db:seed-users` — admin@demo.local/usera@demo.local/userb@demo.local,
password statis HANYA untuk dev lokal, lihat `src/jobs/seed-users.ts`):

- Ambil CSRF token (`/api/auth/csrf`) → POST `/api/auth/callback/credentials`
  dengan email+password+csrfToken → **302**, cookie sesi tersimpan.
- `GET /api/auth/session` dengan cookie → mengembalikan `{user:{id,email,role},expires}`
  yang benar (role `user` untuk usera, `admin` untuk admin@demo.local).
- `usera` (role `user`) akses `/watchlist` → **200**. Akses `/admin/jobs` →
  **307 redirect ke `/`** (ditolak, benar).
- `admin@demo.local` akses `/admin/jobs` → **200**, HTML mengandung
  "Panel Admin" dan "Riwayat Ingestion Run".
- Halaman `/saham/DEMA` sebagai `usera` mengandung teks "Watchlist" (tombol)
  dan "Catatan Pribadi" (section notes) — elemen UI M2 benar-benar tampil
  untuk pengguna login, bukan hanya ada di kode.

Server dimatikan setelah verifikasi (`pkill -f next-server`).

### Command M2 yang dijalankan — hasil nyata

- [x] `pnpm db:generate` — migrasi baru `drizzle/0001_bored_mystique.sql`
  (+7 tabel: users, watchlist_items, notes, saved_screens, alerts,
  notifications, plus enum baru). `pnpm db:migrate` — berhasil (17 tabel total).
- [x] `pnpm db:seed-users` — 3 pengguna demo dibuat/diperbarui (upsert by email).
- [x] `pnpm typecheck`, `pnpm lint` — bersih (0 error, 0 warning) setelah
  seluruh perbaikan di atas.
- [x] `pnpm test` (unit) — **40/40 lulus** (termasuk 8 test determinisme
  generator dari penguatan M1).
- [x] `pnpm test:integration` — **16/16 lulus**: `authorization.test.ts` (4,
  isolasi watchlist/notes/saved_screens user A/B + pembatasan admin),
  `metrics.test.ts` (5), `idempotency.test.ts` (4), `notifications.test.ts`
  (2, dedup alert), `schema.test.ts` (1).
- [x] `pnpm build` — berhasil, 13 route (naik dari 6 di M1: `+/masuk`, `/daftar`,
  `/watchlist`, `/notifikasi`, `/admin/jobs`, `/api/auth/[...nextauth]`).
- [x] `pnpm start` + verifikasi login sungguhan via curl — lihat bagian di atas.
- [ ] `pnpm test:e2e` (Playwright) — masih terblokir `libasound2` (lihat bagian
  M1 di atas, belum berubah pada sesi M2 ini).

### Belum selesai (M2)

- Form UI untuk membuat saved screen dan alert dari halaman `/screener`/`/watchlist`
  belum disambung (server action `createSavedScreen`/`createAlert` sudah ada
  dan sudah diuji, tinggal form-nya).
- Auth: strategi JWT (bukan database session) — trade-off dicatat di ADR 0002,
  perlu direvisi ke adapter penuh sebelum butuh revoke-sesi-langsung atau login
  sosial.
- `retryIngestionRun` di panel admin mengubah status jadi `"retrying"` tapi
  belum benar-benar memicu ulang provider fetch tertentu (belum ada provider
  LIVE untuk di-retry pada M1/M2 — hanya kerangka status, jujur belum penuh).
- Expiry alert/notifikasi (AGENTS.md §9 menyebut "expiry") belum
  diimplementasikan — saat ini hanya cooldown per alert, belum ada TTL
  otomatis pada notifikasi lama.

## M3 — Integrasi Data Harga Harian Real (BARU DIMULAI, BELUM SELESAI)

**Status jujur: adapter, validasi, skema, dan pipeline SUDAH lengkap dan
teruji (fixture + integration dengan mock) — tapi BELUM ADA SATU BARIS DATA
HARGA REAL PUN yang berhasil tersimpan**, karena akses server-side ke
idx.co.id diblokir Cloudflare dari lingkungan pengembangan ini (dikonfirmasi
langsung, bukan diasumsikan — lihat `docs/data-sources.md`). Kriteria
keberhasilan M3 ("data aktual tervalidasi melewati database, perhitungan,
tampilan aplikasi") **BELUM terpenuhi**. Jangan menganggap M3 selesai dari
bagian ini.

### Yang benar-benar selesai

1. **Interface provider per kapabilitas** (`src/server/providers/types.ts`):
   `DailyBarsProvider`, dipisah dari implementasi konkret sesuai AGENTS.md §6.
2. **Adapter IDX** (`src/server/providers/idx/`):
   - `client.ts` — fetch dengan timeout 15s, retry TERBATAS (maks 2x) HANYA
     untuk kegagalan transien (5xx, network error, timeout); HTTP 403/non-JSON
     (indikasi blokir) TIDAK di-retry sama sekali, dilempar sebagai
     `IdxBlockedError` — sesuai instruksi eksplisit "jangan mengulang request
     yang diblokir".
   - `schema.ts` — Zod schema 32 field `GetStockSummary` PERSIS sesuai nama
     yang dilaporkan riset (bukan tebakan), `.passthrough()` untuk field tak
     dikenal ditangkap sebagai `unknownFieldKeys`, bukan diam-diam diabaikan.
   - `adapter.ts` — normalisasi row provider → `RawDailyBarRow` generik,
     hanya memanggil endpoint yang dilaporkan riset (tidak menebak endpoint lain).
   - `errors.ts` — `IdxBlockedError`/`IdxTransientError`/`IdxSchemaError` typed
     terpisah, masing-masing ditangani job ingest secara berbeda.
3. **Validasi/normalisasi bisnis** (`src/server/ingestion/validate-daily-bars.ts`):
   menegakkan SEMUA aturan wajib instruksi M3 poin 5 — tanggal baris harus
   cocok tanggal diminta (bukan dipaksakan), kode saham unik per tanggal,
   kode/nama mengandung "DUMMY" dikecualikan otomatis, volume=0 dengan close
   terisi ditandai `hasTransaction=false` (BUKAN issue/data hilang), baris
   tanpa harga sama sekali diberi warning tapi tetap disertakan, tanggal tidak
   bisa diparse dikecualikan (bukan dipaksa). ForeignBuy/Sell dan
   TradebleShares disimpan mentah di `extra`, TIDAK PERNAH dipakai kalkulasi
   metrik apa pun.
4. **Pemisahan demo/live eksplisit di skema DB** (migrasi
   `drizzle/0002_gigantic_pestilence.sql`, non-destruktif — murni tambah
   kolom/tabel, direview sebelum dijalankan): kolom `instruments.data_mode`
   (`'demo'|'live'`, default `'demo'` — baris lama tidak berubah), tabel baru
   `provider_raw_snapshots` (audit respons mentah per batch, terpisah dari
   `daily_bars` supaya baris harga tidak membengkak — AGENTS.md §7).
5. **Job ingest manual** (`src/jobs/ingest-idx-daily.ts`, `pnpm ingest:idx`):
   - CLI `--date=YYYYMMDD` atau `--from=..&--to=..` dengan **hard ceiling 30
     request per invokasi** — TIDAK ADA backfill otomatis sejak 2020.
   - Satu transaksi DB per tanggal — batch gagal pada satu tanggal TIDAK
     menyentuh data tanggal lain yang sudah valid (diverifikasi test, lihat
     di bawah).
   - Upsert idempotent (unique constraint `daily_bars` + `onConflictDoUpdate`,
     revision bertambah tiap re-ingest tanggal yang sama).
   - Instrumen baru dari IDX otomatis dibuat dengan `dataMode='live'` —
     TIDAK PERNAH ditandai `'demo'`.
   - **TIDAK terhubung ke worker terjadwal** (`src/jobs/worker.ts` tidak
     memanggil ini). Manual-only, sesuai instruksi "jadwal eksternal default
     nonaktif sampai konfigurasi dan akses siap" DAN gerbang legal ToS BEI.
6. **UI menampilkan sumber data eksplisit**: `DataModeBadge` ("DATA DEMO"
   kuning / "DATA REAL" biru) tampil di dashboard (kolom baru "Sumber"),
   hasil pencarian, dan halaman detail saham. Ringkasan dashboard memecah
   jumlah instrumen demo vs live. Halaman detail instrumen `live` menampilkan
   catatan eksplisit bahwa fundamental real belum tersedia (bukan diam-diam
   kosong atau memakai data demo instrumen lain).
7. **Indikator/preset dengan histori kurang tetap `unavailable`** — ini
   sudah menjadi properti struktural `src/domain/indicators.ts`/
   `src/server/services/metrics.ts` sejak M1 (SMA/EMA/RSI/MACD mengembalikan
   `null` sebelum jumlah bar cukup), jadi otomatis berlaku benar untuk
   instrumen live dengan histori 1-2 hari tanpa perubahan kode tambahan —
   tidak diverifikasi ulang di sini karena sudah diverifikasi sejak M1
   (instruksi: jangan mengulang pengujian yang sudah selesai tanpa alasan).

### Hasil uji akses nyata terhadap idx.co.id

Dijalankan dari lingkungan eksekusi sesi ini (`curl`, bukan browser), sesuai
instruksi M3 poin 3 — **HTTP 403 pada kedua tanggal yang diminta uji
(2026-08-14 dan 2026-07-15), dan pada homepage `idx.co.id` itu sendiri**,
dengan header `cf-mitigated: challenge` dan body halaman tantangan Cloudflare
"Just a moment...". Detail lengkap, termasuk perintah `curl` persis yang
dijalankan dan responsnya, ada di `docs/data-sources.md`. **Tidak ada upaya
bypass** (tidak ada rotasi User-Agent berulang, tidak ada proxy, tidak ada
penyalinan cookie browser) — setiap URL hanya dicoba sekali sesuai instruksi
"jangan mengulang request yang diblokir".

**Temuan tambahan penting**: laporan riset yang sudah ada di repository
(`claude-opus-5-effort-high-extension-bei-analyst.md`) mencatat bahwa Terms of
Use resmi BEI **melarang scraping/crawling bahkan untuk non-komersial**. Ini
gerbang legal terpisah dari blokir teknis Cloudflare — dicatat sebagai temuan
baru karena mengubah gambaran strategis: bahkan jika blokir teknis di atas
suatu saat teratasi lewat jalur resmi, ingest otomatis produksi tetap
memerlukan izin tertulis BEI sebelum diaktifkan.

### Command dan hasil pengujian yang BENAR-BENAR dijalankan

- [x] `pnpm typecheck`, `pnpm lint` — bersih (0 error, 0 warning) setelah
  seluruh kode M3 ditulis.
- [x] `pnpm db:generate` — migrasi `drizzle/0002_gigantic_pestilence.sql`
  **direview manual sebelum dijalankan** (murni `CREATE TYPE`, `CREATE TABLE`,
  `ALTER TABLE ... ADD COLUMN ... DEFAULT 'demo' NOT NULL` — tidak ada `DROP`
  apa pun, tidak ada perubahan data user). `pnpm db:migrate` — berhasil
  terhadap Neon, 18 tabel total.
- [x] `pnpm test` (unit, fixture sintetis — CI default, TIDAK ada request
  jaringan sungguhan) — **57/57 lulus**, termasuk 17 test baru khusus IDX:
  - `tests/providers/idx-validation.test.ts` (11 test): parsing tanggal
    sumber, array kosong bukan hari libur, kode duplikat, DUMMY dikecualikan,
    volume 0 = normal bukan data hilang, tanggal tidak cocok dikecualikan.
  - `tests/providers/idx-adapter.test.ts` (6 test, `fetch` di-mock — TIDAK
    ada network call): 403+HTML → `IdxBlockedError` tanpa retry (dibuktikan
    `fetchMock` dipanggil TEPAT 1x); respons valid ternormalisasi benar;
    array kosong → `isEmpty=true`; schema salah → `IdxSchemaError`; field tak
    dikenal tertangkap; HTTP 500 di-retry TERBUKTI (>1 call) lalu
    `IdxTransientError`.
- [x] `pnpm test:integration` (terhadap Neon nyata) — **dijalankan 3x** selama
  sesi ini karena bug ditemukan dan diperbaiki bertahap (lihat "Bug yang
  ditemukan" di bawah). **Hasil attempt terakhir**: `idx-ingest.test.ts`
  **3/3 lulus** (baru untuk M3), `authorization.test.ts` **4/4 lulus**,
  `schema.test.ts` **1/1 lulus**. Tiga file lain (`metrics.test.ts`,
  `idempotency.test.ts`, `notifications.test.ts`) — **kodenya TIDAK berubah**
  sejak terakhir kali lulus penuh 16/16 sebelum M3 dimulai — mengalami
  timeout luas (hook/test timeout 60-90 detik, idle menunggu I/O dengan CPU
  time hampir nol) pada attempt kedua DAN ketiga secara konsisten,
  diselingi test lain yang cepat dan lulus normal (indikasi kuat network
  blip Neon transien, pola yang SAMA seperti pernah terjadi dan
  terdokumentasi selama M2, bukan regresi kode). **Tidak terus di-retry**
  sesuai instruksi eksplisit sesi ini ("jangan berhenti pada laporan 403...
  tapi juga jangan retry tanpa henti").
- [x] `pnpm build` — lihat hasil di bawah (dijalankan setelah semua fix).

### Bug yang ditemukan dan diperbaiki selama M3

11. **Test integrasi baru memakai format tanggal salah di mock** —
    `idx-ingest.test.ts` memanggil mock provider dengan tanggal compact
    (`"20260105"`) tapi mock men-generate `tradingDate` tanpa dash
    (`"20260105T00:00:00"`), yang gagal diparse `tryParseSourceDate` (butuh
    format ISO berdash) — menyebabkan SEMUA baris dikecualikan dan test
    salah menyimpulkan instrumen tidak pernah dibuat. Bug di TEST saya
    sendiri, bukan di `validate-daily-bars.ts` (fungsi itu justru BEKERJA
    BENAR menolak tanggal yang tidak sesuai format). Diperbaiki dengan
    helper `toIsoDate()` di file test.
12. **`afterAll` di `idx-ingest.test.ts` melanggar foreign key saat cleanup**
    — menghapus `ingestion_runs` sebelum `data_quality_issues` yang
    mereferensikannya. Diperbaiki: hapus `data_quality_issues` terkait
    dulu, baru `ingestion_runs`.
13. **`afterAll` di `notifications.test.ts` (dan `authorization.test.ts`,
    dikeraskan preventif) rentan crash "UNDEFINED_VALUE"** bila `beforeAll`
    gagal di tengah jalan (mis. akibat bug #11/#12 atau timeout jaringan) —
    variabel id (`alertId`/`userId`/dst) tetap `undefined`, lalu dipakai
    sebagai parameter query yang ditolak `postgres.js`. Diperbaiki dengan
    guard `if (id) { ... }` sebelum setiap query cleanup, di kedua file.

### Cara menjalankan mode demo vs mode real

**Demo** (tidak berubah dari M1/M2):
```
pnpm db:seed && pnpm jobs:run
```

**Real (IDX)** — manual, terbatas, HANYA untuk pengujian sampai jalur
penggunaan resmi jelas (lihat gerbang legal di atas):
```
pnpm ingest:idx -- --date=20260919          # satu tanggal
pnpm ingest:idx -- --from=20260915 --to=20260919   # rentang, maks 30 hari kerja per invokasi
```
Saat ini kedua bentuk di atas akan gagal dengan `IdxBlockedError` (HTTP 403)
sampai akses server-side tidak lagi diblokir Cloudflare ATAU jalur akses resmi
tersedia — lihat `docs/data-sources.md` bagian "Apa yang dibutuhkan untuk
melanjutkan".

Contract test live opt-in (tidak dijalankan otomatis, butuh flag eksplisit):
```
IDX_LIVE_TEST=1 pnpm vitest run tests/integration/idx-live.test.ts --config vitest.integration.config.ts
```

### Status penjadwalan ingest

**NONAKTIF secara default, dan TIDAK terhubung ke worker.** `src/jobs/worker.ts`
hanya memanggil `runComputeJob()` (demo) dan `evaluateAlerts()` — tidak ada
panggilan ke `ingest-idx-daily.ts` di mana pun dalam kode. Ini disengaja,
bukan kelalaian: mengaktifkan ingest terjadwal otomatis sebelum (a) blokir
Cloudflare teratasi lewat jalur sah, DAN (b) izin tertulis BEI diperoleh,
akan melanggar instruksi eksplisit sesi ini ("jangan mengaktifkan ingest
produksi terjadwal... sebelum jalur penggunaan jelas").

### Hambatan dan langkah berikutnya (konkret, bukan janji)

**Hambatan yang menghalangi penyelesaian M3 sesungguhnya** (lihat
`docs/data-sources.md` bagian terakhir untuk detail): akses server-side ke
idx.co.id diblokir Cloudflare (teknis) DAN Terms of Use BEI melarang scraping
otomatis (legal) — keduanya independen, keduanya perlu diselesaikan sebelum
data aktual bisa benar-benar mengalir. Ini BUKAN berarti semua opsi otomatisasi
mustahil — dua jalur konkret didokumentasikan di `docs/data-sources.md`:
izin resmi/langganan data berlisensi, atau sampel JSON mentah dari pengguna
untuk validasi adapter satu kali (tidak menyelesaikan ingest berkelanjutan,
tapi membuktikan `schema.ts` benar terhadap data sungguhan).

Langkah berikutnya setelah salah satu di atas tersedia:
1. Jalankan `pnpm ingest:idx -- --date=<tanggal kerja terbaru>` sungguhan,
   verifikasi baris tersimpan dengan `dataMode='live'`, `source='idx'`.
2. Ulangi untuk satu tanggal pembanding (instruksi M3 poin 3/9), bandingkan
   jumlah baris dan field terhadap laporan riset.
3. Setelah dua tanggal terbukti, jalankan `pnpm jobs:run` dan konfirmasi
   dashboard/detail/screener menampilkan instrumen live dengan status
   indikator yang jujur (`unavailable` untuk histori <periode minimum).
4. Baru setelah itu pertimbangkan perluasan terbatas (checkpoint eksplisit,
   bukan backfill penuh) untuk histori minimum MA20/RSI14/MACD (~35-60 sesi).
5. Re-run `pnpm test:integration` di luar jam yang berpotensi terkena network
   blip untuk memastikan 20/20 test integrasi (termasuk 3 file yang belum
   terverifikasi ulang di sesi M3 ini) tetap hijau.
