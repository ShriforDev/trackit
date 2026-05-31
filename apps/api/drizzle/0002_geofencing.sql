-- Geofencing v1 — schema for polygons + circles, versioned shapes,
-- per-(device, geofence) state, and a Timescale hypertable for events.
--
-- Idempotent: `IF NOT EXISTS` everywhere + `if_not_exists => TRUE` on
-- create_hypertable so re-running this migration against a partially
-- migrated DB is safe.

-- ----------------------------------------------------------------------
-- 1. geofence (logical row, points at the current shape revision)
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "geofence" (
  "id"                         text PRIMARY KEY,
  "organization_id"            text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "name"                       text NOT NULL,
  "color"                      text NOT NULL,
  "current_shape_version_id"   text,
  "proximity_buffer_m"         integer NOT NULL DEFAULT 0,
  "dwell_threshold_min"        integer NOT NULL DEFAULT 0,
  "created_by"                 text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at"                 timestamp NOT NULL DEFAULT now(),
  "updated_at"                 timestamp NOT NULL DEFAULT now(),
  "deleted_at"                 timestamp
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "geofence_organization_id_idx"
  ON "geofence" ("organization_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "geofence_organization_active_idx"
  ON "geofence" ("organization_id", "deleted_at");
--> statement-breakpoint

-- ----------------------------------------------------------------------
-- 2. geofence_shape_version (append-only revisions of a polygon/circle)
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "geofence_shape_version" (
  "id"             text PRIMARY KEY,
  "geofence_id"    text NOT NULL REFERENCES "geofence"("id") ON DELETE CASCADE,
  "revision"       integer NOT NULL,
  "shape"          jsonb NOT NULL,
  "edited_by"      text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at"     timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "geofence_shape_version_geofence_revision_uniq"
  ON "geofence_shape_version" ("geofence_id", "revision");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "geofence_shape_version_geofence_idx"
  ON "geofence_shape_version" ("geofence_id");
--> statement-breakpoint

-- Now that the version table exists, attach the deferred FK from
-- geofence.current_shape_version_id back to geofence_shape_version.
DO $$ BEGIN
  ALTER TABLE "geofence"
    ADD CONSTRAINT "geofence_current_shape_version_fk"
    FOREIGN KEY ("current_shape_version_id")
    REFERENCES "geofence_shape_version"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ----------------------------------------------------------------------
-- 3. device_geofence_state (per-pair "is this device inside?" with
--    proximity + dwell tracking)
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "device_geofence_state" (
  "device_id"          text NOT NULL REFERENCES "device"("id") ON DELETE CASCADE,
  "geofence_id"        text NOT NULL REFERENCES "geofence"("id") ON DELETE CASCADE,
  "shape_version_id"   text NOT NULL REFERENCES "geofence_shape_version"("id") ON DELETE CASCADE,
  "is_inside"          boolean NOT NULL DEFAULT false,
  "is_in_proximity"    boolean NOT NULL DEFAULT false,
  "inside_since"       timestamp,
  "proximity_since"    timestamp,
  "dwell_alerted"      boolean NOT NULL DEFAULT false,
  "last_fix_lat"       double precision,
  "last_fix_lon"       double precision,
  "last_fix_time"      timestamp,
  "updated_at"         timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("device_id", "geofence_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "device_geofence_state_geofence_idx"
  ON "device_geofence_state" ("geofence_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "device_geofence_state_inside_idx"
  ON "device_geofence_state" ("is_inside", "dwell_alerted");
--> statement-breakpoint

-- ----------------------------------------------------------------------
-- 4. history.geofence_event (Timescale hypertable, partitioned by time)
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "history"."geofence_event" (
  "time"               timestamp with time zone NOT NULL,
  "geofence_id"        text NOT NULL REFERENCES "geofence"("id") ON DELETE CASCADE,
  "shape_version_id"   text NOT NULL REFERENCES "geofence_shape_version"("id") ON DELETE CASCADE,
  "device_id"          text NOT NULL REFERENCES "device"("id") ON DELETE CASCADE,
  "organization_id"    text NOT NULL,
  "event_type"         smallint NOT NULL,
  "latitude"           double precision NOT NULL,
  "longitude"          double precision NOT NULL,
  "speed_mps"          double precision,
  CONSTRAINT "geofence_event_pk" PRIMARY KEY ("geofence_id", "device_id", "time")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "geofence_event_org_time_idx"
  ON "history"."geofence_event" ("organization_id", "time" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "geofence_event_device_time_idx"
  ON "history"."geofence_event" ("device_id", "time" DESC);
--> statement-breakpoint

-- Convert to a hypertable with the same 1-day chunks as history.location.
SELECT create_hypertable(
  'history.geofence_event',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists       => TRUE
);
