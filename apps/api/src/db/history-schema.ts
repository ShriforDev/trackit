import {
  doublePrecision,
  index,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

import { device } from "./tenant-schema"

/**
 * Dedicated `history` schema for Timescale hypertables. Keeping these
 * separate from `public` makes it easy to spot what's append-only,
 * partitioned, and subject to retention policies.
 */
export const historySchema = pgSchema("history")

/**
 * High-cardinality append-only table — every device fix lands here. The
 * matching SQL migration converts this to a TimescaleDB hypertable
 * partitioned by `time`. See drizzle/0001_*_hypertable.sql.
 *
 * Notes:
 *   • PK is (device_id, time) — Timescale requires the partition column
 *     in any unique constraint.
 *   • organization_id is denormalized for fast per-org range scans without
 *     joining to `device` on every query.
 *   • All optional sensor fields are nullable; clients only report what
 *     they have.
 */
export const location = historySchema.table(
  "location",
  {
    time: timestamp("time", { withTimezone: true, mode: "date" }).notNull(),
    deviceId: text("device_id")
      .notNull()
      .references(() => device.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    accuracyM: doublePrecision("accuracy_m"),
    altitudeM: doublePrecision("altitude_m"),
    headingDeg: doublePrecision("heading_deg"),
    speedMps: doublePrecision("speed_mps"),
    batteryPct: smallint("battery_pct"),
  },
  (t) => [
    primaryKey({ columns: [t.deviceId, t.time] }),
    // Org-scoped time-window queries (the dominant access pattern for
    // playback views) hit this index.
    index("location_org_time_idx").on(t.organizationId, t.time),
  ]
)
