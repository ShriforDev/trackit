import { useEffect, useMemo, useRef, useState } from "react"
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet"
import L from "leaflet"
import { Link } from "react-router"

import { MapNavControls } from "@/components/map/map-nav-controls"
import { useFleet } from "@/lib/use-fleet"
import { cn } from "@/lib/utils"

import { DEVICE_COLORS, type FleetPosition } from "@trackit/shared"
import {
  GEOFENCE_COLORS,
  type GeofenceDTO,
  isCircleShape,
  isPolygonShape,
} from "@trackit/shared/geofence"

import { evaluateInside } from "./point-in-shape"

import "leaflet/dist/leaflet.css"

interface GeofenceDetailMapProps {
  geofence: GeofenceDTO
  className?: string
}

function deviceHexFor(id: string): string {
  return DEVICE_COLORS.find((c) => c.id === id)?.hex ?? "#737373"
}

/**
 * Compute display bounds for the geofence:
 *   - Polygon: tight bounds of all vertices
 *   - Circle:  center ± radius (approximation that's good enough for fitBounds)
 */
function shapeBounds(g: GeofenceDTO): L.LatLngBoundsExpression | null {
  if (isPolygonShape(g.shape)) {
    return g.shape.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
  }
  if (isCircleShape(g.shape)) {
    const [lon, lat] = g.shape.center
    // Approx 1° latitude ≈ 111km. Inflate the bounds box by radius.
    const radDeg = g.shape.radiusM / 111_000
    const lonDeg = g.shape.radiusM / (111_000 * Math.cos((lat * Math.PI) / 180))
    return [
      [lat - radDeg, lon - lonDeg],
      [lat + radDeg, lon + lonDeg],
    ]
  }
  return null
}

function FitToShape({ geofence }: { geofence: GeofenceDTO }) {
  const map = useMap()
  const fittedKey = useRef<string>("")
  useEffect(() => {
    const key = `${geofence.id}::${geofence.shapeVersionId}`
    if (fittedKey.current === key) return
    const bounds = shapeBounds(geofence)
    if (!bounds) return
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 })
    fittedKey.current = key
  }, [geofence, map])
  return null
}

function MapInstanceCapture({ onReady }: { onReady: (m: L.Map) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

export function GeofenceDetailMap({
  geofence,
  className,
}: GeofenceDetailMapProps) {
  const colorHex = GEOFENCE_COLORS[geofence.color]
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null)
  const { positions } = useFleet()

  // Filter to devices currently inside the shape's BUFFER+INSIDE so they
  // render on top of the geofence; other devices stay on the base map
  // but with a more muted style.
  const insideDevices = useMemo(() => {
    const inside: FleetPosition[] = []
    const outside: FleetPosition[] = []
    for (const p of positions.values()) {
      const result = evaluateInside(
        { lat: p.lat, lon: p.lon },
        geofence.shape,
        geofence.proximityBufferM
      )
      if (result.isInside || result.isInBuffer) inside.push(p)
      else outside.push(p)
    }
    return { inside, outside }
  }, [positions, geofence])

  return (
    <div
      className={cn(
        "relative isolate flex flex-1 overflow-hidden border bg-background ring-1 ring-foreground/5",
        className
      )}
    >
      <MapContainer
        center={[12.9716, 77.5946]}
        zoom={13}
        className="size-full"
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <FitToShape geofence={geofence} />
        <MapInstanceCapture onReady={setMapInstance} />

        {/* The geofence shape itself */}
        {isCircleShape(geofence.shape) ? (
          <>
            <Circle
              center={[geofence.shape.center[1], geofence.shape.center[0]]}
              radius={geofence.shape.radiusM}
              pathOptions={{
                color: colorHex,
                weight: 2.5,
                fillOpacity: 0.18,
              }}
            />
            {geofence.proximityBufferM > 0 ? (
              <Circle
                center={[geofence.shape.center[1], geofence.shape.center[0]]}
                radius={geofence.shape.radiusM + geofence.proximityBufferM}
                pathOptions={{
                  color: colorHex,
                  weight: 1,
                  fillOpacity: 0,
                  dashArray: "4 4",
                  opacity: 0.45,
                }}
              />
            ) : null}
          </>
        ) : null}

        {isPolygonShape(geofence.shape) ? (
          <Polygon
            positions={geofence.shape.coordinates.map(
              ([lon, lat]) => [lat, lon] as [number, number]
            )}
            pathOptions={{
              color: colorHex,
              weight: 2.5,
              fillOpacity: 0.18,
            }}
          />
        ) : null}

        {/* Devices inside the boundary or buffer */}
        {insideDevices.inside.map((p) => (
          <CircleMarker
            key={p.deviceId}
            center={[p.lat, p.lon]}
            radius={7}
            pathOptions={{
              color: deviceHexFor(p.deviceColor),
              fillColor: deviceHexFor(p.deviceColor),
              fillOpacity: 0.95,
              weight: 2,
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -8]}
              opacity={1}
              className="!border !bg-background !text-foreground !shadow-none !rounded-none"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
                {p.deviceName}
              </span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* Devices outside — softer */}
        {insideDevices.outside.map((p) => (
          <CircleMarker
            key={p.deviceId}
            center={[p.lat, p.lon]}
            radius={4}
            pathOptions={{
              color: deviceHexFor(p.deviceColor),
              fillColor: deviceHexFor(p.deviceColor),
              fillOpacity: 0.5,
              weight: 1,
              opacity: 0.6,
            }}
            interactive={false}
          />
        ))}
      </MapContainer>

      {mapInstance ? <MapNavControls map={mapInstance} /> : null}

      {/* Legend pill — bottom-left */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-[400]">
        <div className="pointer-events-auto flex items-center gap-2 border bg-background/95 px-3 py-1.5 ring-1 ring-foreground/10 backdrop-blur">
          <span
            aria-hidden
            className="size-3 ring-1 ring-foreground/20"
            style={{ backgroundColor: colorHex }}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
            {geofence.name}
          </span>
          <span className="text-[10px] text-muted-foreground">
            ·{" "}
            <Link
              to={`/geofences/${geofence.id}/edit-shape`}
              className="hover:text-foreground hover:underline"
            >
              edit shape
            </Link>
          </span>
        </div>
      </div>
    </div>
  )
}
