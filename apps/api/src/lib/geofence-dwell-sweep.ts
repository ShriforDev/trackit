import { and, eq, sql } from "drizzle-orm"

import {
  type GeofenceEventDTO,
} from "@trackit/shared/geofence"

import { db } from "../db/client"
import { deviceGeofenceState } from "../db/geofence-schema"
import { insertGeofenceEvent } from "./geofence-detect"
import { emitGeofenceMessage } from "../ws/fleet-bus"

/**
 * Periodic in-process sweep that fires `dwell` events for devices that
 * have been continuously inside a geofence for ≥ that geofence's
 * `dwellThresholdMin`. Fires once per inside-stay per (device, geofence)
 * pair — `dwellAlerted` flag prevents repeats; it's reset to false on
 * every new `enter` (handled by the detection engine).
 *
 * Runs every 60 s. Cheap query — selects only state rows where the
 * device is inside, dwell hasn't been alerted yet, and the parent
 * geofence has dwell enabled.
 */

let sweepTimer: ReturnType<typeof setInterval> | null = null

const SWEEP_INTERVAL_MS = 60_000

interface DwellCandidate {
  deviceId: string
  geofenceId: string
  shapeVersionId: string
  organizationId: string
  insideSince: Date
  thresholdMin: number
  lastFixLat: number | null
  lastFixLon: number | null
}

async function runOnce(): Promise<void> {
  const now = new Date()

  // Pull every (device, geofence) state row that's inside, not yet alerted,
  // for a geofence with dwell enabled. We compute the threshold cutoff
  // SQL-side so the candidate set is already narrow.
  const rows = (await db.execute(sql`
    SELECT
      s.device_id        AS "deviceId",
      s.geofence_id      AS "geofenceId",
      s.shape_version_id AS "shapeVersionId",
      g.organization_id  AS "organizationId",
      s.inside_since     AS "insideSince",
      g.dwell_threshold_min AS "thresholdMin",
      s.last_fix_lat     AS "lastFixLat",
      s.last_fix_lon     AS "lastFixLon"
    FROM device_geofence_state s
    JOIN geofence g ON g.id = s.geofence_id
    WHERE s.is_inside = true
      AND s.dwell_alerted = false
      AND g.dwell_threshold_min > 0
      AND s.inside_since IS NOT NULL
      AND s.inside_since <= ${now} - (g.dwell_threshold_min * INTERVAL '1 minute')
      AND g.deleted_at IS NULL
    LIMIT 500
  `)) as unknown as DwellCandidate[]

  if (rows.length === 0) return

  for (const row of rows) {
    if (row.lastFixLat == null || row.lastFixLon == null) continue
    try {
      const evt: GeofenceEventDTO = await insertGeofenceEvent({
        time: now,
        geofenceId: row.geofenceId,
        shapeVersionId: row.shapeVersionId,
        deviceId: row.deviceId,
        organizationId: row.organizationId,
        type: "dwell",
        latitude: row.lastFixLat,
        longitude: row.lastFixLon,
      })
      await db
        .update(deviceGeofenceState)
        .set({ dwellAlerted: true })
        .where(
          and(
            eq(deviceGeofenceState.deviceId, row.deviceId),
            eq(deviceGeofenceState.geofenceId, row.geofenceId)
          )
        )
      emitGeofenceMessage(row.organizationId, {
        type: "geofence:event",
        event: evt,
      })
    } catch (err) {
      console.error(
        "[geofence] dwell sweep failed for",
        row.deviceId,
        "/",
        row.geofenceId,
        err instanceof Error ? err.message : err
      )
    }
  }
}

/** Start the sweep loop. Idempotent — calling twice is a no-op. */
export function startDwellSweep(): void {
  if (sweepTimer) return
  // Fire once on boot (after a short delay so the API is fully ready),
  // then every SWEEP_INTERVAL_MS.
  setTimeout(() => {
    void runOnce()
  }, 5_000)
  sweepTimer = setInterval(() => {
    void runOnce()
  }, SWEEP_INTERVAL_MS)
}

/** Stop the sweep loop. Used by graceful shutdown + tests. */
export function stopDwellSweep(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer)
    sweepTimer = null
  }
}
