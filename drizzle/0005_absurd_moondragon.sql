CREATE TABLE "broker_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"params_key" varchar(128) DEFAULT '' NOT NULL,
	"broker_count" integer NOT NULL,
	"coverage" varchar(16) NOT NULL,
	"coverage_note" text,
	"flow" varchar(64),
	"broker_net" boolean,
	"meta" jsonb,
	"batch_id" varchar(64) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broker_summaries_unique" UNIQUE("instrument_id","provider","start_date","end_date","params_key")
);
--> statement-breakpoint
CREATE TABLE "broker_summary_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"summary_id" integer NOT NULL,
	"broker_code" varchar(16) NOT NULL,
	"broker_name" varchar(256),
	"buy_value" numeric(28, 2),
	"buy_volume" numeric(24, 0),
	"buy_freq" integer,
	"sell_value" numeric(28, 2),
	"sell_volume" numeric(24, 0),
	"sell_freq" integer,
	"net_value" numeric(28, 2),
	"net_volume" numeric(24, 0),
	CONSTRAINT "broker_summary_rows_unique" UNIQUE("summary_id","broker_code")
);
--> statement-breakpoint
CREATE TABLE "dataset_fetch_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"dataset" varchar(64) NOT NULL,
	"code" varchar(16) NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_status" varchar(32),
	"last_error" text,
	"checkpoint" jsonb,
	CONSTRAINT "dataset_fetch_state_unique" UNIQUE("dataset","code")
);
--> statement-breakpoint
CREATE TABLE "dataset_schedules" (
	"dataset" varchar(64) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"scope" varchar(16) DEFAULT 'list' NOT NULL,
	"codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"interval_minutes" integer NOT NULL,
	"daily_budget" integer NOT NULL,
	"used_date" date,
	"used_today" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"report_type" varchar(32) NOT NULL,
	"period" varchar(16) NOT NULL,
	"fiscal_year" integer NOT NULL,
	"fiscal_quarter" integer NOT NULL,
	"label" varchar(64),
	"provider_fetched_at" varchar(32),
	"data" jsonb NOT NULL,
	"data_hash" varchar(64) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"batch_id" varchar(64) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_reports_unique" UNIQUE("instrument_id","provider","report_type","period","fiscal_year","fiscal_quarter","version")
);
--> statement-breakpoint
CREATE TABLE "latest_quotes" (
	"instrument_id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(64) NOT NULL,
	"last_price" numeric(18, 4),
	"freq" integer,
	"lot" numeric(24, 0),
	"value" numeric(28, 2),
	"source_date" date,
	"data_ts" varchar(64),
	"served_ts" varchar(64),
	"market_state" varchar(32),
	"market_label" varchar(128),
	"no_trade_today" boolean,
	"quote_age_ms" bigint,
	"is_fallback_close" boolean NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_cap_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"close" numeric(18, 4),
	"listed_shares" numeric(24, 0),
	"market_cap" numeric(28, 2),
	"turnover_ratio" numeric(18, 8),
	"source" varchar(64) NOT NULL,
	"batch_id" varchar(64) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_cap_snapshots_unique" UNIQUE("instrument_id","snapshot_date","source")
);
--> statement-breakpoint
CREATE TABLE "provider_derived_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"dataset" varchar(64) NOT NULL,
	"params_key" varchar(128) DEFAULT '' NOT NULL,
	"range_start" date,
	"range_end" date,
	"payload" jsonb NOT NULL,
	"batch_id" varchar(64) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_derived_snapshots_unique" UNIQUE("instrument_id","provider","dataset","params_key")
);
--> statement-breakpoint
CREATE TABLE "provider_health_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar(64) NOT NULL,
	"reachable" boolean NOT NULL,
	"http_status" integer,
	"duration_ms" integer,
	"status" varchar(64),
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_facts" DROP CONSTRAINT "financial_facts_unique_fact";--> statement-breakpoint
ALTER TABLE "financial_facts" ALTER COLUMN "published_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_bars" ADD COLUMN "foreign_buy" bigint;--> statement-breakpoint
ALTER TABLE "daily_bars" ADD COLUMN "foreign_sell" bigint;--> statement-breakpoint
ALTER TABLE "daily_bars" ADD COLUMN "foreign_net" bigint;--> statement-breakpoint
ALTER TABLE "financial_facts" ADD COLUMN "period_basis" varchar(16) DEFAULT 'quarter' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_facts" ADD COLUMN "unit" varchar(16);--> statement-breakpoint
ALTER TABLE "financial_facts" ADD COLUMN "raw_path" varchar(512);--> statement-breakpoint
ALTER TABLE "financial_facts" ADD COLUMN "provider_fetched_at" varchar(32);--> statement-breakpoint
ALTER TABLE "financial_facts" ADD COLUMN "fetched_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_facts" ADD COLUMN "validation" varchar(32);--> statement-breakpoint
ALTER TABLE "provider_quota_usage" ADD COLUMN "provider_limit" integer;--> statement-breakpoint
ALTER TABLE "provider_quota_usage" ADD COLUMN "provider_remaining" integer;--> statement-breakpoint
ALTER TABLE "provider_quota_usage" ADD COLUMN "provider_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "broker_summaries" ADD CONSTRAINT "broker_summaries_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_summary_rows" ADD CONSTRAINT "broker_summary_rows_summary_id_broker_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."broker_summaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_reports" ADD CONSTRAINT "financial_reports_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latest_quotes" ADD CONSTRAINT "latest_quotes_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_cap_snapshots" ADD CONSTRAINT "market_cap_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_derived_snapshots" ADD CONSTRAINT "provider_derived_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_facts" ADD CONSTRAINT "financial_facts_unique_fact_v2" UNIQUE("instrument_id","fiscal_year","fiscal_quarter","period_basis","consolidation","concept","source","version");