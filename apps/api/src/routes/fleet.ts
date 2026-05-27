import { and, eq, inArray } from "drizzle-orm"
import { Hono } from "hono"

import type { FleetPosition } from "@trackit/shared"

import { db } from "../db/client"
import { device, deviceShare } from "../db/tenant-schema"
import {
  isOrgAdmin,
  requireSession,
  type SessionContext,
} from "../middleware/session"
import { getFleetSnapshot } from "../tile38/fleet"

const fleet = new Hono<{ Variables: { session: SessionContext } }>()

fleet.use("*", requireSession)

/**
 * Live snapshot of the caller's organization. Returns one row per device
 * that's reported a position within the Tile38 TTL window, filtered to
 * what the caller is allowed to see.
 *
 * The response embeds device metadata (name, color, kind, owner) so the
 * UI can render markers without a second round-trip per device.
 */
fleet.get("/", async (c) => {
  const { userId, organizationId, role } = c.get("session")

  const positions = await getFleetSnapshot(organizationId)
  if (positions.length === 0) return c.json([])

  // Pull device metadata for every position id in one query, then
  // apply visibility filtering in memory.
  const deviceIds = positions.map((p) => p.deviceId)
  const deviceRows = await db
    .select()
    .from(device)
    .where(
      and(
        eq(device.organizationId, organizationId),
        inArray(device.id, deviceIds)
      )
    )

  const deviceMap = new Map(deviceRows.map((d) => [d.id, d]))

  // Build the visible-id set up front so the .map below stays simple.
  let visibleIds: Set<string>
  if (isOrgAdmin(role)) {
    visibleIds = new Set(deviceRows.map((d) => d.id))
  } else {
    const shared = await db
      .select({ deviceId: deviceShare.deviceId })
      .from(deviceShare)
      .where(eq(deviceShare.userId, userId))
    const sharedSet = new Set(shared.map((r) => r.deviceId))
    visibleIds = new Set(
      deviceRows
        .filter((d) => d.ownerUserId === userId || sharedSet.has(d.id))
        .map((d) => d.id)
    )
  }

  const result: FleetPosition[] = []
  for (const pos of positions) {
    const d = deviceMap.get(pos.deviceId)
    if (!d) continue // Tile38 has it, PG doesn't — orphan, skip.
    if (!visibleIds.has(pos.deviceId)) continue
    if (d.archivedAt !== null) continue // Don't surface archived devices

    result.push({
      deviceId: pos.deviceId,
      deviceName: d.name,
      deviceColor: d.color,
      deviceKind: d.kind,
      ownerUserId: d.ownerUserId,
      lat: pos.lat,
      lon: pos.lon,
      accuracyM: pos.fields.accuracyM,
      altitudeM: pos.fields.altitudeM,
      headingDeg: pos.fields.headingDeg,
      speedMps: pos.fields.speedMps,
      batteryPct: pos.fields.batteryPct,
      capturedAtUnix: pos.fields.capturedAtUnix,
    })
  }

  return c.json(result)
})

export { fleet as fleetRoutes }
