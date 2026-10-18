# Screener Saham Indonesia (Demo)

Screener saham BEI dengan Next.js App Router + TypeScript + Drizzle ORM +
PostgreSQL. **Status: M0/M1 — vertical slice demo read-only.** Lihat
`AGENTS.md` untuk spesifikasi lengkap dan `docs/progress.md` untuk status
implementasi terkini.

> Seluruh data pada mode saat ini adalah **DATA DEMO** sintetis, bukan data
> pasar riil BEI. Tidak ada koneksi keluar ke provider eksternal pada M1.

## Prasyarat

- Node.js >= 20
- pnpm (`corepack enable && corepack prepare pnpm@latest --activate`)
- PostgreSQL (via Docker Compose yang disediakan, atau instance eksternal)

## Setup dari clone bersih

```bash
pnpm install
cp .env.example .env.local
# edit .env.local bila DATABASE_URL berbeda dari default docker-compose

docker compose up -d          # PostgreSQL lokal (opsional bila pakai DB eksternal)
pnpm db:generate               # generate migrasi SQL dari src/server/db/schema.ts
pnpm db:migrate                # jalankan migrasi ke database
pnpm db:seed                   # isi data DEMO sintetis (instrumen, harga, fundamental, pengumuman)
pnpm jobs:run                  # hitung indikator/rasio + jalankan preset screener

pnpm dev                       # http://localhost:3000
```

## Environment variables

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | Ya | Koneksi PostgreSQL. |
| `DATA_MODE` | Tidak | `demo` (default) atau `live` (belum diverifikasi, lihat `docs/data-sources.md`). |
| `AUTH_SECRET` | Untuk M2 | Belum dipakai di M1 (belum ada auth). |
| `NEXT_PUBLIC_APP_URL` | Tidak | Base URL aplikasi. |

## Script

| Perintah | Fungsi |
| --- | --- |
| `pnpm dev` | Jalankan Next.js dev server |
| `pnpm build` / `pnpm start` | Build & jalankan produksi |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit test (Vitest, domain functions) |
| `pnpm test:integration` | Integration test terhadap PostgreSQL nyata |
| `pnpm test:e2e` | Playwright end-to-end (butuh server + data seed) |
| `pnpm db:generate` | Generate migrasi SQL dari schema Drizzle |
| `pnpm db:migrate` | Jalankan migrasi |
| `pnpm db:seed` | Isi data demo sintetis |
| `pnpm jobs:run` | Hitung metric_snapshots + screening_runs sekali jalan |
| `pnpm ingest:arjum -- --top=50 --limit=300` | Ingest awal data harian real (Arjum) |
| `pnpm jobs:daily` | Pembaruan harian sekali jalan dengan cek saham patokan (`--manual`: tanpa cek, `--scheduled`: patuhi jadwal — untuk cron) |
| `pnpm jobs:universe [--backfill]` | Ambil daftar semua saham (±20 request); `--backfill` lanjut isi riwayat saham baru dengan sisa kuota hari ini |
| `pnpm jobs:backfill-foreign` | Isi kolom volume asing `daily_bars.foreign_*` dari respons history yang sudah tersimpan (0 request) |
| `pnpm arjum:probe-extended -- --max-calls=30 --out=FILE` | Probe read-only endpoint tambahan (opt-in, maks 30 panggilan, memakai kuota) |
| `pnpm worker` | Proses panjang (juga menjalankan dataset tambahan yang diaktifkan admin di panel "Dataset tambahan"): pembaruan harian otomatis hari kerja mulai 17.00 WIB (ulang tiap jam, maks. 5×), permintaan "Jalankan sekarang" dari panel admin, lalu perawatan cakupan (daftar saham mingguan + backfill dengan sisa kuota) |

### Pembaruan data otomatis (lapis 1: harga penutupan)

Hosting (Vercel + GitHub Actions + Neon): lihat `docs/deploy.md`. Hosting VPS (systemd + Caddy + DuckDNS): lihat `docs/deploy-vps.md`.

Halaman web tidak pernah memanggil penyedia data; mereka membaca database.
Data baru masuk lewat salah satu cara berikut (logika jadwalnya sama):

- **Lokal:** biarkan `pnpm worker` berjalan. Status worker terlihat di
  `/admin/jobs`.
- **Server/hosting:** jalankan worker dengan process manager (systemd, pm2,
  container), **atau** cron tiap 10 menit:
  `*/10 * * * *  cd /app && pnpm jobs:daily --scheduled`
  Aplikasi sendiri yang menghitung hari kerja dan jam WIB, jadi zona waktu
  mesin tidak berpengaruh. Saat belum waktunya, perintah ini hanya membaca
  database (tanpa request ke penyedia). Jangan memakai `setInterval` di route
  Next.js/serverless.

## Batas mode data (M1)

- Hanya provider **DEMO** yang aktif. Tidak ada mode LIVE pada tahap ini — lihat
  `docs/data-sources.md` untuk status evidence sumber BEI dan syarat sebelum M3.
- Tidak ada login/watchlist/alert pribadi (M1 read-only, ditunda ke M2 sesuai
  `AGENTS.md`).
- Screener mengevaluasi filter preset secara live terhadap `metric_snapshots`
  terbaru di database; filter kustom bebas oleh pengguna belum tersedia di UI
  (AST dan evaluator sudah ada di `src/domain/filter-ast.ts`, tinggal disambung
  ke form UI pada iterasi berikut).

## Struktur

Lihat `docs/architecture.md`.

## Metodologi kalkulasi

Lihat `docs/methodology.md` dan halaman `/metodologi` di aplikasi.
