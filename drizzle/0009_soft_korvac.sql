ALTER TABLE "latest_quotes" ADD COLUMN "change" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "latest_quotes" ADD COLUMN "prev_close" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "latest_quotes" ADD COLUMN "vwap" numeric(18, 4);