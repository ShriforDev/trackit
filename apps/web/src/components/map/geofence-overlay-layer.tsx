import { useState } from "react"
import { Link } from "react-router"
import { Circle, Polygon, Tooltip } from "react-leaflet"

import { GEOFENCE_COLORS } from "@trackit/shared/geofence"
import {
  type GeofenceDTO,
  isCircleShape,
  isPolygonShape,
} from "@trackit/shared/geofence"

interface GeofenceOverlayLayerProps {
  geofences: GeofenceDTO[]
  /** When true, dim non-occupied zones to draw the eye to active ones. */
  emphasizeActive?: boolean
}

/**
 * Live geofence overlays for the fleet map. Each zone is rendered in
 * its color with a soft fill + colored border; hovering brightens the
 * fill. A tooltip shows the name + inside count + a link to the detail
 * page.
 *
 * The layer is composable: drop it inside a `<MapContainer>` and pass
 * the geofences from `useGeofences()`.
 */
export function GeofenceOverlayLayer({
  geofences,
  emphasizeActive = false,
}: GeofenceOverlayLayerProps) {
  return (
    <>
      {geofences.map((g) => {
        const insideCount = g.insideCount ?? 0
        const dim = emphasizeActive && insideCount === 0
        return (
          <ZoneOverlay
            key={`${g.id}::${g.shapeVersionId}`}
            geofence={g}
            dim={dim}
          />
        )
      })}
    </>
  )
}

function ZoneOverlay({ geofence, dim }: { geofence: GeofenceDTO; dim: boolean }) {
  const colorHex = GEOFENCE_COLORS[geofence.color]
  const [hovered, setHovered] = useState(false)
  const insideCount = geofence.insideCount ?? 0

  const baseFillOpacity = dim ? 0.04 : insideCount > 0 ? 0.16 : 0.08
  const fillOpacity = hovered ? Math.min(0.32, baseFillOpacity * 2.4) : baseFillOpacity
  const baseWeight = dim ? 1 : insideCount > 0 ? 2 : 1.5
  const weight = hovered ? baseWeight + 0.6 : baseWeight
  const opacity = dim ? 0.55 : 1

  const tooltipContent = (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
        {geofence.name}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {insideCount > 0
          ? `${insideCount} inside · click for detail`
          : "click for detail"}
      </span>
      <Link
        to={`/geofences/${geofence.id}`}
        className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground hover:underline"
      >
        Open →
      </Link>
    </div>
  )

  const eventHandlers = {
    mouseover: () => setHovered(true),
    mouseout: () => setHovered(false),
  }

  if (isCircleShape(geofence.shape)) {
    return (
      <Circle
        center={[geofence.shape.center[1], geofence.shape.center[0]]}
        radius={geofence.shape.radiusM}
        pathOptions={{
          color: colorHex,
          weight,
          fillOpacity,
          opacity,
        }}
        eventHandlers={eventHandlers}
      >
        <Tooltip
          direction="top"
          opacity={1}
          className="!border !bg-background !text-foreground !shadow-none !rounded-none !px-2 !py-1.5"
        >
          {tooltipContent}
        </Tooltip>
      </Circle>
    )
  }

  if (isPolygonShape(geofence.shape)) {
    return (
      <Polygon
        positions={geofence.shape.coordinates.map(
          ([lon, lat]) => [lat, lon] as [number, number]
        )}
        pathOptions={{
          color: colorHex,
          weight,
          fillOpacity,
          opacity,
        }}
        eventHandlers={eventHandlers}
      >
        <Tooltip
          direction="top"
          opacity={1}
          className="!border !bg-background !text-foreground !shadow-none !rounded-none !px-2 !py-1.5"
        >
          {tooltipContent}
        </Tooltip>
      </Polygon>
    )
  }

  return null
}
