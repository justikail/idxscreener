# Hosting: Vercel (web) + GitHub Actions (job data) + Neon (database)

Diperiksa 5 Oktober 2026 dari dokumentasi resmi:
- Vercel Hobby: cron **sekali per hari** (±59 menit), fungsi **maks. 300 detik**,
  dan **hanya untuk penggunaan pribadi non-komersial** (fair use). Demo untuk
  client = penggunaan komersial → gunakan **Pro**. Keputusan biaya ada di Anda.
- GitHub Actions: repo publik gratis; repo privat GitHub Free **2.000 menit/bulan**.

Pembaruan harian semua saham butuh puluhan menit, jadi **tidak bisa** berjalan
sebagai fungsi Vercel. Arsitekturnya:

```
GitHub Actions (data-jobs.yml)  ──► Arjum API (1 key)
  pnpm jobs:tick, hari kerja 17.15–21.15 WIB tiap jam + akhir pekan 10.00 WIB
        │ tulis
        ▼
     Neon PostgreSQL  ◄── baca ── Vercel (Next.js, region sin1/Singapura)
```

Web di Vercel **tidak pernah** memanggil Arjum dan tidak menyimpan key Arjum.

## 0. Sebelum dibuka untuk orang lain

1. Ganti password akun demo (password lama tertulis di kode):
   ```
   pnpm users:set-password -- --email=admin@demo.local
   pnpm users:set-password -- --email=usera@demo.local
   pnpm users:set-password -- --email=userb@demo.local
   ```
2. Tentukan budget Arjum yang tidak melebihi kuota **satu akun** (lihat
   AGENTS.md §3/§7). Pakai **satu** key.
3. Izin menayangkan data penyedia ke pihak lain belum tertulis → aktifkan
   Deployment Protection (langkah 4) agar situs tidak terbuka untuk publik.

## 1. Repository GitHub (privat)

Repo lokal belum punya commit. Berkas yang tidak perlu ikut (presentasi
`.pptx/.pdf`, catatan riset `*-old.md`, laporan riset `.json`) sebaiknya
dikeluarkan dari commit. `.env.local`, `/test/`, dan `/.run/` sudah di-ignore.

```
git add -A && git commit -m "..."      # periksa daftar berkas lebih dulu
gh repo create <nama> --private --source . --push
```

## 2. GitHub Actions

Settings → Secrets and variables → Actions:

| Jenis | Nama | Isi |
|---|---|---|
| Secret | `DATABASE_URL` | URL Neon (pooler) |
| Secret | `ARJUM_API_KEY` | satu key Arjum |
| Variable | `ARJUM_DAILY_BUDGET` | mis. `990` |

Uji: tab Actions → **data-jobs** → *Run workflow*. Log harus diakhiri
`Siklus selesai: {...}`. Jadwal GitHub bisa tertunda; keputusan "sudah/belum
dijalankan hari ini" disimpan di database, jadi run ganda aman.

## 3. Vercel

Import repo di vercel.com → framework Next.js terdeteksi otomatis, region
dari `vercel.json` (sin1, dekat Neon ap-southeast-1).

Environment Variables (Production):

| Nama | Isi |
|---|---|
| `DATABASE_URL` | URL Neon (pooler) |
| `AUTH_SECRET` | acak panjang, mis. hasil `openssl rand -base64 32` |
| `DATA_MODE` | `live` |
| `SCHEDULER` | `github-actions` |

**Jangan** isi `ARJUM_*` di Vercel. Bila build gagal karena versi pnpm,
tambahkan `ENABLE_EXPERIMENTAL_COREPACK=1` (repo menetapkan
`packageManager: pnpm@12.4.2`).

## 4. Akses client tanpa membuka ke publik

Project → Settings → Deployment Protection: aktifkan **Vercel Authentication**
untuk Production, lalu bagikan **Shareable Link** ke client (tersedia di
Hobby). Password Protection adalah add-on berbayar di Pro.

## 5. Setelah aktif

- Hentikan worker lokal (`pnpm worker:loop`) agar hanya satu penjadwal yang
  memakai kuota. Bila keduanya sempat hidup bersamaan, lock ingest dan
  reservasi kuota di database mencegah tumpang tindih — tidak ada duplikasi.
- Pantau `/admin/jobs`: kartu **Penjadwal GitHub Actions**, cakupan data,
  kuota hari ini, riwayat run.
- Perkiraan pemakaian menit Actions (belum diukur): ±5 run × ±2 menit per hari
  kerja + satu run panjang pembaruan harian (puluhan menit). Ukur di tab
  Actions setelah seminggu.
