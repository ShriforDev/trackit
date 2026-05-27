import { and, desc, eq, gte, inArray, lte, or } from "drizzle-orm"
import { Hono } from "hono"
import { nanoid } from "nanoid"

import {
  createDeviceInputSchema,
  reportLocationInputSchema,
} from "@trackit/shared"

import { db } from "../db/client"
import { location } from "../db/history-schema"
import { device, deviceShare } from "../db/tenant-schema"
import {
  isOrgAdmin,
  requireSession,
  type SessionContext,
} from "../middleware/session"
import {
  dropFleetDevice,
  setFleetLocation,
} from "../tile38/fleet"
import { emitFleetDelta } from "../ws/fleet-bus"

const devices = new Hono<{ Variables: { session: SessionContext } }>()

devices.use("*", requireSession)

/**
 * Register a new device. The owner is always the calling user; the org is
 * always their active organization. There is no path that lets you create
 * a device in a different org from the one your session is pinned to.
 */
devices.post("/", async (c) => {
  const json = await c.req.json().catch(() => null)
  const parsed = createDeviceInputSchema.safeParse(json)
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400
    )
  }

  const { userId, organizationId } = c.get("session")
  const { name, kind, color, metadata } = parsed.data

  const [row] = await db
    .insert(device)
    .values({
      id: nanoid(),
      organizationId,
      ownerUserId: userId,
      name,
      kind,
      color,
      metadata: metadata ?? {},
    })
    .returning()

  return c.json(row, 201)
})

/**
 * List devices visible to the caller in their active organization.
 *   - owner / admin: every non-archived device in the org
 *   - member: devices they own OR have an explicit share for
 *
 * Archived devices are excluded by default; pass ?includeArchived=true
 * (owners/admins only) to include them.
 */
devices.get("/", async (c) => {
  const { userId, organizationId, role } = c.get("session")
  const includeArchived =
    c.req.query("includeArchived") === "true" && isOrgAdmin(role)

  if (isOrgAdmin(role)) {
    const rows = await db
      .select()
      .from(device)
      .where(eq(device.organizationId, organizationId))
      .orderBy(desc(device.createdAt))

    return c.json(
      includeArchived ? rows : rows.filter((d) => d.archivedAt === null)
    )
  }

  // Member path: own + shared. We compute the shared device-id set in a
  // separate query rather than a join, because it keeps the WHERE simple
  // and the share count is small (1 row per share, always).
  const shareRows = await db
    .select({ deviceId: deviceShare.deviceId })
    .from(deviceShare)
    .where(eq(deviceShare.userId, userId))

  const sharedIds = shareRows.map((r) => r.deviceId)

  const rows = await db
    .select()
    .from(device)
    .where(
      and(
        eq(device.organizationId, organizationId),
        sharedIds.length > 0
          ? or(eq(device.ownerUserId, userId), inArray(device.id, sharedIds))
          : eq(device.ownerUserId, userId)
      )
    )
    .orderBy(desc(device.createdAt))

  return c.json(rows.filter((d) => d.archivedAt === null))
})

/** Single device — same visibility rules as the list. */
devices.get("/:id", async (c) => {
  const id = c.req.param("id")
  const { userId, organizationId, role } = c.get("session")

  const [row] = await db
    .select()
    .from(device)
    .where(and(eq(device.id, id), eq(device.organizationId, organizationId)))
    .limit(1)

  if (!row) return c.json({ error: "not_found" }, 404)

  if (!isOrgAdmin(role) && row.ownerUserId !== userId) {
    // Members can only see devices they own or that are shared with them.
    const [share] = await db
      .select({ id: deviceShare.id })
      .from(deviceShare)
      .where(
        and(eq(deviceShare.deviceId, id), eq(deviceShare.userId, userId))
      )
      .limit(1)

    if (!share) return c.json({ error: "forbidden" }, 403)
  }

  return c.json(row)
})

/**
 * Hard-delete a device. Owner OR org admin can do this. Cascades via FK
 * to `history.location` (drops every recorded fix) and `device_share`,
 * and drops the Tile38 entry so it disappears from the live map
 * immediately. No soft-archive equivalent yet — once you press delete,
 * it's gone.
 */
devices.delete("/:id", async (c) => {
  const id = c.req.param("id")
  const { userId, organizationId, role } = c.get("session")

  const [row] = await db
    .select()
    .from(device)
    .where(and(eq(device.id, id), eq(device.organizationId, organizationId)))
    .limit(1)
  if (!row) return c.json({ error: "not_found" }, 404)
  if (!isOrgAdmin(role) && row.ownerUserId !== userId) {
    return c.json({ error: "forbidden" }, 403)
  }

  // Order matters: drop history rows first (the FK cascade from device
  // INTO the Timescale hypertable is version-dependent and we want the
  // contract to be deterministic), then the device row, then Tile38.
  await db.delete(location).where(eq(location.deviceId, id))
  await db.delete(device).where(eq(device.id, id))
  // Tile38 cleanup is best-effort: if Tile38 is briefly down the row is
  // gone in PG already, and the entry will TTL out within 5 minutes.
  await dropFleetDevice(organizationId, id)

  return c.json({ ok: true })
})

/**
 * Report a location fix. Restricted to the device owner — admins and
 * members-with-share can read positions but only the device's owner can
 * post on its behalf. This mirrors the typical phone-as-tracker model:
 * the user signed in on the device IS the device.
 *
 * Writes happen in parallel: Postgres history (durable) + Tile38 (live).
 * If either side fails, the request fails — we'd rather a retry than a
 * silent half-write.
 */
devices.post("/:id/locations", async (c) => {
  const id = c.req.param("id")
  const json = await c.req.json().catch(() => null)
  const parsed = reportLocationInputSchema.safeParse(json)
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400
    )
  }

  const { userId, organizationId } = c.get("session")

  const [d] = await db
    .select()
    .from(device)
    .where(and(eq(device.id, id), eq(device.organizationId, organizationId)))
    .limit(1)
  if (!d) return c.json({ error: "not_found" }, 404)
  if (d.ownerUserId !== userId) {
    return c.json({ error: "forbidden", reason: "not_device_owner" }, 403)
  }
  if (d.archivedAt) {
    return c.json({ error: "device_archived" }, 410)
  }

  const {
    lat,
    lon,
    accuracy,
    altitude,
    heading,
    speed,
    battery,
    capturedAt,
  } = parsed.data

  const time = capturedAt ? new Date(capturedAt) : new Date()
  const capturedAtUnix = Math.floor(time.getTime() / 1000)

  await Promise.all([
    db.insert(location).values({
      time,
      deviceId: id,
      organizationId,
      latitude: lat,
      longitude: lon,
      accuracyM: accuracy ?? null,
      altitudeM: altitude ?? null,
      headingDeg: heading ?? null,
      speedMps: speed ?? null,
      batteryPct: battery ?? null,
    }),
    setFleetLocation({
      organizationId,
      deviceId: id,
      lat,
      lon,
      fields: {
        accuracyM: accuracy,
        altitudeM: altitude,
        headingDeg: heading,
        speedMps: speed,
        batteryPct: battery,
        capturedAtUnix,
      },
    }),
  ])

  // Broadcast to WS subscribers of this org. Carries the fully-resolved
  // FleetPosition so newly-connected clients and delta receivers see the
  // exact same shape.
  emitFleetDelta(organizationId, {
    deviceId: id,
    deviceName: d.name,
    deviceColor: d.color,
    deviceKind: d.kind,
    ownerUserId: d.ownerUserId,
    lat,
    lon,
    accuracyM: accuracy,
    altitudeM: altitude,
    headingDeg: heading,
    speedMps: speed,
    batteryPct: battery,
    capturedAtUnix,
  })

  return c.json({ ok: true, time: time.toISOString() }, 201)
})

/**
 * Historical track for a device. Defaults to the last 24h; both bounds
 * accept ISO timestamps via ?from=&to=. Limits to the most recent 5000
 * points so we never accidentally stream a year of data into the
 * response.
 */
devices.get("/:id/history", async (c) => {
  const id = c.req.param("id")
  const { userId, organizationId, role } = c.get("session")

  // Visibility — same rules as GET /:id
  const [d] = await db
    .select()
    .from(device)
    .where(and(eq(device.id, id), eq(device.organizationId, organizationId)))
    .limit(1)
  if (!d) return c.json({ error: "not_found" }, 404)

  if (!isOrgAdmin(role) && d.ownerUserId !== userId) {
    const [share] = await db
      .select({ id: deviceShare.id })
      .from(deviceShare)
      .where(
        and(eq(deviceShare.deviceId, id), eq(deviceShare.userId, userId))
      )
      .limit(1)
    if (!share) return c.json({ error: "forbidden" }, 403)
  }

  const fromParam = c.req.query("from")
  const toParam = c.req.query("to")
  const to = toParam ? new Date(toParam) : new Date()
  const from = fromParam
    ? new Date(fromParam)
    : new Date(Date.now() - 24 * 60 * 60 * 1000)

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return c.json({ error: "invalid_range" }, 400)
  }

  const rows = await db
    .select()
    .from(location)
    .where(
      and(
        eq(location.deviceId, id),
        gte(location.time, from),
        lte(location.time, to)
      )
    )
    .orderBy(desc(location.time))
    .limit(5000)

  return c.json(
    rows.map((r) => ({
      ...r,
      time: r.time instanceof Date ? r.time.toISOString() : r.time,
    }))
  )
})

// Re-exported as deviceRoutes for compatibility with existing index.ts mount.
export { devices as deviceRoutes }
export { dropFleetDevice }
