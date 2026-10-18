# Arsitektur

Ringkasan implementasi M0/M1. Untuk keputusan produk/scope penuh, lihat `AGENTS.md`.

## Gaya arsitektur

Modular monolith Next.js App Router. Tidak ada microservices pada tahap ini.

```text
src/app/                 routes (dashboard, cari, saham/[code], screener, pengumuman, metodologi)
src/components/          UI reusable (client & server components)
src/lib/                 helper murni (format angka/tanggal)
src/domain/              kalkulasi murni: indikator, fundamental, filter AST, preset
src/server/db/           Drizzle client, schema, query layer (server-only)
src/server/providers/demo/ generator data demo sintetis deterministik
src/server/services/     orchestration (computeInstrumentSnapshots)
src/jobs/                entry point CLI: seed, run (hitung metrik+screening), worker
drizzle/                 migrasi SQL yang digenerate dari schema.ts
tests/                   unit (domain), integration (Postgres), e2e (Playwright)
docs/                    dokumen ini, data-sources, methodology, progress
```

## Alur data (M1)

1. `pnpm db:seed` — menulis instrumen, sektor, daily_bars, financial_facts,
   announcements sintetis (provider DEMO) dalam satu transaksi.
2. `pnpm jobs:run` — membaca daily_bars + financial_facts, menghitung indikator
   teknikal dan rasio fundamental murni (`src/domain/*`), menulis `metric_snapshots`
   (upsert per instrument+as_of+metric+formula_version), lalu menjalankan preset
   screener (`src/domain/presets.ts`) dan menyimpan `screening_runs`/`screening_results`.
3. Halaman Next.js (Server Components) membaca hasil dari database lewat
   `src/server/db/queries.ts` — tidak ada fetch provider per request/per pengguna.
4. Halaman `/screener` mengevaluasi ulang filter preset secara live terhadap
   `metric_snapshots` terbaru saat request (bukan hanya membaca cache
   `screening_results`), sehingga UI selalu konsisten dengan data terkini di DB
   tanpa perlu re-run job untuk setiap perubahan tampilan. `screening_results`
   tetap tersimpan sebagai jejak evaluasi bertimestamp untuk M4 (evaluasi sinyal).

## Kompilasi filter (catatan keterbatasan M1)

`src/domain/filter-ast.ts` mendefinisikan filter AST typed dengan allowlist field
dan operator, divalidasi dengan Zod. Untuk M1, evaluasi filter dilakukan di
application layer terhadap hasil query terparameterisasi (bukan interpolasi SQL
bebas dari pengguna) — bukan dikompilasi menjadi klausa `WHERE` SQL dinamis.
Ini cukup aman untuk ukuran dataset demo (20 instrumen), tapi tidak scalable
untuk universe BEI penuh (~900+ emiten). Kompilasi AST -> query builder
terparameterisasi adalah langkah lanjutan yang disarankan sebelum M3.

## Mode data

Provider DEMO (`src/server/providers/demo/`) adalah satu-satunya provider aktif
pada M1. Interface provider per capability (daily bars, fundamental, announcements)
belum diabstraksi secara formal (belum ada `src/server/providers/types.ts`) karena
baru satu implementasi — abstraksi akan ditambahkan saat adapter LIVE pertama
dibangun di M3, mengikuti kebutuhan nyata alih-alih spekulatif.

## Job/worker

`src/jobs/run.ts` idempotent (upsert berdasarkan unique constraint). `src/jobs/worker.ts`
adalah loop interval sederhana untuk pengembangan lokal M2 — BUKAN solusi
production-grade (tidak ada leader election, tidak ada retry/backoff, tidak listen
ke sinyal shutdown). Untuk produksi, ganti dengan process manager/scheduler eksternal
yang me-restart proses sesuai AGENTS.md §4.
