import { EventEmitter } from "node:events"

import type { FleetPosition } from "@trackit/shared"

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
 * Delta payload broadcast on every successful Tile38 SET. Carries the
 * fully-resolved FleetPosition shape (with name, color, kind, owner)
 * so subscribers can render directly without round-tripping back to
 * GET /fleet — newly-connected clients see consistent shapes whether
 * they receive the data via initial snapshot OR via a delta.
 */
export type FleetDelta = FleetPosition

/**
 * Broadcast a delta on the org's channel. Subscribers attach via
 * `fleetBus.on(fleetBus.channelFor(orgId), handler)` and detach on close.
 */
export function emitFleetDelta(
  organizationId: string,
  delta: FleetDelta
): void {
  fleetBus.emit(fleetBus.channelFor(organizationId), delta)
}
