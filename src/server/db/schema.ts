import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Instrumen dan klasifikasi
// ---------------------------------------------------------------------------

export const sectors = pgTable("sectors", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
});

export const instrumentStatusEnum = pgEnum("instrument_status", [
  "active",
  "suspended",
  "delisted",
]);

// Pemisahan eksplisit demo/live di level instrumen (AGENTS.md §6, §M3):
// instrumen DEMO (kode fiktif seperti DEMA/VPAS) dan instrumen LIVE (kode BEI
// asli seperti BBCA, hasil ingest provider "idx") harus bisa dibedakan dan
// difilter secara query, bukan hanya "kebetulan" kode tidak bentrok.
export const dataModeEnum = pgEnum("data_mode", ["demo", "live"]);

export const instruments = pgTable("instruments", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 16 }).notNull().unique(), // contoh: BBCA
  name: varchar("name", { length: 256 }).notNull(),
  sectorId: integer("sector_id").references(() => sectors.id),
  board: varchar("board", { length: 32 }).notNull().default("utama"),
  isBank: boolean("is_bank").notNull().default(false),
  listingDate: date("listing_date"),
  status: instrumentStatusEnum("status").notNull().default("active"),
  dataMode: dataModeEnum("data_mode").notNull().default("demo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const instrumentStatusEvents = pgTable("instrument_status_events", {
  id: serial("id").primaryKey(),
  instrumentId: uuid("instrument_id")
    .notNull()
    .references(() => instruments.id),
  status: instrumentStatusEnum("status").notNull(),
  effectiveDate: date("effective_date").notNull(),
  reason: text("reason"),
  source: varchar("source", { length: 64 }).notNull().default("demo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Data harga harian (OHLCV)
// ---------------------------------------------------------------------------

export const dailyBars = pgTable(
  "daily_bars",
  {
    id: serial("id").primaryKey(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    tradingDate: date("trading_date").notNull(),
    marketScope: varchar("market_scope", { length: 16 }).notNull().default("regular"),
    open: numeric("open", { precision: 18, scale: 4 }),
    high: numeric("high", { precision: 18, scale: 4 }),
    low: numeric("low", { precision: 18, scale: 4 }),
    close: numeric("close", { precision: 18, scale: 4 }),
    volume: bigint("volume", { mode: "bigint" }),
    value: numeric("value", { precision: 24, scale: 2 }),
    frequency: integer("frequency"),
    // Arjum f_buy/f_sell/n_foreign: LEMBAR (diverifikasi: f_buy, f_sell <= volume
    // lembar pada setiap baris; bila lot, nilainya akan melampaui volume).
    // Volume asing, BUKAN nilai Rupiah. null = tidak tersedia (bukan nol).
    foreignBuy: bigint("foreign_buy", { mode: "bigint" }),
    foreignSell: bigint("foreign_sell", { mode: "bigint" }),
    foreignNet: bigint("foreign_net", { mode: "bigint" }),
    isAdjusted: boolean("is_adjusted").notNull().default(false),
    adjustmentMethod: varchar("adjustment_method", { length: 32 }),
    source: varchar("source", { length: 64 }).notNull().default("demo"),
    batchId: varchar("batch_id", { length: 64 }).notNull(),
    revision: integer("revision").notNull().default(1),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("daily_bars_unique_session").on(
      table.instrumentId,
      table.tradingDate,
      table.marketScope,
      table.isAdjusted,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Fundamental: fakta granular per konsep, bukan rasio jadi
// ---------------------------------------------------------------------------

export const periodTypeEnum = pgEnum("period_type", ["instant", "duration"]);
export const consolidationEnum = pgEnum("consolidation", ["consolidated", "separate"]);

export const financialFacts = pgTable(
  "financial_facts",
  {
    id: serial("id").primaryKey(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    fiscalYear: integer("fiscal_year").notNull(),
    fiscalQuarter: integer("fiscal_quarter").notNull(), // 1-4 (tahunan: 4 dengan period_basis "annual")
    periodType: periodTypeEnum("period_type").notNull(),
    // "quarter" = kuartal mandiri, "ytd" = kumulatif sejak awal tahun buku,
    // "annual" = satu tahun buku penuh, "instant" = posisi neraca akhir periode.
    periodBasis: varchar("period_basis", { length: 32 }).notNull().default("quarter"),
    isYtd: boolean("is_ytd").notNull().default(false),
    consolidation: consolidationEnum("consolidation").notNull().default("consolidated"),
    currency: varchar("currency", { length: 8 }).notNull().default("IDR"),
    concept: varchar("concept", { length: 64 }).notNull(),
    // contoh concept: revenue, net_income, total_equity, total_liabilities,
    // total_assets, eps_basic, eps_diluted, weighted_avg_shares
    value: numeric("value", { precision: 24, scale: 2 }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    // Waktu publikasi resmi laporan. null bila sumber tidak menyediakannya
    // (Arjum: hanya fetched_at penyedia, yang BUKAN waktu publikasi).
    publishedAt: timestamp("published_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    unit: varchar("unit", { length: 16 }), // IDR, IDR_per_share, shares
    rawPath: varchar("raw_path", { length: 512 }), // path field di respons penyedia
    providerFetchedAt: varchar("provider_fetched_at", { length: 32 }), // apa adanya, tanpa zona waktu
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    validation: varchar("validation", { length: 32 }), // ok | zero_as_missing | ...
    sourceDocHash: varchar("source_doc_hash", { length: 128 }).notNull(),
    version: integer("version").notNull().default(1),
    source: varchar("source", { length: 64 }).notNull().default("demo"),
  },
  (table) => [
    unique("financial_facts_unique_fact_v2").on(
      table.instrumentId,
      table.fiscalYear,
      table.fiscalQuarter,
      table.periodBasis,
      table.consolidation,
      table.concept,
      table.source,
      table.version,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Keterbukaan informasi
// ---------------------------------------------------------------------------

export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id),
  title: varchar("title", { length: 512 }).notNull(),
  category: varchar("category", { length: 64 }).notNull().default("umum"),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  sourceUrl: varchar("source_url", { length: 512 }),
  docHash: varchar("doc_hash", { length: 128 }).notNull(),
  version: integer("version").notNull().default(1),
  source: varchar("source", { length: 64 }).notNull().default("demo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Metrik terhitung dan hasil screening (bertimestamp, berversi)
// ---------------------------------------------------------------------------

export const metricStatusEnum = pgEnum("metric_status", [
  "ok",
  "null_missing",
  "not_applicable",
  "stale",
  "unavailable",
]);

export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: serial("id").primaryKey(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    asOf: date("as_of").notNull(),
    metric: varchar("metric", { length: 64 }).notNull(),
    value: numeric("value", { precision: 24, scale: 6 }),
    unit: varchar("unit", { length: 32 }),
    status: metricStatusEnum("status").notNull(),
    formulaVersion: varchar("formula_version", { length: 16 }).notNull(),
    inputBatchId: varchar("input_batch_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("metric_snapshots_unique").on(
      table.instrumentId,
      table.asOf,
      table.metric,
      table.formulaVersion,
    ),
  ],
);

export const screeningRuns = pgTable("screening_runs", {
  id: serial("id").primaryKey(),
  presetCode: varchar("preset_code", { length: 64 }).notNull(),
  asOf: date("as_of").notNull(),
  filterVersion: varchar("filter_version", { length: 16 }).notNull(),
  inputBatchId: varchar("input_batch_id", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const screeningResults = pgTable("screening_results", {
  id: serial("id").primaryKey(),
  runId: integer("run_id")
    .notNull()
    .references(() => screeningRuns.id),
  instrumentId: uuid("instrument_id")
    .notNull()
    .references(() => instruments.id),
  passed: boolean("passed").notNull(),
  reasons: jsonb("reasons").notNull(), // array of { field, operator, threshold, actual, met }
  missingFields: jsonb("missing_fields").notNull(), // array of field names unavailable
});

// ---------------------------------------------------------------------------
// Operasional / ingestion
// ---------------------------------------------------------------------------

export const ingestionRuns = pgTable("ingestion_runs", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 64 }).notNull(),
  capability: varchar("capability", { length: 64 }).notNull(),
  // running, success, failed, partial; pembaruan harian (capability
  // "daily_update") juga: requested, waiting, no_session — lihat
  // src/server/jobs/daily-schedule.ts.
  status: varchar("status", { length: 32 }).notNull(),
  batchId: varchar("batch_id", { length: 64 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
  /** Ringkasan hasil yang bisa dibaca admin (bukan error). */
  note: text("note"),
});

export const dataQualityIssues = pgTable("data_quality_issues", {
  id: serial("id").primaryKey(),
  ingestionRunId: integer("ingestion_run_id").references(() => ingestionRuns.id),
  instrumentId: uuid("instrument_id").references(() => instruments.id),
  severity: varchar("severity", { length: 16 }).notNull(), // info, warning, error
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// M2 — pengguna, personalisasi, dan operasi otomatis
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  // Hash bcrypt (library terpelihara, lihat docs/adr/0002-*.md) — TIDAK PERNAH
  // menyimpan password plaintext, tidak ada kriptografi buatan sendiri.
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("watchlist_items_unique").on(table.userId, table.instrumentId)],
);

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  instrumentId: uuid("instrument_id")
    .notNull()
    .references(() => instruments.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const savedScreens = pgTable("saved_screens", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  // FilterNode tervalidasi (lihat src/domain/filter-ast.ts) — divalidasi ulang
  // dengan filterNodeSchema + validateFilterNode setiap dipakai, tidak dipercaya
  // buta dari storage.
  filter: jsonb("filter").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alertOperatorEnum = pgEnum("alert_operator", ["gt", "gte", "lt", "lte"]);

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  instrumentId: uuid("instrument_id")
    .notNull()
    .references(() => instruments.id),
  metric: varchar("metric", { length: 64 }).notNull(),
  operator: alertOperatorEnum("operator").notNull(),
  threshold: numeric("threshold", { precision: 24, scale: 6 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  // Status kondisi TERAKHIR (false/true) — dipakai untuk mendeteksi transisi
  // false->true (AGENTS.md §9). Notifikasi hanya dibuat saat transisi, bukan
  // setiap kali kondisi true dievaluasi ulang.
  lastConditionMet: boolean("last_condition_met").notNull().default(false),
  lastEvaluatedAsOf: date("last_evaluated_as_of"),
  lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(60),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    alertId: integer("alert_id").references(() => alerts.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 256 }).notNull(),
    body: text("body").notNull(),
    // Kunci idempotency eksplisit (AGENTS.md §9): mis. `${alertId}:${asOf}`.
    // Unique constraint di bawah adalah backstop keras terhadap duplikasi
    // notifikasi identik dari ingest ulang/retry job, terlepas dari logic
    // aplikasi di src/jobs/evaluate-alerts.ts.
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("notifications_idempotency_unique").on(table.idempotencyKey)],
);

// ---------------------------------------------------------------------------
// M3 — provenance data mentah provider LIVE (audit trail)
// ---------------------------------------------------------------------------

/**
 * Snapshot respons mentah SATU request provider (mis. satu tanggal
 * GetStockSummary), disimpan terpisah dari daily_bars agar baris harga tidak
 * membengkak (AGENTS.md §7: "jangan membengkakkan setiap row harga"). Dipakai
 * untuk audit: jika normalisasi keliru, raw response asli tetap bisa
 * ditelusuri ulang per batchId tanpa perlu fetch ulang ke provider.
 */
export const providerRawSnapshots = pgTable("provider_raw_snapshots", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 64 }).notNull(), // "idx"
  capability: varchar("capability", { length: 64 }).notNull(), // "daily_bars"
  requestParams: jsonb("request_params").notNull(), // { date: "20260814" }
  httpStatus: integer("http_status").notNull(),
  contentType: varchar("content_type", { length: 128 }),
  rowCount: integer("row_count"), // null bila respons bukan array baris valid
  rawBody: jsonb("raw_body"), // null bila body bukan JSON (mis. halaman HTML Cloudflare)
  batchId: varchar("batch_id", { length: 64 }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Kuota provider dan lock job (AGENTS.md §7)
// ---------------------------------------------------------------------------

/**
 * Pemakaian kuota harian per provider. `quotaDate` adalah tanggal menurut zona
 * reset penyedia (Arjum: 00:00 WIB, sesuai teks UI Usage Analytics — lihat
 * docs/data-sources.md). Reservasi dilakukan atomik (UPDATE ... WHERE used + n
 * <= daily_limit) SEBELUM request dikirim, termasuk untuk retry.
 */
export const providerQuotaUsage = pgTable(
  "provider_quota_usage",
  {
    id: serial("id").primaryKey(),
    provider: varchar("provider", { length: 64 }).notNull(),
    quotaDate: date("quota_date").notNull(),
    used: integer("used").notNull().default(0),
    dailyLimit: integer("daily_limit").notNull(),
    // Header x-ratelimit-* respons terakhir hari itu (hitungan penyedia, per
    // key). Dipakai untuk rekonsiliasi: pemakaian di luar aplikasi (audit,
    // dashboard) tidak tercatat di `used`.
    providerLimit: integer("provider_limit"),
    providerRemaining: integer("provider_remaining"),
    providerObservedAt: timestamp("provider_observed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("provider_quota_usage_unique").on(table.provider, table.quotaDate)],
);

/**
 * Lock job berbasis lease. Dipakai sebagai pengganti advisory lock karena
 * koneksi Neon lewat PgBouncer transaction pooling tidak menjamin lock level
 * sesi bertahan antar statement.
 */
export const jobLocks = pgTable("job_locks", {
  name: varchar("name", { length: 128 }).primaryKey(),
  owner: varchar("owner", { length: 128 }).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }).notNull(),
  acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Integrasi Arjum lanjutan (dataset selain OHLCV)
// ---------------------------------------------------------------------------

/**
 * Laporan keuangan mentah per periode dari penyedia, utuh (semua field,
 * termasuk yang belum dipetakan ke `financial_facts`). Revisi: bila isi
 * berubah pada pengambilan ulang, baris baru dengan version + 1 disimpan;
 * versi lama tidak ditimpa.
 */
export const financialReports = pgTable(
  "financial_reports",
  {
    id: serial("id").primaryKey(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    provider: varchar("provider", { length: 64 }).notNull(),
    reportType: varchar("report_type", { length: 32 }).notNull(), // INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW_REPORT
    period: varchar("period", { length: 16 }).notNull(), // quarterly | annually
    fiscalYear: integer("fiscal_year").notNull(),
    fiscalQuarter: integer("fiscal_quarter").notNull(), // tahunan = 4
    label: varchar("label", { length: 64 }),
    providerFetchedAt: varchar("provider_fetched_at", { length: 32 }),
    data: jsonb("data").notNull(),
    dataHash: varchar("data_hash", { length: 64 }).notNull(),
    version: integer("version").notNull().default(1),
    batchId: varchar("batch_id", { length: 64 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("financial_reports_unique").on(
      table.instrumentId,
      table.provider,
      table.reportType,
      table.period,
      table.fiscalYear,
      table.fiscalQuarter,
      table.version,
    ),
  ],
);

/** Snapshot /api/market-cap per tanggal data penyedia (diambil bersama daftar saham, tanpa request tambahan). */
export const marketCapSnapshots = pgTable(
  "market_cap_snapshots",
  {
    id: serial("id").primaryKey(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    snapshotDate: date("snapshot_date").notNull(), // field "date" respons
    close: numeric("close", { precision: 18, scale: 4 }),
    listedShares: numeric("listed_shares", { precision: 24, scale: 0 }), // lembar
    marketCap: numeric("market_cap", { precision: 28, scale: 2 }), // Rupiah
    turnoverRatio: numeric("turnover_ratio", { precision: 18, scale: 8 }), // apa adanya dari penyedia; satuan belum diverifikasi
    source: varchar("source", { length: 64 }).notNull(),
    batchId: varchar("batch_id", { length: 64 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("market_cap_snapshots_unique").on(table.instrumentId, table.snapshotDate, table.source)],
);

/**
 * Ringkasan broker per saham untuk SATU rentang tanggal (agregat penyedia).
 * Rentang berbeda disimpan sebagai baris berbeda; tidak pernah dijumlahkan
 * antarbaris (rentang bisa tumpang tindih).
 */
export const brokerSummaries = pgTable(
  "broker_summaries",
  {
    id: serial("id").primaryKey(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    provider: varchar("provider", { length: 64 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    // Parameter permintaan yang memengaruhi isi (mis. broker_limit/all_data, pasar, investor).
    paramsKey: varchar("params_key", { length: 128 }).notNull().default(""),
    brokerCount: integer("broker_count").notNull(),
    // complete | partial | unknown — lihat src/server/ingestion/arjum-broker.ts
    coverage: varchar("coverage", { length: 16 }).notNull(),
    coverageNote: text("coverage_note"),
    flow: varchar("flow", { length: 64 }),
    brokerNet: boolean("broker_net"),
    meta: jsonb("meta"),
    batchId: varchar("batch_id", { length: 64 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("broker_summaries_unique").on(table.instrumentId, table.provider, table.startDate, table.endDate, table.paramsKey)],
);

export const brokerSummaryRows = pgTable(
  "broker_summary_rows",
  {
    id: serial("id").primaryKey(),
    summaryId: integer("summary_id")
      .notNull()
      .references(() => brokerSummaries.id, { onDelete: "cascade" }),
    brokerCode: varchar("broker_code", { length: 16 }).notNull(),
    brokerName: varchar("broker_name", { length: 256 }),
    buyValue: numeric("buy_value", { precision: 28, scale: 2 }),
    buyVolume: numeric("buy_volume", { precision: 24, scale: 0 }),
    buyFreq: integer("buy_freq"),
    sellValue: numeric("sell_value", { precision: 28, scale: 2 }),
    sellVolume: numeric("sell_volume", { precision: 24, scale: 0 }),
    sellFreq: integer("sell_freq"),
    netValue: numeric("net_value", { precision: 28, scale: 2 }),
    netVolume: numeric("net_volume", { precision: 24, scale: 0 }),
  },
  (table) => [unique("broker_summary_rows_unique").on(table.summaryId, table.brokerCode)],
);

/**
 * Harga terbaru dari /api/price — cache TERPISAH dari candle EOD. Satu baris
 * per instrumen (ditimpa). Tidak pernah dipakai membuat candle OHLCV.
 */
export const latestQuotes = pgTable("latest_quotes", {
  instrumentId: uuid("instrument_id")
    .primaryKey()
    .references(() => instruments.id),
  provider: varchar("provider", { length: 64 }).notNull(),
  lastPrice: numeric("last_price", { precision: 18, scale: 4 }),
  freq: integer("freq"),
  lot: numeric("lot", { precision: 24, scale: 0 }),
  value: numeric("value", { precision: 28, scale: 2 }),
  sourceDate: date("source_date"),
  dataTs: varchar("data_ts", { length: 64 }),
  servedTs: varchar("served_ts", { length: 64 }),
  marketState: varchar("market_state", { length: 32 }),
  marketLabel: varchar("market_label", { length: 128 }),
  noTradeToday: boolean("no_trade_today"),
  quoteAgeMs: bigint("quote_age_ms", { mode: "number" }),
  // true = penyedia mengembalikan penutupan sesi sebelumnya (tidak ada transaksi hari ini)
  isFallbackClose: boolean("is_fallback_close").notNull(),
  // Dari /api/price/list (null untuk /api/price lama): perubahan rupiah
  // penyedia, penutupan acuan (last − change), dan VWAP.
  change: numeric("change", { precision: 18, scale: 4 }),
  prevClose: numeric("prev_close", { precision: 18, scale: 4 }),
  vwap: numeric("vwap", { precision: 18, scale: 4 }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Hasil GET /api/health. 200 hanya berarti API dapat dihubungi, bukan dataset terbaru tersedia. */
export const providerHealthChecks = pgTable("provider_health_checks", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 64 }).notNull(),
  reachable: boolean("reachable").notNull(),
  httpStatus: integer("http_status"),
  durationMs: integer("duration_ms"),
  status: varchar("status", { length: 64 }), // field status/ok dari body, apa adanya
  error: text("error"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Jadwal per dataset tambahan (bukan OHLCV harian). Nonaktif secara bawaan;
 * admin mengaktifkan dan menentukan cakupan/anggaran. Kemajuan per kode di
 * `dataset_fetch_state` menjadi checkpoint: kode yang paling lama tidak
 * diambil dikerjakan lebih dulu, sehingga job yang terhenti karena kuota
 * melanjutkan dari sana.
 */
export const datasetSchedules = pgTable("dataset_schedules", {
  dataset: varchar("dataset", { length: 64 }).primaryKey(), // financials | broker_summary | insiders | price | health
  enabled: boolean("enabled").notNull().default(false),
  // "list" = hanya `codes`; "priced" = semua saham live berharga (urut nilai transaksi)
  scope: varchar("scope", { length: 16 }).notNull().default("list"),
  codes: text("codes").array().notNull().default(sql`'{}'::text[]`),
  priority: integer("priority").notNull().default(100), // kecil = lebih dulu
  intervalMinutes: integer("interval_minutes").notNull(),
  dailyBudget: integer("daily_budget").notNull(), // maksimum request per hari WIB untuk dataset ini
  usedDate: date("used_date"),
  usedToday: integer("used_today").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastNote: text("last_note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const datasetFetchState = pgTable(
  "dataset_fetch_state",
  {
    id: serial("id").primaryKey(),
    dataset: varchar("dataset", { length: 64 }).notNull(),
    code: varchar("code", { length: 16 }).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastStatus: varchar("last_status", { length: 32 }),
    lastError: text("last_error"),
    checkpoint: jsonb("checkpoint"), // mis. halaman insider terakhir
  },
  (table) => [unique("dataset_fetch_state_unique").on(table.dataset, table.code)],
);

/**
 * Hasil OLAHAN penyedia (bukan data mentah pasar), mis. /api/broker-accumulation
 * dan /api/seasonal. Disimpan utuh + ringkasan tervalidasi; UI wajib
 * melabelinya "dihitung penyedia" dan memisahkannya dari perhitungan lokal.
 */
export const providerDerivedSnapshots = pgTable(
  "provider_derived_snapshots",
  {
    id: serial("id").primaryKey(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    provider: varchar("provider", { length: 64 }).notNull(),
    dataset: varchar("dataset", { length: 64 }).notNull(), // broker_accumulation | seasonal
    paramsKey: varchar("params_key", { length: 128 }).notNull().default(""),
    rangeStart: date("range_start"),
    rangeEnd: date("range_end"),
    payload: jsonb("payload").notNull(),
    batchId: varchar("batch_id", { length: 64 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("provider_derived_snapshots_unique").on(table.instrumentId, table.provider, table.dataset, table.paramsKey)],
);

/**
 * Transaksi/perubahan kepemilikan insider (/api/insiders). Penyedia tidak
 * memberi ID → dedup memakai `dedup_key` = sha256(nama | tanggal | aksi |
 * kepemilikan sebelum | sesudah) — lihat src/server/ingestion/arjum-insiders.ts.
 * Aksi disimpan apa adanya dari sumber; tidak berarti transaksi pasar reguler.
 */
export const insiderTransactions = pgTable(
  "insider_transactions",
  {
    id: serial("id").primaryKey(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    provider: varchar("provider", { length: 64 }).notNull(),
    dedupKey: varchar("dedup_key", { length: 64 }).notNull(),
    holderName: varchar("holder_name", { length: 256 }).notNull(),
    txDate: date("tx_date").notNull(),
    actionType: varchar("action_type", { length: 32 }).notNull(),
    nationality: varchar("nationality", { length: 32 }),
    badges: text("badges").array(),
    previousShares: numeric("previous_shares", { precision: 24, scale: 0 }),
    previousPct: numeric("previous_pct", { precision: 12, scale: 6 }),
    currentShares: numeric("current_shares", { precision: 24, scale: 0 }),
    currentPct: numeric("current_pct", { precision: 12, scale: 6 }),
    changeShares: numeric("change_shares", { precision: 24, scale: 0 }),
    changePct: numeric("change_pct", { precision: 12, scale: 6 }),
    price: numeric("price", { precision: 18, scale: 4 }),
    brokerCode: varchar("broker_code", { length: 16 }),
    raw: jsonb("raw").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("insider_transactions_unique").on(table.instrumentId, table.provider, table.dedupKey)],
);

// ---------------------------------------------------------------------------
// Permintaan data oleh pengguna (antrean bersama)
// ---------------------------------------------------------------------------

/**
 * Satu baris = satu pekerjaan pengambilan (dataset × saham). Paling banyak SATU
 * baris aktif (queued/running) per dataset+kode: permintaan berikutnya
 * "ikut antre" lewat data_request_subscribers, sehingga data diambil sekali
 * dan dipakai semua pengguna. Lihat src/server/requests/core.ts.
 */
export const dataRequests = pgTable(
  "data_requests",
  {
    id: serial("id").primaryKey(),
    dataset: varchar("dataset", { length: 32 }).notNull(),
    code: varchar("code", { length: 16 }).notNull(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    /** queued | running | done | failed | cancelled */
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    /** user (tombol "Minta data") | follow ("Pantau lengkap", otomatis) */
    source: varchar("source", { length: 16 }).notNull().default("user"),
    /** Dinaikkan admin untuk mendahulukan. */
    priority: integer("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("data_requests_active_unique").on(table.dataset, table.code).where(sql`status in ('queued', 'running')`),
    index("data_requests_status_idx").on(table.status, table.createdAt),
  ],
);

/** Siapa saja yang menunggu sebuah permintaan. `charged` = memakai jatah harian pengguna. */
export const dataRequestSubscribers = pgTable(
  "data_request_subscribers",
  {
    requestId: integer("request_id")
      .notNull()
      .references(() => dataRequests.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    charged: boolean("charged").notNull().default(false),
    notify: boolean("notify").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.requestId, table.userId] }), index("data_request_subscribers_user_idx").on(table.userId, table.createdAt)],
);

/** "Pantau lengkap": saham yang data tambahannya dijaga tetap segar untuk pengguna ini. */
export const userStockFollows = pgTable(
  "user_stock_follows",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.instrumentId] })],
);

/** Pengaturan aplikasi sederhana (kunci → JSON), mis. aturan permintaan pengguna. */
export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
