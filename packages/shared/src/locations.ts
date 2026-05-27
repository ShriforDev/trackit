import { z } from "zod"

/**
 * Reasonable bounds. Latitudes/longitudes are unsigned-bounded, accuracy &
 * altitude get loose upper limits so a buggy GPS can't poison the DB.
 */
const latSchema = z.number().min(-90).max(90)
const lonSchema = z.number().min(-180).max(180)

/**
 * Body for POST /devices/:id/locations. `capturedAt` is optional — if
 * absent the server stamps now(). Everything else is optional and stored
 * as-reported.
 */
export const reportLocationInputSchema = z
  .object({
    lat: latSchema,
    lon: lonSchema,
    /** Horizontal accuracy in meters. */
    accuracy: z.number().min(0).max(100_000).optional(),
    /** Meters above mean sea level. */
    altitude: z.number().min(-1_000).max(20_000).optional(),
    /** Compass heading in degrees [0, 360). */
    heading: z.number().min(0).max(360).optional(),
    /** Ground speed in meters / second. */
    speed: z.number().min(0).max(1_000).optional(),
    /** Battery percentage [0, 100]. */
    battery: z.number().int().min(0).max(100).optional(),
    /** ISO timestamp; defaults to server now() if absent. */
    capturedAt: z.string().datetime().optional(),
  })
  .strict()

export type ReportLocationInput = z.infer<typeof reportLocationInputSchema>

/**
 * One position row returned from the live fleet snapshot. This is what
 * GET /fleet returns and what the Step 13 WebSocket will broadcast.
 *
 * The location-side fields come from Tile38; the device-side fields come
 * from Postgres so the UI can render a meaningful marker (name, color)
 * without a second round-trip.
 */
export interface FleetPosition {
  deviceId: string
  deviceName: string
  deviceColor: string
  deviceKind: string
  ownerUserId: string
  lat: number
  lon: number
  accuracyM?: number
  altitudeM?: number
  headingDeg?: number
  speedMps?: number
  batteryPct?: number
  /** Unix-seconds timestamp at which the device captured this fix. */
  capturedAtUnix?: number
}

/**
 * One historical row. POST /devices/:id/history returns this; future
 * playback APIs will too. Timestamps come back as ISO strings to avoid
 * Date-vs-string ambiguity over the wire.
 */
export interface LocationHistoryRow {
  deviceId: string
  organizationId: string
  time: string
  latitude: number
  longitude: number
  accuracyM: number | null
  altitudeM: number | null
  headingDeg: number | null
  speedMps: number | null
  batteryPct: number | null
}
