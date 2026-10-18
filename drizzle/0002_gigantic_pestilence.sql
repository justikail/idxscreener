CREATE TYPE "public"."data_mode" AS ENUM('demo', 'live');--> statement-breakpoint
CREATE TABLE "provider_raw_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar(64) NOT NULL,
	"capability" varchar(64) NOT NULL,
	"request_params" jsonb NOT NULL,
	"http_status" integer NOT NULL,
	"content_type" varchar(128),
	"row_count" integer,
	"raw_body" jsonb,
	"batch_id" varchar(64) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "data_mode" "data_mode" DEFAULT 'demo' NOT NULL;