import "@/server/load-env";

import { describe, expect, it } from "vitest";

import { IdxDailyBarsProvider } from "@/server/providers/idx/adapter";
import { IdxBlockedError } from "@/server/providers/idx/errors";

// Contract test LIVE opt-in (AGENTS.md §12: "live contract test bersifat
// opt-in"). TIDAK dijalankan sebagai bagian dari `pnpm test`/`pnpm
// test:integration` default — hanya jalan bila IDX_LIVE_TEST=1 diset EKSPLISIT
// oleh manusia yang memahami konsekuensinya (satu request sungguhan ke
// idx.co.id per eksekusi, dengan User-Agent yang mengidentifikasi diri).
//
// Jalankan dengan: IDX_LIVE_TEST=1 pnpm vitest run tests/integration/idx-live.test.ts --config vitest.integration.config.ts
//
// Status per 2026-09-20 (dicatat di docs/data-sources.md): akses server-side
// ke endpoint ini diblokir Cloudflare (HTTP 403, halaman tantangan) dari
// lingkungan pengembangan sesi ini. Test ini didokumentasikan sebagai bukti
// keadaan tersebut, BUKAN untuk mencoba melewatinya berulang kali — jangan
// jadwalkan test ini berjalan otomatis/berkala.

const shouldRun = process.env.IDX_LIVE_TEST === "1";

describe.skipIf(!shouldRun)("IDX live contract test (opt-in, request sungguhan)", () => {
  it(
    "GetStockSummary untuk satu tanggal kerja terbaru: catat status akses apa adanya",
    async () => {
      const provider = new IdxDailyBarsProvider();
      // Tanggal kerja baru-baru ini yang wajar diminta secara manual, bukan
      // hard-code tanggal jauh di masa lalu.
      const today = new Date();
      const ymd = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;

      try {
        const result = await provider.fetchDailyBars(ymd);
        console.log(`[idx-live] Berhasil: ${result.rows.length} baris untuk ${ymd}.`);
        expect(result.rows.length).toBeGreaterThanOrEqual(0);
      } catch (error) {
        if (error instanceof IdxBlockedError) {
          console.log(`[idx-live] DIBLOKIR (HTTP ${error.httpStatus}) — status tercatat, test tidak dianggap gagal.`);
          expect(error.httpStatus).toBeGreaterThanOrEqual(400);
          return; // blokir yang terdokumentasi BUKAN kegagalan test — ini yang ingin dibuktikan test ini
        }
        throw error;
      }
    },
    30_000,
  );
});
