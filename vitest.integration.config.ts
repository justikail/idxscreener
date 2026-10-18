import path from "node:path";
import { defineConfig } from "vitest/config";

// Config terpisah untuk test integrasi: dipaksa BERURUTAN (bukan paralel per
// file, bukan concurrent per test) karena test ini memutasi database
// PostgreSQL bersama secara langsung (mis. `seedDemoData()` menghapus lalu
// menulis ulang seluruh data demo). Menjalankannya paralel menyebabkan race
// condition nyata: pelanggaran foreign key dan timeout (ditemukan saat
// verifikasi sesi ini) karena satu file menghapus baris yang sedang dibaca/
// ditulis file lain di database Neon yang sama.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 45_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/shims/server-only.js"),
    },
  },
});
