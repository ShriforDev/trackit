import { z } from "zod"

/**
 * Geofence color palette. Distinct from `DEVICE_COLORS` — these are bolder
 * and slightly darker because they paint *areas*, not pinpoints. Six
 * choices so the palette is small enough to memorise but big enough to
 * differentiate ~6 zones at a glance.
 *
 * Hex values picked from Tailwind's 600-shade range so they read clearly
 * on both light and dark map tiles at 15 % fill opacity.
 */
export const GEOFENCE_COLORS = {
  citrine: "#f59e0b", // amber 500 — warm, "warning"
  jade: "#047857", // emerald 700 — distinct from device-live emerald 500
  sapphire: "#2563eb", // blue 600
  amethyst: "#9333ea", // purple 600
  carmine: "#dc2626", // red 600 — restricted zones
  graphite: "#52525b", // zinc 600 — neutral / generic
} as const satisfies Record<string, `#${string}`>

export type GeofenceColorId = keyof typeof GEOFENCE_COLORS

export const GEOFENCE_COLOR_IDS = Object.keys(GEOFENCE_COLORS) as GeofenceColorId[]

export function colorHexFor(id: GeofenceColorId): string {
  return GEOFENCE_COLORS[id]
}

// ---- Shape ----------------------------------------------------------------

/**
 * Shape format used in storage and over the wire. Discriminated by `kind`
 * so server / client can switch on a single field without GeoJSON-style
 * type strings.
 *
 * Polygon `coordinates` are an array of `[longitude, latitude]` pairs
 * (GeoJSON convention — easier to interop later). The polygon is implicitly
 * closed: do *not* duplicate the first vertex at the end.
 *
 * Circle `center` is `[longitude, latitude]`; `radiusM` is the radius in
 * metres. Circles are stored as a Point + radius rather than as an
 * approximated polygon so editing / re-rendering stays exact.
 */
export const polygonShapeSchema = z.object({
  kind: z.literal("polygon"),
  coordinates: z
    .array(z.tuple([z.number().gte(-180).lte(180), z.number().gte(-90).lte(90)]))
    .min(3, "polygon needs at least 3 vertices")
    .max(200, "polygon is limited to 200 vertices"),
})

export const circleShapeSchema = z.object({
  kind: z.literal("circle"),
  center: z.tuple([
    z.number().gte(-180).lte(180),
    z.number().gte(-90).lte(90),
  ]),
  radiusM: z
    .number()
    .gte(50, "circle radius must be at least 50 m")
    .lte(50_000, "circle radius cannot exceed 50 km"),
})

export const geofenceShapeSchema = z.discriminatedUnion("kind", [
  polygonShapeSchema,
  circleShapeSchema,
])

export type PolygonShape = z.infer<typeof polygonShapeSchema>
export type CircleShape = z.infer<typeof circleShapeSchema>
export type GeofenceShape = z.infer<typeof geofenceShapeSchema>

export function isPolygonShape(s: GeofenceShape): s is PolygonShape {
  return s.kind === "polygon"
}

export function isCircleShape(s: GeofenceShape): s is CircleShape {
  return s.kind === "circle"
}

// ---- Event types ----------------------------------------------------------

/**
 * Numeric event types used in the `history.geofence_event` hypertable.
 * Stable wire codes — never renumber. New events go on the end.
 *
 *   1  enter      — device crossed the inner boundary into the zone
 *   2  exit       — device crossed the inner boundary out of the zone
 *   3  approach   — device entered the proximity buffer from outside
 *                    (only fires when going outside → buffer; not on exit)
 *   4  dwell      — device has been continuously inside for ≥ threshold
 *                    (fires once per inside-stay)
 */
export const GEOFENCE_EVENT_TYPE = {
  enter: 1,
  exit: 2,
  approach: 3,
  dwell: 4,
} as const

export type GeofenceEventTypeName = keyof typeof GEOFENCE_EVENT_TYPE
export type GeofenceEventTypeCode =
  (typeof GEOFENCE_EVENT_TYPE)[GeofenceEventTypeName]

export const GEOFENCE_EVENT_TYPE_NAMES = Object.keys(
  GEOFENCE_EVENT_TYPE
) as GeofenceEventTypeName[]

export function eventTypeName(code: GeofenceEventTypeCode): GeofenceEventTypeName {
  switch (code) {
    case 1:
      return "enter"
    case 2:
      return "exit"
    case 3:
      return "approach"
    case 4:
      return "dwell"
  }
}

// ---- Create / update DTOs -------------------------------------------------

const NAME_MAX = 80

export const createGeofenceInputSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(NAME_MAX),
  color: z.enum(GEOFENCE_COLOR_IDS as [GeofenceColorId, ...GeofenceColorId[]]),
  shape: geofenceShapeSchema,
  /** Proximity buffer in metres around the shape; 0 disables `approach`. */
  proximityBufferM: z
    .number()
    .int()
    .gte(0)
    .lte(5_000)
    .default(0)
    .optional(),
  /** Dwell threshold in minutes; 0 disables `dwell`. */
  dwellThresholdMin: z
    .number()
    .int()
    .gte(0)
    .lte(24 * 60)
    .default(0)
    .optional(),
})
export type CreateGeofenceInput = z.infer<typeof createGeofenceInputSchema>

export const updateGeofenceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX),
    color: z.enum(
      GEOFENCE_COLOR_IDS as [GeofenceColorId, ...GeofenceColorId[]]
    ),
    proximityBufferM: z.number().int().gte(0).lte(5_000),
    dwellThresholdMin: z
      .number()
      .int()
      .gte(0)
      .lte(24 * 60),
  })
  .partial()
  .refine(
    (v) => Object.keys(v).length > 0,
    "provide at least one field to update"
  )
export type UpdateGeofenceInput = z.infer<typeof updateGeofenceInputSchema>

export const updateGeofenceShapeInputSchema = z.object({
  shape: geofenceShapeSchema,
})
export type UpdateGeofenceShapeInput = z.infer<typeof updateGeofenceShapeInputSchema>

// ---- Outbound DTOs --------------------------------------------------------

/**
 * The full geofence shape returned by GET /api/geofences/:id and embedded
 * in WS `geofence:created` / `geofence:updated` / `geofence:shape_changed`
 * messages. The frontend treats this as the source of truth.
 */
export interface GeofenceDTO {
  id: string
  organizationId: string
  name: string
  color: GeofenceColorId
  shape: GeofenceShape
  shapeVersionId: string
  shapeRevision: number
  proximityBufferM: number
  dwellThresholdMin: number
  createdBy: string
  createdAt: string // ISO
  updatedAt: string // ISO
  /** Number of devices currently inside the inner boundary, if computed. */
  insideCount?: number
}

export interface GeofenceEventDTO {
  time: string // ISO
  geofenceId: string
  shapeVersionId: string
  deviceId: string
  organizationId: string
  type: GeofenceEventTypeName
  latitude: number
  longitude: number
  speedMps: number | null
}
