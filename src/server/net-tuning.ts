import net from "node:net";

/**
 * Node mencoba setiap alamat hasil DNS (IPv6 lalu IPv4) dan secara default
 * hanya menunggu 250 ms per percobaan. Bila satu paket SYN hilang, koneksi
 * butuh ±1–2 detik (kirim ulang) — Node menyerah lebih dulu dengan
 * AggregateError ETIMEDOUT padahal koneksi sebenarnya akan berhasil.
 * Diukur 2026-10-05 ke Neon (ap-southeast-1): biasanya 50–140 ms, sesekali
 * 2.159 ms. Batas per percobaan dinaikkan agar paket hilang sesekali tidak
 * menjadi halaman error atau job gagal.
 */
const ATTEMPT_TIMEOUT_MS = 5000;

if (net.getDefaultAutoSelectFamilyAttemptTimeout() < ATTEMPT_TIMEOUT_MS) {
  net.setDefaultAutoSelectFamilyAttemptTimeout(ATTEMPT_TIMEOUT_MS);
}
