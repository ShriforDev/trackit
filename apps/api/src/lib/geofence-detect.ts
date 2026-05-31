import { and, eq, inArray } from "drizzle-orm"

import {
  GEOFENCE_EVENT_TYPE,
  type GeofenceEventDTO,
  type GeofenceEventTypeName,
} from "@trackit/shared/geofence"

import { db } from "../db/client"
import { deviceGeofenceState } from "../db/geofence-schema"
import { geofenceEvent } from "../db/history-schema"
import {
  getActiveGeofences,
  type CachedGeofence,
} from "./geofence-cache"
import { evaluatePoint, type Point } from "./geofence-geometry"

/**
 * Detection engine. Called from POST /devices/:id/locations after the
 * fix is durably written, and from the shape-edit endpoint when a new
 * revision lands. Pure side effects:
 *
 *   1. Determine state transitions per (device, geofence) pair
 *   2. Insert any enter / exit / approach events into history.geofence_event
 *   3. Upsert device_geofence_state to the new (is_inside, is_in_proximity)
 *   4. Return the list of events fired so the caller can broadcast them
 *      on the org's WS channel
 *
 * Dwell events are NOT fired here — the periodic dwell sweep job owns
 * those. This function only handles boundary-crossing events.
 */

export interface DetectionInput {
  organizationId: string
  deviceId: string
  point: Point
  /** Time of the fix. Used as the event timestamp. */
  capturedAt: Date
  /** Optional speed for the event payload. */
  speedMps?: number | null
}

export interface DetectionResult {
  events: GeofenceEventDTO[]
}

interface PrevState {
  geofenceId: string
  shapeVersionId: string
  isInside: boolean
  isInProximity: boolean
}

/**
 * Run the detection step for a single fix against every active geofence
 * in the device's organization. Idempotent for a given (fix, state)
 * input — running twice is a no-op because the second pass sees the
 * already-updated state.
 */
export async function detectGeofenceTransitions(
  input: DetectionInput
): Promise<DetectionResult> {
  const fences = await getActiveGeofences(input.organizationId)
  if (fences.length === 0) {
    return { events: [] }
  }

  const fenceById = new Map<string, CachedGeofence>(fences.map((g) => [g.id, g]))

  // Load prev state for ALL geofences in one query so we don't N+1.
  const stateRows = await db
    .select({
      geofenceId: deviceGeofenceState.geofenceId,
      shapeVersionId: deviceGeofenceState.shapeVersionId,
      isInside: deviceGeofenceState.isInside,
      isInProximity: deviceGeofenceState.isInProximity,
    })
    .from(deviceGeofenceState)
    .where(
      and(
        eq(deviceGeofenceState.deviceId, input.deviceId),
        inArray(
          deviceGeofenceState.geofenceId,
          fences.map((g) => g.id)
        )
      )
    )

  const prevByFence = new Map<string, PrevState>(
    stateRows.map((r) => [
      r.geofenceId,
      {
        geofenceId: r.geofenceId,
        shapeVersionId: r.shapeVersionId,
        isInside: r.isInside,
        isInProximity: r.isInProximity,
      },
    ])
  )

  const eventsToInsert: Array<{
    time: Date
    geofenceId: string
    shapeVersionId: string
    deviceId: string
    organizationId: string
    eventType: number
    latitude: number
    longitude: number
    speedMps: number | null
  }> = []

  // Upsert payload — one row per (device, geofence) regardless of whether
  // a transition fired (we still update lastFix timestamps for the dwell
  // sweep).
  const stateUpserts: Array<{
    geofenceId: string
    shapeVersionId: string
    isInside: boolean
    isInProximity: boolean
    insideSinceFlip: "set" | "clear" | "leave"
    proximitySinceFlip: "set" | "clear" | "leave"
    dwellResetTo: boolean | null
  }> = []

  const dtoEvents: GeofenceEventDTO[] = []

  for (const g of fences) {
    const evalResult = evaluatePoint(input.point, g.shape, g.proximityBufferM)
    const prev = prevByFence.get(g.id) ?? {
      geofenceId: g.id,
      shapeVersionId: g.shapeVersionId,
      isInside: false,
      isInProximity: false,
    }

    let transitionType: GeofenceEventTypeName | null = null

    // State machine:
    //   prev.outside → curr.inside           = enter (skipped buffer)
    //   prev.outside → curr.in_proximity     = approach
    //   prev.in_proximity → curr.inside      = enter
    //   prev.in_proximity → curr.outside     = (no event)
    //   prev.inside → curr.in_proximity      = exit
    //   prev.inside → curr.outside           = exit (skipped buffer)
    //   no change                            = (no event)
    if (!prev.isInside && evalResult.isInside) {
      transitionType = "enter"
    } else if (prev.isInside && !evalResult.isInside) {
      // Crossing out — fire exit regardless of whether we now sit in the
      // buffer or fully outside. We don't fire approach on the way out.
      transitionType = "exit"
    } else if (
      !prev.isInside &&
      !prev.isInProximity &&
      evalResult.isInBuffer
    ) {
      transitionType = "approach"
    }

    if (transitionType) {
      const code = GEOFENCE_EVENT_TYPE[transitionType]
      eventsToInsert.push({
        time: input.capturedAt,
        geofenceId: g.id,
        shapeVersionId: g.shapeVersionId,
        deviceId: input.deviceId,
        organizationId: input.organizationId,
        eventType: code,
        latitude: input.point.lat,
        longitude: input.point.lon,
        speedMps: input.speedMps ?? null,
      })
      dtoEvents.push({
        time: input.capturedAt.toISOString(),
        geofenceId: g.id,
        shapeVersionId: g.shapeVersionId,
        deviceId: input.deviceId,
        organizationId: input.organizationId,
        type: transitionType,
        latitude: input.point.lat,
        longitude: input.point.lon,
        speedMps: input.speedMps ?? null,
      })
    }

    stateUpserts.push({
      geofenceId: g.id,
      shapeVersionId: g.shapeVersionId,
      isInside: evalResult.isInside,
      isInProximity: evalResult.isInBuffer,
      insideSinceFlip:
        !prev.isInside && evalResult.isInside
          ? "set"
          : prev.isInside && !evalResult.isInside
          ? "clear"
          : "leave",
      proximitySinceFlip:
        !prev.isInProximity && evalResult.isInBuffer
          ? "set"
          : prev.isInProximity && !evalResult.isInBuffer
          ? "clear"
          : "leave",
      // Reset dwell-alerted on each new enter; clear on exit; no-op otherwise.
      dwellResetTo:
        !prev.isInside && evalResult.isInside
          ? false
          : prev.isInside && !evalResult.isInside
          ? false
          : null,
    })
  }

  // Persist events + state in one transaction. Events first so the FK from
  // history.geofence_event → geofence_shape_version is satisfied (the
  // version always exists; we never delete versions out from under events).
  await db.transaction(async (tx) => {
    if (eventsToInsert.length > 0) {
      await tx.insert(geofenceEvent).values(eventsToInsert)
    }
    for (const u of stateUpserts) {
      const fence = fenceById.get(u.geofenceId)
      if (!fence) continue

      // We can't cheaply express the conditional `since` updates in a single
      // ON CONFLICT clause without nested subqueries; doing it row-by-row
      // here keeps the SQL readable and the cost is bounded by org-fence
      // count which is ≤ a few hundred in practice.
      await tx
        .insert(deviceGeofenceState)
        .values({
          deviceId: input.deviceId,
          geofenceId: u.geofenceId,
          shapeVersionId: u.shapeVersionId,
          isInside: u.isInside,
          isInProximity: u.isInProximity,
          insideSince:
            u.insideSinceFlip === "set" ? input.capturedAt : null,
          proximitySince:
            u.proximitySinceFlip === "set" ? input.capturedAt : null,
          dwellAlerted: false,
          lastFixLat: input.point.lat,
          lastFixLon: input.point.lon,
          lastFixTime: input.capturedAt,
        })
        .onConflictDoUpdate({
          target: [
            deviceGeofenceState.deviceId,
            deviceGeofenceState.geofenceId,
          ],
          set: {
            shapeVersionId: u.shapeVersionId,
            isInside: u.isInside,
            isInProximity: u.isInProximity,
            // insideSince: set on rising edge, clear on falling edge,
            // unchanged otherwise. Express as a CASE-equivalent by passing
            // the raw value when flipping and `undefined` otherwise (Drizzle
            // skips the column).
            ...(u.insideSinceFlip === "set"
              ? { insideSince: input.capturedAt }
              : u.insideSinceFlip === "clear"
              ? { insideSince: null }
              : {}),
            ...(u.proximitySinceFlip === "set"
              ? { proximitySince: input.capturedAt }
              : u.proximitySinceFlip === "clear"
              ? { proximitySince: null }
              : {}),
            ...(u.dwellResetTo !== null
              ? { dwellAlerted: u.dwellResetTo }
              : {}),
            lastFixLat: input.point.lat,
            lastFixLon: input.point.lon,
            lastFixTime: input.capturedAt,
          },
        })
    }
  })

  return { events: dtoEvents }
}

/**
 * Insert a synthetic event without going through the detection state
 * machine — used by the dwell sweep and shape-edit re-evaluation when
 * we want to emit a specific event we've already determined.
 */
export async function insertGeofenceEvent(input: {
  time: Date
  geofenceId: string
  shapeVersionId: string
  deviceId: string
  organizationId: string
  type: GeofenceEventTypeName
  latitude: number
  longitude: number
  speedMps?: number | null
}): Promise<GeofenceEventDTO> {
  const code = GEOFENCE_EVENT_TYPE[input.type]
  await db.insert(geofenceEvent).values({
    time: input.time,
    geofenceId: input.geofenceId,
    shapeVersionId: input.shapeVersionId,
    deviceId: input.deviceId,
    organizationId: input.organizationId,
    eventType: code,
    latitude: input.latitude,
    longitude: input.longitude,
    speedMps: input.speedMps ?? null,
  })
  return {
    time: input.time.toISOString(),
    geofenceId: input.geofenceId,
    shapeVersionId: input.shapeVersionId,
    deviceId: input.deviceId,
    organizationId: input.organizationId,
    type: input.type,
    latitude: input.latitude,
    longitude: input.longitude,
    speedMps: input.speedMps ?? null,
  }
}
