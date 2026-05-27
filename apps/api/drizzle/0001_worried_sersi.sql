CREATE SCHEMA "history";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "history"."location" (
	"time" timestamp with time zone NOT NULL,
	"device_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy_m" double precision,
	"altitude_m" double precision,
	"heading_deg" double precision,
	"speed_mps" double precision,
	"battery_pct" smallint,
	CONSTRAINT "location_device_id_time_pk" PRIMARY KEY("device_id","time")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "history"."location" ADD CONSTRAINT "location_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_org_time_idx" ON "history"."location" USING btree ("organization_id","time");
--> statement-breakpoint
-- Convert history.location to a TimescaleDB hypertable, partitioned by `time`
-- with 1-day chunks. Idempotent (if_not_exists => TRUE) so re-running this
-- migration against an existing dev DB is safe.
SELECT create_hypertable(
	'history.location',
	'time',
	chunk_time_interval => INTERVAL '1 day',
	if_not_exists => TRUE
);