import type {
  CircleShape,
  GeofenceShape,
  PolygonShape,
} from "@trackit/shared/geofence"

/**
 * Geometry engine — pure functions, no deps.
 *
 * All public-facing inputs are `{lat, lon}` (the application convention).
 * Internal polygon storage uses GeoJSON `[lon, lat]` order (the shared-type
 * convention). The two are translated at the boundary of each function so
 * callers never have to think about it.
 *
 * Earth model: spherical (6 371 km). Sufficient for city-scale geofences
 * — millimetre-level accuracy isn't relevant when GPS is ±5–20 m.
 */

const EARTH_RADIUS_M = 6_371_000
const DEG_TO_RAD = Math.PI / 180

export interface Point {
  lat: number
  lon: number
}

export interface PointEvaluation {
  /** Inside the inner shape boundary. */
  isInside: boolean
  /**
   * Inside the buffered shape (shape + bufferM) but NOT inside the inner
   * boundary. Mutually exclusive with `isInside`.
   */
  isInBuffer: boolean
}

/**
 * Great-circle distance in metres between two lat/lon points using the
 * haversine formula. Accurate within ~0.5 % anywhere on Earth.
 */
export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = lat1 * DEG_TO_RAD
  const φ2 = lat2 * DEG_TO_RAD
  const dφ = (lat2 - lat1) * DEG_TO_RAD
  const dλ = (lon2 - lon1) * DEG_TO_RAD
  const a =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_M * c
}

// --- Circle ---------------------------------------------------------------

function isInsideCircle(p: Point, c: CircleShape): boolean {
  const [lonC, latC] = c.center
  return haversineDistanceM(p.lat, p.lon, latC, lonC) <= c.radiusM
}

function isInsideOrBufferCircle(
  p: Point,
  c: CircleShape,
  bufferM: number
): boolean {
  const [lonC, latC] = c.center
  return haversineDistanceM(p.lat, p.lon, latC, lonC) <= c.radiusM + bufferM
}

// --- Polygon --------------------------------------------------------------

/**
 * Ray-casting (Jordan curve) point-in-polygon test. Operates directly on
 * lon/lat space — at city scale the projection distortion is negligible
 * for inside/outside tests. (Distance tests below project to a local
 * tangent plane for correctness.)
 *
 * Polygon coordinates are `[lon, lat]` and not implicitly closed; the
 * algorithm handles that by wrapping the index.
 */
function isInsidePolygon(p: Point, poly: PolygonShape): boolean {
  const ring = poly.coordinates
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersects =
      yi > p.lat !== yj > p.lat &&
      p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/**
 * Equirectangular projection from `[lon, lat]` to local `[x, y]` metres
 * around a reference point. Locally accurate to ~0.5 % within a few km
 * — plenty for distance-to-edge work where buffer ≤ 5 km by config.
 */
function project(lat: number, lon: number, refLat: number, refLon: number) {
  const x = (lon - refLon) * DEG_TO_RAD * EARTH_RADIUS_M * Math.cos(refLat * DEG_TO_RAD)
  const y = (lat - refLat) * DEG_TO_RAD * EARTH_RADIUS_M
  return { x, y }
}

/**
 * Shortest distance from `p` to any edge of `poly`, in metres. The polygon
 * is treated as a closed ring (last vertex implicitly connects to first).
 */
function distanceToPolygonEdgeM(p: Point, poly: PolygonShape): number {
  const ring = poly.coordinates
  // Project everything around the test point so we work in metres.
  const pp = { x: 0, y: 0 } // by construction, the test point is the origin
  let minSq = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = project(ring[j][1], ring[j][0], p.lat, p.lon)
    const b = project(ring[i][1], ring[i][0], p.lat, p.lon)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    let t = 0
    if (lenSq > 0) {
      t = ((pp.x - a.x) * dx + (pp.y - a.y) * dy) / lenSq
      if (t < 0) t = 0
      else if (t > 1) t = 1
    }
    const cx = a.x + t * dx
    const cy = a.y + t * dy
    const sq = cx * cx + cy * cy
    if (sq < minSq) minSq = sq
  }
  return Math.sqrt(minSq)
}

// --- Top-level ------------------------------------------------------------

/**
 * Evaluate a point against a geofence shape with an optional proximity
 * buffer. Returns mutually-exclusive `isInside` / `isInBuffer` flags
 * matching the state-machine semantics in `device_geofence_state`.
 *
 *   isInside  = point is inside the inner boundary (the shape itself)
 *   isInBuffer = point is OUTSIDE the inner boundary but within bufferM
 *               of it. (When isInside is true, isInBuffer is false.)
 *
 * If `bufferM <= 0`, only the inner boundary is evaluated and isInBuffer
 * is always false.
 */
export function evaluatePoint(
  point: Point,
  shape: GeofenceShape,
  bufferM: number
): PointEvaluation {
  if (shape.kind === "circle") {
    const inside = isInsideCircle(point, shape)
    if (inside) return { isInside: true, isInBuffer: false }
    if (bufferM <= 0) return { isInside: false, isInBuffer: false }
    const within = isInsideOrBufferCircle(point, shape, bufferM)
    return { isInside: false, isInBuffer: within }
  }
  // polygon
  const inside = isInsidePolygon(point, shape)
  if (inside) return { isInside: true, isInBuffer: false }
  if (bufferM <= 0) return { isInside: false, isInBuffer: false }
  const dist = distanceToPolygonEdgeM(point, shape)
  return { isInside: false, isInBuffer: dist <= bufferM }
}

/**
 * Detect a self-intersecting polygon. Returns true if any two non-adjacent
 * edges cross. The naive O(n²) implementation is fine because we cap
 * polygons at 200 vertices.
 */
export function polygonHasSelfIntersection(poly: PolygonShape): boolean {
  const ring = poly.coordinates
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const a1 = ring[i]
    const a2 = ring[(i + 1) % n]
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent edges (they share a vertex by definition).
      if (j === i || (j + 1) % n === i || j === (i + 1) % n) continue
      const b1 = ring[j]
      const b2 = ring[(j + 1) % n]
      if (segmentsIntersect(a1, a2, b1, b2)) return true
    }
  }
  return false
}

function segmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number]
): boolean {
  const d1 = direction(p3, p4, p1)
  const d2 = direction(p3, p4, p2)
  const d3 = direction(p1, p2, p3)
  const d4 = direction(p1, p2, p4)
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true
  }
  // Collinear cases — treat them as non-intersecting; map editors don't
  // produce useful collinear self-overlaps.
  return false
}

function direction(
  a: [number, number],
  b: [number, number],
  c: [number, number]
): number {
  return (c[0] - a[0]) * (b[1] - a[1]) - (b[0] - a[0]) * (c[1] - a[1])
}
