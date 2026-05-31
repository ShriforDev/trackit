import { and, desc, eq, gte, inArray, lte } from "drizzle-orm"
import { Hono } from "hono"

import {
  GEOFENCE_EVENT_TYPE,
  GEOFENCE_EVENT_TYPE_NAMES,
  eventTypeName,
  type GeofenceEventDTO,
  type GeofenceEventTypeName,
} from "@trackit/shared/geofence"

import { db } from "../db/client"
import {
  deviceGeofenceState,
  geofence,
} from "../db/geofence-schema"
import { geofenceEvent } from "../db/history-schema"
import { device } from "../db/tenant-schema"
import {
  requireSession,
  type SessionContext,
} from "../middleware/session"

/**
 * Read-only event feed for the active org. Geofence events are visible
 * to all members of the org (per design — "org-wide visibility"). Members
 * cannot create events directly; they only flow from the location-ingest
 * pipeline and shape-edit re-evaluations.
 */
const events = new Hono<{ Variables: { session: SessionContext } }>()

events.use("*", requireSession)

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

// ----- GET /api/events -----------------------------------------------------

events.get("/", async (c) => {
  const { organizationId } = c.get("session")
  const url = new URL(c.req.url)

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT))
  )
  const sinceParam = url.searchParams.get("since")
  const untilParam = url.searchParams.get("until")
  const since = sinceParam ? new Date(sinceParam) : null
  const until = untilParam ? new Date(untilParam) : null
  if (since && Number.isNaN(since.getTime())) {
    return c.json({ error: "invalid_since" }, 400)
  }
  if (until && Number.isNaN(until.getTime())) {
    return c.json({ error: "invalid_until" }, 400)
  }

  const geofenceIdsParam = url.searchParams.getAll("geofence")
  const deviceIdsParam = url.searchParams.getAll("device")
  const typeParams = url.searchParams.getAll("type")

  const typeCodes: number[] = []
  for (const t of typeParams) {
    if ((GEOFENCE_EVENT_TYPE_NAMES as string[]).includes(t)) {
      typeCodes.push(GEOFENCE_EVENT_TYPE[t as GeofenceEventTypeName])
    }
  }

  const conditions = [eq(geofenceEvent.organizationId, organizationId)]
  if (since) conditions.push(gte(geofenceEvent.time, since))
  if (until) conditions.push(lte(geofenceEvent.time, until))
  if (geofenceIdsParam.length > 0)
    conditions.push(inArray(geofenceEvent.geofenceId, geofenceIdsParam))
  if (deviceIdsParam.length > 0)
    conditions.push(inArray(geofenceEvent.deviceId, deviceIdsParam))
  if (typeCodes.length > 0)
    conditions.push(inArray(geofenceEvent.eventType, typeCodes))

  const rows = await db
    .select()
    .from(geofenceEvent)
    .where(and(...conditions))
    .orderBy(desc(geofenceEvent.time))
    .limit(limit)

  const dtos: GeofenceEventDTO[] = rows.map((r) => ({
    time: r.time.toISOString(),
    geofenceId: r.geofenceId,
    shapeVersionId: r.shapeVersionId,
    deviceId: r.deviceId,
    organizationId: r.organizationId,
    type: eventTypeName(r.eventType as 1 | 2 | 3 | 4),
    latitude: r.latitude,
    longitude: r.longitude,
    speedMps: r.speedMps,
  }))

  return c.json(dtos)
})

// ----- GET /api/events/active ---------------------------------------------

/**
 * Snapshot of every (device, geofence) pair currently marked is_inside.
 * Drives the "Live" tab on /geofences and the inside-now pills on the
 * geofence cards.
 */
events.get("/active", async (c) => {
  const { organizationId } = c.get("session")

  const rows = await db
    .select({
      deviceId: deviceGeofenceState.deviceId,
      geofenceId: deviceGeofenceState.geofenceId,
      insideSince: deviceGeofenceState.insideSince,
      lastFixLat: deviceGeofenceState.lastFixLat,
      lastFixLon: deviceGeofenceState.lastFixLon,
      lastFixTime: deviceGeofenceState.lastFixTime,
      deviceName: device.name,
      deviceColor: device.color,
      geofenceName: geofence.name,
      geofenceColor: geofence.color,
    })
    .from(deviceGeofenceState)
    .innerJoin(device, eq(device.id, deviceGeofenceState.deviceId))
    .innerJoin(geofence, eq(geofence.id, deviceGeofenceState.geofenceId))
    .where(
      and(
        eq(geofence.organizationId, organizationId),
        eq(deviceGeofenceState.isInside, true)
      )
    )
    .orderBy(desc(deviceGeofenceState.insideSince))

  return c.json(
    rows.map((r) => ({
      deviceId: r.deviceId,
      deviceName: r.deviceName,
      deviceColor: r.deviceColor,
      geofenceId: r.geofenceId,
      geofenceName: r.geofenceName,
      geofenceColor: r.geofenceColor,
      insideSince: r.insideSince ? r.insideSince.toISOString() : null,
      lastFix:
        r.lastFixLat != null && r.lastFixLon != null && r.lastFixTime
          ? {
              lat: r.lastFixLat,
              lon: r.lastFixLon,
              time: r.lastFixTime.toISOString(),
            }
          : null,
    }))
  )
})

export { events as eventRoutes }
