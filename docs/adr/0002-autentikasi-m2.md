# ADR 0002: Autentikasi untuk M2

Status: Diterima — 2026-09-19

## Keputusan

- Library: **Auth.js (next-auth) v5** dengan `Credentials` provider dan strategi
  sesi **JWT** (bukan database session — lihat alasan di bawah).
- Hashing password: **bcryptjs** (implementasi bcrypt murni JavaScript, dipilih
  karena tidak butuh native addon/node-gyp yang bisa gagal build di lingkungan
  tanpa toolchain C). Tidak ada kriptografi/hash buatan sendiri.
- Tabel `users` dikelola langsung lewat Drizzle (bukan `@auth/drizzle-adapter`)
  karena strategi JWT + Credentials tidak membutuhkan adapter untuk penyimpanan
  sesi; adapter penuh (accounts/sessions/verificationTokens) baru relevan jika
  menambah OAuth provider di iterasi berikutnya.
- Role disimpan sebagai kolom `role` (`user` | `admin`) di tabel `users`,
  dipropagasi ke JWT lewat callback `jwt`/`session`, dibaca di server (page/
  server action) untuk otorisasi. Tidak ada role check di client saja.

## Alasan

- AGENTS.md §3 mewajibkan "library autentikasi terpelihara yang kompatibel
  dengan stack" dan melarang membangun kripto/session/auth protocol sendiri.
  Auth.js adalah library auth paling banyak dipakai untuk Next.js App Router,
  aktif dipelihara, menangani CSRF, signing/encryption cookie sesi, dan expiry
  tanpa kita menulis primitif keamanan sendiri.
- JWT (bukan database session) dipilih untuk M2 karena: (1) Credentials
  provider di Auth.js v5 secara desain tidak terhubung ke adapter database
  session tanpa konfigurasi tambahan yang signifikan; (2) skala pengguna M2
  kecil (demo), sehingga trade-off utama database-session (bisa revoke sesi
  individual dari server) belum krusial. Trade-off ini dicatat sebagai utang
  teknis: sebelum ada kebutuhan revoke-sesi-langsung atau login sosial, Auth.js
  perlu dipindah ke adapter penuh (`@auth/drizzle-adapter`) dengan strategi
  `database`.
- Registrasi pengguna (`/daftar`) adalah server action sederhana yang meng-hash
  password dengan bcryptjs sebelum insert — tidak ada endpoint publik yang
  menerima password plaintext yang disimpan.
