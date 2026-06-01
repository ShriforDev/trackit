import {
  type GeofenceShape,
  isCircleShape,
  isPolygonShape,
} from "@trackit/shared/geofence"

/**
 * Browser-side point-in-shape evaluation. Used purely for visual
 * highlighting on the detail map — the server's geometry engine is
 * the source of truth for events. Returns mutually-exclusive flags:
 * `isInside` and `isInBuffer` are never both true.
 */

const EARTH_RADIUS_M = 6_371_000

function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const dφ = ((b.lat - a.lat) * Math.PI) / 180
  const dλ = ((b.lon - a.lon) * Math.PI) / 180
  const h =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Ray-casting algorithm for point-in-polygon. Coordinates are
 * `[lng, lat]` per the shape DTO.
 */
function pointInPolygon(
  point: { lat: number; lon: number },
  ring: [number, number][]
): boolean {
  let inside = false
  const x = point.lon
  const y = point.lat
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/**
 * Approximate distance (metres) from a test point to the nearest edge
 * of a polygon, using equirectangular projection around the test point.
 * Sufficient for the small distances we evaluate against (≤5km buffer).
 */
function distancePointToPolygonEdgeM(
  point: { lat: number; lon: number },
  ring: [number, number][]
): number {
  const cosLat = Math.cos((point.lat * Math.PI) / 180)
  const px = point.lon * cosLat
  const py = point.lat
  let minSqDeg = Infinity
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i]
    const [lon2, lat2] = ring[(i + 1) % ring.length]
    const ax = lon1 * cosLat
    const ay = lat1
    const bx = lon2 * cosLat
    const by = lat2
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const cx = ax + t * dx
    const cy = ay + t * dy
    const sq = (px - cx) * (px - cx) + (py - cy) * (py - cy)
    if (sq < minSqDeg) minSqDeg = sq
  }
  // Convert square degrees back to metres (1° latitude ≈ 111km).
  const distDeg = Math.sqrt(minSqDeg)
  return distDeg * 111_000
}

export function evaluateInside(
  point: { lat: number; lon: number },
  shape: GeofenceShape,
  bufferM: number
): { isInside: boolean; isInBuffer: boolean } {
  if (isCircleShape(shape)) {
    const center = { lat: shape.center[1], lon: shape.center[0] }
    const d = haversineM(point, center)
    if (d <= shape.radiusM) return { isInside: true, isInBuffer: false }
    if (bufferM > 0 && d <= shape.radiusM + bufferM) {
      return { isInside: false, isInBuffer: true }
    }
    return { isInside: false, isInBuffer: false }
  }
  if (isPolygonShape(shape)) {
    const inside = pointInPolygon(point, shape.coordinates)
    if (inside) return { isInside: true, isInBuffer: false }
    if (bufferM > 0) {
      const dEdge = distancePointToPolygonEdgeM(point, shape.coordinates)
      if (dEdge <= bufferM) return { isInside: false, isInBuffer: true }
    }
    return { isInside: false, isInBuffer: false }
  }
  return { isInside: false, isInBuffer: false }
}
