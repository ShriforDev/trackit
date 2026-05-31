import { EventEmitter } from "node:events"

import type { FleetPosition } from "@trackit/shared"
import type {
  GeofenceDTO,
  GeofenceEventDTO,
} from "@trackit/shared/geofence"

/**
 * Single in-process bus that fans out fleet position deltas to every WS
 * subscriber. Channels are keyed by org id (`org:{orgId}`) so the
 * subscriber list stays small even in a many-tenant deployment.
 *
 * For multi-instance scaling we'll swap this for Redis pubsub or Tile38's
 * own SETCHAN / SUBSCRIBE (one channel per org), but the in-process version
 * is plenty for dev and for a single-replica deployment.
 */
class FleetBus extends EventEmitter {
  channelFor(organizationId: string): string {
    return `org:${organizationId}`
  }
}

export const fleetBus = new FleetBus()

// Avoid the "MaxListenersExceeded" warning when many viewers subscribe
// to the same org channel — typical org may have dozens of dashboards.
fleetBus.setMaxListeners(0)

/**
 * Wire-format messages flowing on the org channel. Discriminated union
 * so the WS server can multiplex position deltas + geofence-related
 * notifications on the same socket without inventing a second channel.
 */
export type FleetMessage =
  | ({ type: "position" } & FleetPosition)
  | { type: "geofence:created"; geofence: GeofenceDTO }
  | { type: "geofence:updated"; geofence: GeofenceDTO }
  | { type: "geofence:shape_changed"; geofence: GeofenceDTO; revision: number }
  | { type: "geofence:deleted"; geofenceId: string }
  | { type: "geofence:event"; event: GeofenceEventDTO }

/** Legacy alias kept for callers that still emit raw FleetPosition. */
export type FleetDelta = FleetPosition

/**
 * Broadcast a position delta. Backwards-compatible — wraps the position
 * in `{type: "position", ...}` for the discriminated union.
 */
export function emitFleetDelta(
  organizationId: string,
  delta: FleetDelta
): void {
  const msg: FleetMessage = { type: "position", ...delta }
  fleetBus.emit(fleetBus.channelFor(organizationId), msg)
}

/** Broadcast a single geofence:* message on an org's channel. */
export function emitGeofenceMessage(
  organizationId: string,
  msg: Exclude<FleetMessage, { type: "position" }>
): void {
  fleetBus.emit(fleetBus.channelFor(organizationId), msg)
}
