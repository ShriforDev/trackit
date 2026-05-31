import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import type {
  GeofenceColorId,
  GeofenceShape,
} from "@trackit/shared/geofence"

import { organization, user } from "./schema"
import { device } from "./tenant-schema"

/**
 * Logical geofence — identity, ownership, current shape pointer, and the
 * two opt-in alert configuration fields. The actual polygon/circle data
 * lives in `geofence_shape_version`; this row's `currentShapeVersionId`
 * always points at the most recent revision.
 *
 * Soft-deleted via `deletedAt`. Events still reference the geofence row
 * after deletion, so we never hard-delete.
 */
export const geofence = pgTable(
  "geofence",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** From `GEOFENCE_COLORS` — validated at the API boundary. */
    color: text("color").$type<GeofenceColorId>().notNull(),
    /**
     * Pointer to the active revision in `geofence_shape_version`. Nullable
     * only during the brief window between INSERT geofence and INSERT
     * shape-version-row inside the create transaction; in steady state it
     * is always non-null.
     */
    currentShapeVersionId: text("current_shape_version_id"),
    /** Proximity buffer in metres around the shape; 0 disables `approach`. */
    proximityBufferM: integer("proximity_buffer_m").notNull().default(0),
    /** Dwell threshold in minutes; 0 disables `dwell`. */
    dwellThresholdMin: integer("dwell_threshold_min").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    /** Soft-delete — preserves event history. */
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("geofence_organization_id_idx").on(t.organizationId),
    index("geofence_organization_active_idx").on(
      t.organizationId,
      t.deletedAt
    ),
  ]
)

/**
 * Append-only shape revisions. Every shape edit inserts a new row and
 * updates the parent `geofence.current_shape_version_id`. Events store
 * the revision id they fired against so playback maps render the polygon
 * as it was at that moment (B3 history fidelity).
 */
export const geofenceShapeVersion = pgTable(
  "geofence_shape_version",
  {
    id: text("id").primaryKey(),
    geofenceId: text("geofence_id")
      .notNull()
      .references(() => geofence.id, { onDelete: "cascade" }),
    /** 1-based, monotonically increasing per geofence. */
    revision: integer("revision").notNull(),
    shape: jsonb("shape").$type<GeofenceShape>().notNull(),
    editedBy: text("edited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("geofence_shape_version_geofence_revision_uniq").on(
      t.geofenceId,
      t.revision
    ),
    index("geofence_shape_version_geofence_idx").on(t.geofenceId),
  ]
)

/**
 * Per-(device, geofence) "is this device inside / in proximity right now?"
 * row. Drives transition detection on every location fix and powers the
 * "currently inside" UI panels without scanning the events table.
 *
 * `dwellAlerted` resets to false on each new `enter`. The dwell sweep job
 * flips it true once it fires the dwell event, so a single stay generates
 * at most one dwell alert.
 */
export const deviceGeofenceState = pgTable(
  "device_geofence_state",
  {
    deviceId: text("device_id")
      .notNull()
      .references(() => device.id, { onDelete: "cascade" }),
    geofenceId: text("geofence_id")
      .notNull()
      .references(() => geofence.id, { onDelete: "cascade" }),
    /**
     * The shape version the state was last evaluated against. On shape
     * edit we re-evaluate every row and update this pointer.
     */
    shapeVersionId: text("shape_version_id")
      .notNull()
      .references(() => geofenceShapeVersion.id, { onDelete: "cascade" }),
    /** Currently inside the inner boundary (the shape itself). */
    isInside: boolean("is_inside").notNull().default(false),
    /**
     * Currently inside the buffered shape (shape + proximityBufferM) but
     * NOT inside the inner boundary. Always false when `isInside` is true.
     */
    isInProximity: boolean("is_in_proximity").notNull().default(false),
    /** Timestamp of the last `enter` (when isInside flipped true). */
    insideSince: timestamp("inside_since"),
    /** Timestamp of the last `approach` (when isInProximity flipped true). */
    proximitySince: timestamp("proximity_since"),
    /** Set true after the dwell event has fired for the current stay. */
    dwellAlerted: boolean("dwell_alerted").notNull().default(false),
    /** Where the device was on its most recent fix. Used by the dwell sweep. */
    lastFixLat: doublePrecision("last_fix_lat"),
    lastFixLon: doublePrecision("last_fix_lon"),
    lastFixTime: timestamp("last_fix_time"),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.deviceId, t.geofenceId] }),
    index("device_geofence_state_geofence_idx").on(t.geofenceId),
    // Drives the dwell sweep query.
    index("device_geofence_state_inside_idx").on(t.isInside, t.dwellAlerted),
  ]
)
