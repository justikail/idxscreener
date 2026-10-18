// Stub kosong untuk paket "server-only" saat dijalankan lewat Vitest (bukan
// Next.js). Implementasi asli paket ini SELALU throw kecuali bundler (webpack
// Next.js) menukarnya dengan file kosong untuk kondisi "react-server" — Vitest
// tidak melakukan penukaran itu, jadi modul manapun yang mengimpor
// "server-only" (mis. src/features/*/core.ts, src/server/db/client.ts) akan
// gagal dimuat di test tanpa alias ini. Di build Next.js sungguhan, guard asli
// tetap aktif seperti biasa — alias ini HANYA berlaku di konfigurasi Vitest.
export {};
