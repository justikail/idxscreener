CREATE TYPE "public"."consolidation" AS ENUM('consolidated', 'separate');--> statement-breakpoint
CREATE TYPE "public"."instrument_status" AS ENUM('active', 'suspended', 'delisted');--> statement-breakpoint
CREATE TYPE "public"."metric_status" AS ENUM('ok', 'null_missing', 'not_applicable', 'stale', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."period_type" AS ENUM('instant', 'duration');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" uuid,
	"title" varchar(512) NOT NULL,
	"category" varchar(64) DEFAULT 'umum' NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"effective_at" timestamp with time zone,
	"source_url" varchar(512),
	"doc_hash" varchar(128) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source" varchar(64) DEFAULT 'demo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_bars" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" uuid NOT NULL,
	"trading_date" date NOT NULL,
	"market_scope" varchar(16) DEFAULT 'regular' NOT NULL,
	"open" numeric(18, 4),
	"high" numeric(18, 4),
	"low" numeric(18, 4),
	"close" numeric(18, 4),
	"volume" bigint,
	"value" numeric(24, 2),
	"frequency" integer,
	"is_adjusted" boolean DEFAULT false NOT NULL,
	"adjustment_method" varchar(32),
	"source" varchar(64) DEFAULT 'demo' NOT NULL,
	"batch_id" varchar(64) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_bars_unique_session" UNIQUE("instrument_id","trading_date","market_scope","is_adjusted")
);
--> statement-breakpoint
CREATE TABLE "data_quality_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingestion_run_id" integer,
	"instrument_id" uuid,
	"severity" varchar(16) NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_facts" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" uuid NOT NULL,
	"fiscal_year" integer NOT NULL,
	"fiscal_quarter" integer NOT NULL,
	"period_type" "period_type" NOT NULL,
	"is_ytd" boolean DEFAULT false NOT NULL,
	"consolidation" "consolidation" DEFAULT 'consolidated' NOT NULL,
	"currency" varchar(8) DEFAULT 'IDR' NOT NULL,
	"concept" varchar(64) NOT NULL,
	"value" numeric(24, 2),
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_doc_hash" varchar(128) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source" varchar(64) DEFAULT 'demo' NOT NULL,
	CONSTRAINT "financial_facts_unique_fact" UNIQUE("instrument_id","fiscal_year","fiscal_quarter","consolidation","concept","version")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar(64) NOT NULL,
	"capability" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"batch_id" varchar(64) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "instrument_status_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" uuid NOT NULL,
	"status" "instrument_status" NOT NULL,
	"effective_date" date NOT NULL,
	"reason" text,
	"source" varchar(64) DEFAULT 'demo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(16) NOT NULL,
	"name" varchar(256) NOT NULL,
	"sector_id" integer,
	"board" varchar(32) DEFAULT 'utama' NOT NULL,
	"is_bank" boolean DEFAULT false NOT NULL,
	"listing_date" date,
	"status" "instrument_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instruments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"metric" varchar(64) NOT NULL,
	"value" numeric(24, 6),
	"unit" varchar(32),
	"status" "metric_status" NOT NULL,
	"formula_version" varchar(16) NOT NULL,
	"input_batch_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_snapshots_unique" UNIQUE("instrument_id","as_of","metric","formula_version")
);
--> statement-breakpoint
CREATE TABLE "screening_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"instrument_id" uuid NOT NULL,
	"passed" boolean NOT NULL,
	"reasons" jsonb NOT NULL,
	"missing_fields" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"preset_code" varchar(64) NOT NULL,
	"as_of" date NOT NULL,
	"filter_version" varchar(16) NOT NULL,
	"input_batch_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	CONSTRAINT "sectors_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_bars" ADD CONSTRAINT "daily_bars_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_facts" ADD CONSTRAINT "financial_facts_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrument_status_events" ADD CONSTRAINT "instrument_status_events_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_run_id_screening_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."screening_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;