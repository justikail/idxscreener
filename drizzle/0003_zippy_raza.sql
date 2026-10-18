CREATE TABLE "job_locks" (
	"name" varchar(128) PRIMARY KEY NOT NULL,
	"owner" varchar(128) NOT NULL,
	"locked_until" timestamp with time zone NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_quota_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar(64) NOT NULL,
	"quota_date" date NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"daily_limit" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_quota_usage_unique" UNIQUE("provider","quota_date")
);
