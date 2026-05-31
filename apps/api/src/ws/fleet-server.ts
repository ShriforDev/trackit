import type { Server, ServerWebSocket } from "bun"
import { and, eq, inArray } from "drizzle-orm"

import type { FleetPosition } from "@trackit/shared"
import type {
  GeofenceDTO,
  GeofenceEventDTO,
} from "@trackit/shared/geofence"

import { auth } from "../auth"
import { db } from "../db/client"
import { member } from "../db/schema"
import { device, deviceShare } from "../db/tenant-schema"
import { getFleetSnapshot } from "../tile38/fleet"

import { fleetBus, type FleetMessage } from "./fleet-bus"

/**
 * Per-connection state stashed on ws.data. Computed once at upgrade time
 * and read on every delta. Trades freshness (new devices created after
 * connect won't appear) for predictable hot-path performance: no DB hits
 * per delta.
 */
export interface FleetSocketData {
  userId: string
  organizationId: string
  isAdmin: boolean
  /** Empty for admins (they see everything). For members: own + shared device ids. */
  visibleIds: Set<string>
  /** Removes the bus listener on close(). Set by open(). */
  unsubscribe: (() => void) | null
}

/**
 * Validate the upgrade request and stash a session context on ws.data.
 *
 * The same auth model as the REST middleware: must have a Better Auth
 * session, an active organization, and a member row. Failures return a
 * normal HTTP response (401/400/403) — the upgrade never happens.
 */
export async function handleFleetUpgrade(
  req: Request,
  server: Server<FleetSocketData>
): Promise<Response | undefined> {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) {
    return new Response("unauthorized", { status: 401 })
  }

  const organizationId = session.session.activeOrganizationId
  if (!organizationId) {
    return new Response("no_active_organization", { status: 400 })
  }

  const [memberRow] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.userId, session.user.id),
        eq(member.organizationId, organizationId)
      )
    )
    .limit(1)
  if (!memberRow) {
    return new Response("not_a_member", { status: 403 })
  }

  const role = memberRow.role
  const isAdmin = role === "owner" || role === "admin"

  // Snapshot the visibility set at connect time. Acceptable for v1 — new
  // devices become visible after the next reconnect.
  let visibleIds = new Set<string>()
  if (!isAdmin) {
    const [owned, shared] = await Promise.all([
      db
        .select({ id: device.id })
        .from(device)
        .where(
          and(
            eq(device.organizationId, organizationId),
            eq(device.ownerUserId, session.user.id)
          )
        ),
      db
        .select({ deviceId: deviceShare.deviceId })
        .from(deviceShare)
        .where(eq(deviceShare.userId, session.user.id)),
    ])
    visibleIds = new Set([
      ...owned.map((o) => o.id),
      ...shared.map((s) => s.deviceId),
    ])
  }

  const data: FleetSocketData = {
    userId: session.user.id,
    organizationId,
    isAdmin,
    visibleIds,
    unsubscribe: null,
  }

  const ok = server.upgrade(req, { data })
  if (ok) return undefined

  return new Response("upgrade_failed", { status: 400 })
}

/**
 * Build the initial snapshot for a freshly-connected client. Mirrors the
 * /fleet REST endpoint's filtering exactly so the two transports never
 * disagree about what's visible.
 */
async function buildSnapshot(
  organizationId: string,
  isAdmin: boolean,
  visibleIds: Set<string>
): Promise<FleetPosition[]> {
  const positions = await getFleetSnapshot(organizationId)
  if (positions.length === 0) return []

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

  const result: FleetPosition[] = []
  for (const p of positions) {
    const d = deviceMap.get(p.deviceId)
    if (!d || d.archivedAt) continue
    if (!isAdmin && !visibleIds.has(p.deviceId)) continue

    result.push({
      deviceId: p.deviceId,
      deviceName: d.name,
      deviceColor: d.color,
      deviceKind: d.kind,
      ownerUserId: d.ownerUserId,
      lat: p.lat,
      lon: p.lon,
      accuracyM: p.fields.accuracyM,
      altitudeM: p.fields.altitudeM,
      headingDeg: p.fields.headingDeg,
      speedMps: p.fields.speedMps,
      batteryPct: p.fields.batteryPct,
      capturedAtUnix: p.fields.capturedAtUnix,
    })
  }
  return result
}

/**
 * Wire-format envelope. Snapshot is sent once on open; deltas + geofence
 * messages are sent whenever the bus fires. Clients can `JSON.parse(event.data)`
 * and switch on `type`.
 */
export type FleetServerMessage =
  | { type: "snapshot"; payload: FleetPosition[] }
  | { type: "delta"; payload: FleetPosition }
  | { type: "geofence:created"; geofence: GeofenceDTO }
  | { type: "geofence:updated"; geofence: GeofenceDTO }
  | { type: "geofence:shape_changed"; geofence: GeofenceDTO; revision: number }
  | { type: "geofence:deleted"; geofenceId: string }
  | { type: "geofence:event"; event: GeofenceEventDTO }
  | { type: "error"; message: string }

export const fleetWebSocketHandlers = {
  async open(ws: ServerWebSocket<FleetSocketData>) {
    const { organizationId, isAdmin, visibleIds } = ws.data

    // 1. Initial snapshot.
    try {
      const snapshot = await buildSnapshot(
        organizationId,
        isAdmin,
        visibleIds
      )
      ws.send(
        JSON.stringify({
          type: "snapshot",
          payload: snapshot,
        } satisfies FleetServerMessage)
      )
    } catch (err) {
      console.error(
        "[ws/fleet] snapshot send failed",
        err instanceof Error ? err.message : err
      )
      try {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "snapshot_failed",
          } satisfies FleetServerMessage)
        )
      } catch {
        /* socket already closed */
      }
    }

    // 2. Subscribe to the org channel for live deltas + geofence messages.
    const channel = fleetBus.channelFor(organizationId)
    const handler = (msg: FleetMessage) => {
      try {
        if (msg.type === "position") {
          const { type: _t, ...position } = msg
          if (!isAdmin && !visibleIds.has(position.deviceId)) return
          ws.send(
            JSON.stringify({
              type: "delta",
              payload: position,
            } satisfies FleetServerMessage)
          )
          return
        }
        // geofence:* messages are org-wide — every member of the org sees
        // them regardless of device visibility (per design decision).
        ws.send(JSON.stringify(msg satisfies FleetServerMessage))
      } catch {
        // Send after close — nothing to recover. close() handles cleanup.
      }
    }
    fleetBus.on(channel, handler)
    ws.data.unsubscribe = () => fleetBus.off(channel, handler)

    console.log(
      `[ws/fleet] open  user=${ws.data.userId.slice(0, 8)}  org=${organizationId.slice(0, 8)}  admin=${isAdmin}`
    )
  },

  message(_ws: ServerWebSocket<FleetSocketData>, _message: string | Buffer) {
    // One-way push for v1. Future: ping/pong heartbeat or client-driven
    // resync requests.
  },

  close(ws: ServerWebSocket<FleetSocketData>) {
    ws.data.unsubscribe?.()
    console.log(
      `[ws/fleet] close user=${ws.data.userId.slice(0, 8)}  org=${ws.data.organizationId.slice(0, 8)}`
    )
  },
}
