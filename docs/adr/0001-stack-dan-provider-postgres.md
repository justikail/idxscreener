# ADR 0001: Stack, driver PostgreSQL, dan pendekatan evaluasi filter

Status: Diterima — 2026-09-19

## Keputusan

- Stack: Next.js App Router + TypeScript strict + Drizzle ORM + PostgreSQL, sesuai
  mandat `AGENTS.md`/`CLAUDE.md`. Package manager: pnpm.
- Driver PostgreSQL: `postgres` (porsager/postgres) via `drizzle-orm/postgres-js`,
  runtime Node (bukan Edge) — kompatibel dengan koneksi TCP langsung tanpa driver
  HTTP tambahan, dan didukung baik oleh Drizzle.
- Chart harga: SVG inline custom (`src/components/PriceChart.tsx`), bukan library
  chart pihak ketiga, untuk M1. Alasan: kebutuhan M1 hanya garis harga penutupan
  sederhana; menambah dependency chart besar belum perlu. Jika kebutuhan indikator
  overlay/candlestick interaktif bertambah pada M2+, evaluasi ulang (mis. lightweight-charts
  dengan lisensi Apache-2.0).
- Evaluasi filter screener: dilakukan di application layer atas AST typed
  (`src/domain/filter-ast.ts`), bukan kompilasi ke klausa SQL dinamis. Lihat
  `docs/architecture.md` bagian "Kompilasi filter" untuk keterbatasan dan rencana.
- Auth: belum dipilih — ditunda ke M2 sesuai `AGENTS.md` §3 ("M1 boleh read-only
  tanpa login"). Keputusan library auth akan dicatat di ADR terpisah saat M2 dimulai.

## Alasan

Driver `postgres` dipilih dibanding `node-postgres` (`pg`) karena performa dan
API async/await native yang lebih baik untuk workload query banyak-kecil seperti
pada `src/server/db/queries.ts` (query per instrumen di dashboard). Trade-off:
kurang umum dipakai dibanding `pg`, tapi didukung resmi sebagai salah satu driver
utama Drizzle.
