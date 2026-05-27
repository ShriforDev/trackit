import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import type { DeviceMetadata } from "@trackit/shared/devices"

import { organization, user } from "./schema"

/**
 * A registered tracker (phone today, hardware later). Every device belongs
 * to exactly one organization and one owner user. Members of the org may
 * see the device based on role + explicit shares (see `device_share`).
 */
export const device = pgTable(
  "device",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** "phone" | "iot" — validated at the API boundary, not in DB. */
    kind: text("kind").notNull(),
    /** Marker color id from `DEVICE_COLORS`. */
    color: text("color").notNull(),
    /** Free-form per-device context (UA, OS, screen, tz, ...). */
    metadata: jsonb("metadata")
      .$type<DeviceMetadata>()
      .notNull()
      .default({}),
    /** Soft-archive — non-null hides the device from the live map but keeps history. */
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("device_organization_id_idx").on(t.organizationId),
    index("device_owner_user_id_idx").on(t.ownerUserId),
  ]
)

/**
 * Explicit device-level share. Used when an org member needs visibility
 * into a specific device they don't own. Owners and admins see every
 * device in the org without needing a row here.
 */
export const deviceShare = pgTable(
  "device_share",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => device.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("device_share_device_user_uniq").on(t.deviceId, t.userId),
    index("device_share_user_id_idx").on(t.userId),
  ]
)
