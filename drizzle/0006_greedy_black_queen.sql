CREATE TABLE "insider_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"dedup_key" varchar(64) NOT NULL,
	"holder_name" varchar(256) NOT NULL,
	"tx_date" date NOT NULL,
	"action_type" varchar(32) NOT NULL,
	"nationality" varchar(32),
	"badges" text[],
	"previous_shares" numeric(24, 0),
	"previous_pct" numeric(12, 6),
	"current_shares" numeric(24, 0),
	"current_pct" numeric(12, 6),
	"change_shares" numeric(24, 0),
	"change_pct" numeric(12, 6),
	"price" numeric(18, 4),
	"broker_code" varchar(16),
	"raw" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insider_transactions_unique" UNIQUE("instrument_id","provider","dedup_key")
);
--> statement-breakpoint
ALTER TABLE "insider_transactions" ADD CONSTRAINT "insider_transactions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;