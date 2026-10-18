# IHSG Screener — Instruksi Claude Code

@AGENTS.md

AGENTS.md di root repository adalah sumber utama aturan proyek. Baca seluruh isinya sebelum merencanakan atau mengubah kode. Jika mekanisme import tidak aktif, buka AGENTS.md secara eksplisit. Kedua file harus ditempatkan bersama. Jangan membuat salinan aturan sumber data yang berbeda di file ini.

## Cara memulai sesi

1. Baca AGENTS.md, README, package.json, docs/progress.md dan instruksi lokal yang berlaku. Periksa git status, adapter/provider, schema Drizzle, jobs, authz, dan tests yang relevan.
2. Perlakukan laporan milestone sebelumnya sebagai konteks, lalu verifikasi keadaan repository. Jangan membangun ulang M0–M2 jika sudah ada.
3. Prioritas saat ini adalah validasi Arjum dan ingestion real kecil secara otomatis. Stack: Next.js, TypeScript, Drizzle, Neon, pnpm; chart: TradingView Lightweight Charts.
4. EODHD dikeluarkan. Yahoo dan Index Alpha opsional; jangan menambah integrasi tanpa kebutuhan konkret. Jangan membangun penggabungan kuota melalui banyak akun.
5. Jika key belum tersedia, selesaikan adapter, konfigurasi contoh, fixture disanitasi dan tests yang bisa dikerjakan; laporkan input lokal yang diperlukan untuk probe. Jangan meminta secret ditempel ke percakapan atau memakai key dari screenshot.
6. Setelah tersedia, lakukan probe hemat kuota sesuai AGENTS.md, ingestion kecil, job ulang idempotent dan pemeriksaan UI nyata. Jangan menyatakan sukses live berdasarkan mock.

## Disiplin pelaksanaan

- Lakukan perubahan bertahap dan pertahankan kode pengguna. Jangan mengganti framework atau major dependency tanpa alasan konkret.
- Jalankan perintah sesuai package.json. Kelola hanya proses server yang kamu mulai; jangan pkill global atau mematikan server lain.
- Gunakan subagent hanya bila pengguna atau instruksi repository mengizinkan; batasi scope dan hindari perubahan file yang bertabrakan.
- Jangan berhenti untuk meminta konfirmasi rutin atas pekerjaan reversible yang sudah termasuk tugas. Untuk operasi destruktif, biaya, deployment atau komunikasi eksternal, ikuti otorisasi pengguna.
- Update docs/progress.md dan docs/data-sources.md berdasarkan bukti. Jika keputusan sumber berubah, perbarui AGENTS.md sebagai sumber utama.
- Jawab dalam bahasa Indonesia, singkat dan konkret: hasil, verifikasi, batasan, langkah selanjutnya.
