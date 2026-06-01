import { useEffect, useMemo, useRef, useState } from "react"
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet"
import { Link } from "react-router"
import {
  IconAlertCircle,
  IconArrowLeft,
  IconDeviceMobile,
  IconEye,
  IconEyeOff,
  IconMap,
  IconShape,
} from "@tabler/icons-react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import { GeofenceOverlayLayer } from "@/components/map/geofence-overlay-layer"
import { MapNavControls } from "@/components/map/map-nav-controls"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useFleet, type FleetStatus } from "@/lib/use-fleet"
import { useGeofences } from "@/lib/fleet-stream"
import { cn } from "@/lib/utils"

import {
  DEVICE_COLORS,
  type DeviceColorId,
  type FleetPosition,
} from "@trackit/shared"

const DEFAULT_CENTER: [number, number] = [20, 0]
const DEFAULT_ZOOM = 2

function colorHexFor(id: string): string {
  return DEVICE_COLORS.find((c) => c.id === id)?.hex ?? "#737373"
}

function formatAge(capturedAtUnix?: number): string {
  if (!capturedAtUnix) return "—"
  const diff = Math.max(0, Math.round(Date.now() / 1000 - capturedAtUnix))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  return `${Math.round(diff / 3600)}h ago`
}

const STATUS_LABEL: Record<FleetStatus, string> = {
  idle: "Idle",
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  error: "Error",
  closed: "Closed",
}

const STATUS_TONE: Record<FleetStatus, string> = {
  idle: "bg-muted-foreground",
  connecting: "bg-amber-500",
  live: "bg-emerald-500 animate-pulse",
  reconnecting: "bg-amber-500 animate-pulse",
  error: "bg-destructive",
  closed: "bg-muted-foreground",
}

/**
 * Auto-fit the map to whatever positions exist on first non-empty render.
 * After that, the user is in control — we don't fight their pan/zoom.
 */
function FitToFleet({ positions }: { positions: Map<string, FleetPosition> }) {
  const map = useMap()
  const fittedRef = useRef(false)

  useEffect(() => {
    if (fittedRef.current) return
    if (positions.size === 0) return

    const bounds = L.latLngBounds(
      Array.from(positions.values()).map(
        (p) => [p.lat, p.lon] as [number, number]
      )
    )
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
    fittedRef.current = true
  }, [positions, map])

  return null
}

function MapInstanceCapture({ onReady }: { onReady: (m: L.Map) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

export function MapPage() {
  const { positions, status, error } = useFleet()
  const { list: geofencesList } = useGeofences()
  const [showGeofences, setShowGeofences] = useState(true)
  const [emphasizeActive, setEmphasizeActive] = useState(false)
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null)

  const positionList = useMemo(
    () => Array.from(positions.values()),
    [positions]
  )

  const insideTotal = useMemo(
    () => geofencesList.reduce((acc, g) => acc + (g.insideCount ?? 0), 0),
    [geofencesList]
  )

  return (
    <AppShell breadcrumbs={[{ label: "Map" }]} flush>
      <div className="relative isolate flex-1">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          minZoom={2}
          maxZoom={19}
          worldCopyJump
          className="z-0 size-full min-h-[calc(100svh-3rem)]"
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />

          <FitToFleet positions={positions} />
          <MapInstanceCapture onReady={setMapInstance} />

          {/* Geofence zones — render BEFORE device markers so dots stay
              visually on top */}
          {showGeofences ? (
            <GeofenceOverlayLayer
              geofences={geofencesList}
              emphasizeActive={emphasizeActive}
            />
          ) : null}

          {positionList.map((p) => {
            const fill = colorHexFor(p.deviceColor as DeviceColorId)
            return (
              <CircleMarker
                key={p.deviceId}
                center={[p.lat, p.lon]}
                radius={9}
                pathOptions={{
                  fillColor: fill,
                  fillOpacity: 0.9,
                  color: "#ffffff",
                  weight: 2,
                }}
              >
                <Tooltip
                  direction="top"
                  offset={[0, -10]}
                  opacity={1}
                  className="!rounded-none !border !border-border !bg-background !text-foreground !shadow-md"
                >
                  <div className="flex flex-col gap-1 px-1 py-0.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full ring-1 ring-foreground/10"
                        style={{ backgroundColor: fill }}
                      />
                      <span className="font-medium">{p.deviceName}</span>
                    </div>
                    <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>kind</span>
                      <span className="text-foreground">{p.deviceKind}</span>
                      {typeof p.batteryPct === "number" ? (
                        <>
                          <span>battery</span>
                          <span className="text-foreground">
                            {p.batteryPct}%
                          </span>
                        </>
                      ) : null}
                      {typeof p.accuracyM === "number" && p.accuracyM > 0 ? (
                        <>
                          <span>accuracy</span>
                          <span className="text-foreground">
                            ±{Math.round(p.accuracyM)}m
                          </span>
                        </>
                      ) : null}
                      <span>seen</span>
                      <span className="text-foreground">
                        {formatAge(p.capturedAtUnix)}
                      </span>
                    </div>
                  </div>
                </Tooltip>
              </CircleMarker>
            )
          })}
        </MapContainer>

        {mapInstance ? <MapNavControls map={mapInstance} /> : null}

        {/* Error banner — top-right under nav controls. Kept visually
            isolated from the status pill so an error never sits next to
            the "Live" indicator and gets misread. */}
        {error ? (
          <div className="pointer-events-none absolute right-4 top-32 z-[440] flex justify-end lg:top-28">
            <div className="pointer-events-auto flex items-center gap-2 border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive backdrop-blur">
              <IconAlertCircle className="size-3.5" />
              {error}
            </div>
          </div>
        ) : null}

        {/* Empty state */}
        {status === "live" && positions.size === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
            <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-4 border bg-background/95 px-6 py-8 text-center ring-1 ring-foreground/10 backdrop-blur">
              <span className="grid size-10 place-items-center border bg-muted text-foreground">
                <IconMap className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-medium">Nothing on the map yet</h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Open a registered device, hit{" "}
                  <span className="font-medium text-foreground">
                    Start tracking
                  </span>{" "}
                  and the dot will appear here within a second or two.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button render={<Link to="/devices" />} size="sm">
                  <IconDeviceMobile data-icon="inline-start" />
                  Go to devices
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Initial loading shroud */}
        {status === "connecting" && positions.size === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-sm">
            <Spinner />
          </div>
        ) : null}

        {/* Floating back-to-devices button (mobile/quick nav) */}
        <div className="pointer-events-none absolute bottom-4 left-4 z-10">
          <Button
            render={<Link to="/devices" />}
            variant="outline"
            size="sm"
            className="pointer-events-auto bg-background/90 backdrop-blur"
          >
            <IconArrowLeft data-icon="inline-start" />
            Devices
          </Button>
        </div>

        {/* Bottom-right: status pill + filter chips. This is the page's
            "system state" corner — kept clear of the top-right which is
            owned by MapNavControls (locate me + jump to device). */}
        <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
          {/* Filter chips above the status pill so they don't crowd
              the corner when there are no zones to control */}
          {geofencesList.length > 0 ? (
            <div className="pointer-events-auto flex items-center gap-1 border bg-background/90 p-0.5 ring-1 ring-foreground/10 backdrop-blur">
              <FilterChip
                active={showGeofences}
                onClick={() => setShowGeofences((v) => !v)}
                Icon={showGeofences ? IconShape : IconEyeOff}
                label={showGeofences ? "Zones on" : "Zones off"}
                title="Toggle geofence overlays"
              />
              {showGeofences ? (
                <FilterChip
                  active={emphasizeActive}
                  onClick={() => setEmphasizeActive((v) => !v)}
                  Icon={emphasizeActive ? IconEye : IconEyeOff}
                  label={emphasizeActive ? "Active only" : "All zones"}
                  title="Dim zones with no devices inside"
                />
              ) : null}
            </div>
          ) : null}

          <div className="pointer-events-auto flex items-center gap-2 border bg-background/90 px-2.5 py-1.5 text-[11px] font-medium ring-1 ring-foreground/10 backdrop-blur">
            <span className={`size-1.5 rounded-full ${STATUS_TONE[status]}`} />
            <span>{STATUS_LABEL[status]}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {positions.size} device{positions.size === 1 ? "" : "s"}
            </span>
            {geofencesList.length > 0 ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {geofencesList.length} zone{geofencesList.length === 1 ? "" : "s"}
                  {insideTotal > 0 ? (
                    <>
                      {" · "}
                      <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        {insideTotal} inside
                      </span>
                    </>
                  ) : null}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function FilterChip({
  active,
  onClick,
  Icon,
  label,
  title,
}: {
  active: boolean
  onClick: () => void
  Icon: React.ComponentType<{ className?: string }>
  label: string
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] transition-colors",
        active
          ? "bg-background text-foreground ring-1 ring-foreground/15"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3" />
      {label}
    </button>
  )
}
