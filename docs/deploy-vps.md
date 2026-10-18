# Runbook Deploy VPS — untuk sesi Claude di server

Dokumen ini ditulis untuk **Claude Code yang berjalan di VPS**. Ikuti urutannya,
laporkan hasil setiap tahap dalam bahasa Indonesia, dan berhenti di titik yang
ditandai **⛔ TANYA PENGGUNA**.

Disusun 5 Oktober 2026 dari kondisi repository saat itu. Verifikasi ulang
terhadap repo yang ada di server sebelum menjalankan perintah, jangan
menganggap isi dokumen ini pasti masih sama.

---

## 0. Baca dulu

1. Baca `AGENTS.md` dan `CLAUDE.md` di root repo. Aturan di sana berlaku juga di
   VPS, terutama:
   - Key/secret hanya di environment server. **Jangan pernah** menampilkan,
     mencetak, atau menyalinnya ke chat, log, git, atau dokumen.
     Jangan meminta pengguna menempel secret ke chat; minta mereka mengisinya
     sendiri ke file di server (lihat §4).
   - Budget Arjum **tidak boleh melebihi kuota satu akun** (1.000/hari menurut
     penyedia). Pakai **satu** key. Jangan menjalankan job bila
     `ARJUM_DAILY_BUDGET` > kuota akun — laporkan ke pengguna.
   - Jangan `db:seed`, reset, truncate, atau DDL destruktif pada database.
     `db:migrate` hanya menjalankan migrasi aditif yang sudah ada.
   - Jangan membeli layanan atau mengubah DNS/domain tanpa persetujuan.
   - Kelola hanya proses/service yang kamu buat.
2. Baca `docs/progress.md` (bagian teratas), `docs/data-sources.md`, dan
   `docs/arjum-integration-status.md` untuk status terbaru.

## 1. Gambaran arsitektur

```
Internet ──HTTPS──► Caddy (443/80, sertifikat otomatis Let's Encrypt)
                      │  basic auth (opsional, disarankan untuk demo client)
                      ▼
               Next.js (127.0.0.1:3000)  ── baca ──►  Neon PostgreSQL (cloud)
                                                          ▲
               Worker (systemd, proses panjang) ── tulis ─┘
                 └─► Arjum API (1 key): pembaruan harian hari kerja ≥17.00 WIB,
                     backfill & daftar saham dengan sisa kuota
DuckDNS ◄── timer tiap 5 menit memperbarui IP publik VPS
```

- Web **tidak pernah** memanggil Arjum; hanya worker yang memanggil.
- Database tetap **Neon** (sudah berisi data real: 957 saham, ±285 ribu baris
  harian per 5 Okt 2026). VPS tidak menjalankan PostgreSQL sendiri.
- Worker memakai **systemd** (`Restart=always`) — menggantikan
  `scripts/worker-loop.sh`. Watchdog di worker keluar sendiri bila koneksi
  database menggantung; systemd menyalakannya lagi.
- Workflow `.github/workflows/data-jobs.yml` dan `vercel.json` dibuat untuk
  opsi Vercel. **Tidak dipakai di VPS** (lihat §11).

## 2. Data dari pengguna (⛔ TANYA PENGGUNA bila belum diketahui)

| Item | Contoh | Catatan |
|---|---|---|
| Subdomain DuckDNS | `namaku` → `namaku.duckdns.org` | sudah dibuat pengguna di duckdns.org |
| Token DuckDNS | (rahasia) | diisi pengguna sendiri ke file, bukan ke chat |
| OS VPS | Ubuntu 22.04/24.04 | perintah di bawah untuk Ubuntu/Debian |
| Cara kode sampai ke VPS | git (repo privat) atau salinan langsung | repo lokal **belum punya commit** per 5 Okt |
| Lokasi VPS | mis. Singapura | Neon ada di ap-southeast-1 (Singapura); lokasi jauh = halaman lambat |
| Perlu dikunci password? | ya/tidak | disarankan **ya**: izin menayangkan data penyedia ke pihak lain belum tertulis |

## 3. Persiapan server

Jalankan sebagai user dengan sudo. Laporkan versi yang terpasang.

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl ca-certificates ufw

# Zona waktu log (aplikasi menghitung WIB sendiri; ini hanya agar log mudah dibaca)
sudo timedatectl set-timezone Asia/Jakarta

# User khusus aplikasi (tanpa login shell interaktif dari luar)
sudo adduser --system --group --home /srv/ihsg --shell /bin/bash ihsg

# Node.js 22 LTS (package.json: engines node >=20)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
node -v

# pnpm versi yang ditetapkan repo (package.json: packageManager pnpm@12.4.2)
sudo corepack enable
sudo -u ihsg -H corepack prepare pnpm@12.4.2 --activate
sudo -u ihsg -H pnpm -v
```

Firewall — buka hanya SSH, HTTP, HTTPS. **Pastikan port SSH yang dipakai sesi
ini diizinkan sebelum `ufw enable`**, atau sesi akan terputus.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Port 3000 **tidak** dibuka; Next.js hanya mendengar di 127.0.0.1.

## 4. Kode dan konfigurasi

### 4.1 Kode

Pilih salah satu (⛔ TANYA PENGGUNA cara yang dipakai):

- **Git:** `sudo -u ihsg -H git clone <url-repo-privat> /srv/ihsg/app`
- **Salinan langsung** (tercepat; proyek ±2,3 MB tanpa `node_modules`/`.next`).
  Dijalankan **pengguna di laptop** (WSL), dari folder proyek:
  ```bash
  rsync -az --info=progress2 \
    --exclude node_modules --exclude .next --exclude .run --exclude .git \
    --exclude .env.local --exclude test/ --exclude '*.pptx' --exclude '*.pdf' \
    ./ USER@IP_VPS:~/ihsg-app/
  ```
  Lalu di VPS (sesi ini):
  ```bash
  sudo mkdir -p /srv/ihsg/app
  sudo rsync -a ~/ihsg-app/ /srv/ihsg/app/ && rm -rf ~/ihsg-app
  sudo chown -R ihsg:ihsg /srv/ihsg/app
  ```
  Kirim ulang perubahan berikutnya dengan perintah rsync yang sama (hanya
  berkas yang berubah yang dikirim), lalu ulangi langkah update di §10.

`.env.local` sengaja **tidak** ikut disalin — dibuat baru di server.

### 4.2 File environment

Buat `/srv/ihsg/app/.env.local` (dibaca Next.js dan semua script `tsx` lewat
`src/server/load-env.ts`). Siapkan kerangkanya, lalu **minta pengguna mengisi
nilai rahasianya sendiri** dengan editor (`sudo -u ihsg nano /srv/ihsg/app/.env.local`).

```bash
sudo -u ihsg tee /srv/ihsg/app/.env.local >/dev/null <<'EOF'
# Diisi PENGGUNA — jangan ditampilkan ke chat/log.
DATABASE_URL=""
AUTH_SECRET=""
DATA_MODE="live"
NEXT_PUBLIC_APP_URL="https://NAMA.duckdns.org"
# SATU key Arjum (jangan ARJUM_API_KEYS berisi banyak key)
ARJUM_API_KEY=""
# Tidak boleh melebihi kuota satu akun Arjum (1.000/hari). 990 cukup untuk ±957 saham.
ARJUM_DAILY_BUDGET="990"
# Kosong = worker lokal (panel admin menampilkan status worker)
SCHEDULER=""
EOF
sudo chmod 600 /srv/ihsg/app/.env.local
```

- `AUTH_SECRET`: pengguna bisa membuatnya di VPS dengan `openssl rand -base64 32`.
- `DATABASE_URL`: URL Neon yang sama dengan yang dipakai di laptop (pooler).
- Setelah pengguna selesai, **periksa tanpa menampilkan nilai**:
  ```bash
  sudo -u ihsg bash -c 'cd /srv/ihsg/app && for v in DATABASE_URL AUTH_SECRET ARJUM_API_KEY; do grep -q "^$v=\"..*\"" .env.local && echo "$v terisi" || echo "$v KOSONG"; done; grep -c "^ARJUM_API_KEYS=" .env.local; grep "^ARJUM_DAILY_BUDGET" .env.local'
  ```
  `ARJUM_API_KEYS` harus 0 baris. Bila `ARJUM_DAILY_BUDGET` > 1000 → ⛔ berhenti
  dan tanyakan pengguna (lihat §0).

### 4.3 Install, uji, build

```bash
cd /srv/ihsg/app
sudo -u ihsg -H pnpm install --frozen-lockfile
sudo -u ihsg -H pnpm typecheck
sudo -u ihsg -H pnpm lint
sudo -u ihsg -H pnpm test          # unit, tanpa jaringan; per 5 Okt: 115 lulus
sudo -u ihsg -H pnpm db:migrate    # aditif; database Neon sudah sampai migrasi 0004
sudo -u ihsg -H pnpm build
```

Jangan jalankan `pnpm test:integration` atau `pnpm test:e2e` terhadap database
produksi tanpa persetujuan: test integrasi membuat/menghapus data uji dan
`idempotency.test.ts` menjalankan seed demo.

Uji koneksi database dari VPS (latensi menentukan kecepatan halaman):

```bash
sudo -u ihsg tee /srv/ihsg/app/.dbcheck.ts >/dev/null <<'EOF'
import "@/server/load-env";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
const t = Date.now();
await sql`select 1`;
const t2 = Date.now();
const [r] = await sql`select count(distinct instrument_id)::int as saham, max(trading_date)::text as sesi from daily_bars where source = 'arjum'`;
console.log(`koneksi ${t2 - t} ms; query ${Date.now() - t2} ms;`, r);
await sql.end();
EOF
cd /srv/ihsg/app && sudo -u ihsg -H pnpm exec tsx .dbcheck.ts; sudo rm -f /srv/ihsg/app/.dbcheck.ts
```

## 5. Ganti password akun demo (wajib sebelum dibuka)

Password akun demo tertulis di `src/jobs/seed-users.ts`. Ganti semuanya; skrip
menampilkan password acak baru **sekali** — sampaikan ke pengguna, jangan
tulis ke file/dokumen.

```bash
cd /srv/ihsg/app
for e in admin@demo.local usera@demo.local userb@demo.local; do
  sudo -u ihsg -H pnpm users:set-password -- --email=$e
done
```

Database dipakai bersama laptop pengguna; password baru berlaku di keduanya.

## 6. Service systemd

### 6.1 Web

```bash
sudo tee /etc/systemd/system/ihsg-web.service >/dev/null <<'EOF'
[Unit]
Description=IHSG Screener - web (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
User=ihsg
Group=ihsg
WorkingDirectory=/srv/ihsg/app
Environment=NODE_ENV=production
ExecStart=/srv/ihsg/app/node_modules/.bin/next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

### 6.2 Worker

Satu-satunya pemanggil Arjum. Hanya boleh **satu** worker hidup di seluruh
dunia — lock `worker` di database menolak worker kedua. **Pastikan pengguna
sudah menghentikan worker di laptop** (`pkill -f scripts/worker-loop.sh` lalu
`pkill -f "src/jobs/worker.ts"`), kalau tidak, worker VPS akan ditolak terus.

```bash
sudo tee /etc/systemd/system/ihsg-worker.service >/dev/null <<'EOF'
[Unit]
Description=IHSG Screener - worker data (Arjum)
After=network-online.target
Wants=network-online.target

[Service]
User=ihsg
Group=ihsg
WorkingDirectory=/srv/ihsg/app
Environment=NODE_ENV=production
ExecStart=/srv/ihsg/app/node_modules/.bin/tsx src/jobs/worker.ts
# Watchdog worker keluar (kode 1) bila database menggantung → nyalakan lagi.
Restart=always
RestartSec=15
KillSignal=SIGTERM
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ihsg-web ihsg-worker
systemctl status ihsg-web ihsg-worker --no-pager
journalctl -u ihsg-worker -n 30 --no-pager
```

Log worker yang sehat: `Worker dimulai …` lalu `Menunggu: …`. Bila
`Worker lain sudah berjalan` berulang → worker lain (laptop) masih hidup, atau
lease lama belum habis (maks. 3 menit).

## 7. DuckDNS

Pengguna mengisi token sendiri:

```bash
sudo install -d -m 700 -o ihsg -g ihsg /srv/ihsg/duckdns
sudo -u ihsg tee /srv/ihsg/duckdns/env >/dev/null <<'EOF'
DUCKDNS_DOMAIN="NAMA"      # tanpa .duckdns.org
DUCKDNS_TOKEN=""           # diisi pengguna
EOF
sudo chmod 600 /srv/ihsg/duckdns/env
```

```bash
sudo tee /srv/ihsg/duckdns/update.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
. /srv/ihsg/duckdns/env
# ip kosong = DuckDNS memakai IP asal request. Token tidak pernah dicetak.
result=$(curl -fsS --max-time 20 "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=")
echo "$(date -Is) duckdns: ${result}"
[ "$result" = "OK" ]
EOF
sudo chmod 750 /srv/ihsg/duckdns/update.sh && sudo chown ihsg:ihsg /srv/ihsg/duckdns/update.sh

sudo tee /etc/systemd/system/duckdns.service >/dev/null <<'EOF'
[Unit]
Description=Perbarui IP DuckDNS
After=network-online.target
[Service]
Type=oneshot
User=ihsg
ExecStart=/srv/ihsg/duckdns/update.sh
EOF

sudo tee /etc/systemd/system/duckdns.timer >/dev/null <<'EOF'
[Unit]
Description=Perbarui IP DuckDNS tiap 5 menit
[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now duckdns.timer
sudo systemctl start duckdns.service && journalctl -u duckdns -n 5 --no-pager
```

Harus tercetak `duckdns: OK`. Lalu pastikan domain mengarah ke VPS:
`getent hosts NAMA.duckdns.org` dan `curl -s https://api.ipify.org` → IP sama.
Bila VPS ber-IP statis, timer tetap aman dibiarkan.

## 8. Caddy (reverse proxy + HTTPS otomatis)

```bash
sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy
```

Verifikasi langkah instalasi resmi di https://caddyserver.com/docs/install bila
perintah di atas gagal.

**Dengan kunci password (disarankan untuk demo client).** Pengguna memilih
nama/password client; buat hash di server:
`caddy hash-password` (masukkan password secara interaktif — jangan di argumen).

```bash
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
NAMA.duckdns.org {
	encode zstd gzip

	# Hapus blok basic_auth bila situs boleh terbuka untuk umum.
	basic_auth {
		client HASH_DARI_caddy_hash-password
	}

	reverse_proxy 127.0.0.1:3000
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
journalctl -u caddy -n 30 --no-pager
```

Caddy mengambil sertifikat Let's Encrypt otomatis lewat port 80/443 — pastikan
DuckDNS sudah mengarah ke VPS (§7) **sebelum** reload, dan port 80/443 terbuka
di firewall VPS **dan** di firewall penyedia cloud (security group), bila ada.

Basic auth Caddy berlapis di atas login aplikasi: client memasukkan password
Caddy dulu, lalu (bila perlu) login akun aplikasi.

## 9. Verifikasi akhir (laporkan hasil nyata)

```bash
curl -sS -o /dev/null -w "lokal %{http_code} %{time_total}s\n" http://127.0.0.1:3000/
curl -sS -o /dev/null -w "publik tanpa auth %{http_code}\n" https://NAMA.duckdns.org/      # 401 bila basic auth aktif
curl -sS -o /dev/null -u client:PASSWORD -w "publik %{http_code} %{time_total}s\n" https://NAMA.duckdns.org/
curl -sS -o /dev/null -u client:PASSWORD -w "saham %{http_code}\n" https://NAMA.duckdns.org/saham
systemctl is-active ihsg-web ihsg-worker caddy duckdns.timer
```

Lalu minta pengguna membuka `https://NAMA.duckdns.org/admin/jobs` (login admin
dengan password baru) dan memastikan:
- kartu **Worker: Berjalan**;
- **Cakupan data** ±957/957 saham, sesi terakhir = hari bursa terakhir;
- **Kuota penyedia hari ini** ≤ budget.

Pada hari kerja setelah 17.00 WIB, cek bukti run otomatis:
`journalctl -u ihsg-worker --since today | grep -E "Pembaruan terjadwal|\[success\]|\[waiting\]"`.

## 10. Operasional

| Kebutuhan | Perintah |
|---|---|
| Log web / worker | `journalctl -u ihsg-web -f` / `journalctl -u ihsg-worker -f` |
| Restart | `sudo systemctl restart ihsg-web ihsg-worker` |
| Hentikan worker (mis. kuota) | `sudo systemctl stop ihsg-worker` |
| Update kode | `cd /srv/ihsg/app && sudo -u ihsg git pull && sudo -u ihsg -H pnpm install --frozen-lockfile && sudo -u ihsg -H pnpm db:migrate && sudo -u ihsg -H pnpm build && sudo systemctl restart ihsg-web ihsg-worker` |
| Jalankan pembaruan manual | tombol **Jalankan pembaruan sekarang** di `/admin/jobs` (diproses worker ±1 menit) |
| Status kuota Arjum | panel admin; jangan menaikkan `ARJUM_DAILY_BUDGET` di atas kuota akun |
| Audit kapasitas (opsional, memakai kuota) | `pnpm audit:arjum` (dry-run) — mode live hanya atas permintaan pengguna |

Selama build (`pnpm build`), web yang sedang berjalan bisa gagal melayani
sebentar karena folder `.next` ditimpa — lakukan di luar jam demo.

Memori: build Next.js butuh RAM; bila VPS ≤1 GB dan build terhenti
(`Killed`), tambahkan swap 2 GB atau build di mesin lain lalu salin `.next`.

## 11. Yang tidak dipakai di VPS

- `vercel.json` — hanya untuk Vercel; tidak berpengaruh di VPS.
- `.github/workflows/data-jobs.yml` — bila repo di-push ke GitHub, workflow ini
  akan berjalan terjadwal **dan ikut memakai kuota Arjum** bila secret-nya
  diisi. Untuk VPS: jangan isi secret `ARJUM_API_KEY` di GitHub, atau hapus/
  nonaktifkan workflow (Actions → data-jobs → Disable workflow). Catatan: per
  5 Okt nilai cadangan budget di baris `ARJUM_DAILY_BUDGET` workflow tertulis
  `'5000'` — tidak relevan selama workflow tidak dipakai.
- `scripts/worker-loop.sh` / `pnpm worker:loop` — supervisor untuk laptop;
  di VPS digantikan systemd.

## 12. Laporan akhir sesi VPS

Tulis ringkasan ke `docs/progress.md` (bagian baru di atas) dan laporkan ke
pengguna:
- versi Node/pnpm/Caddy, lokasi VPS, latensi ke Neon (§4.3);
- status `systemctl is-active` keempat unit;
- hasil `curl` publik (kode HTTP, waktu respons) dan apakah basic auth aktif;
- jumlah saham berharga + sesi terakhir dari database;
- yang belum selesai/terverifikasi (mis. run terjadwal pertama baru terbukti
  setelah 17.00 WIB hari kerja berikutnya);
- jangan menyertakan secret, token, password, atau hash apa pun.
