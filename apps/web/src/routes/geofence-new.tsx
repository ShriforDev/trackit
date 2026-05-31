import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"
import L from "leaflet"
import { toast } from "sonner"
import {
  IconAlertCircle,
  IconCheck,
  IconCircle,
  IconPolygon,
  IconRefresh,
  IconShape,
  IconX,
} from "@tabler/icons-react"

import { AppShell } from "@/components/layout/app-shell"
import { MapNavControls } from "@/components/map/map-nav-controls"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"
import { geofencesApi } from "@/lib/geofences-client"
import { cn } from "@/lib/utils"

import {
  GEOFENCE_COLORS,
  GEOFENCE_COLOR_IDS,
  type GeofenceColorId,
  type GeofenceDTO,
  type GeofenceShape,
} from "@trackit/shared/geofence"

import "leaflet/dist/leaflet.css"

const DEFAULT_CENTER: [number, number] = [12.9716, 77.5946]
const DEFAULT_ZOOM = 13

type ShapeKind = "polygon" | "circle"

// ---- helpers --------------------------------------------------------------

function hexFor(color: GeofenceColorId): string {
  return GEOFENCE_COLORS[color]
}

function formatRadiusLabel(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 2)} km`
  return `${m} m`
}

/**
 * Approximate area (m²) of a polygon on a sphere using the spherical
 * excess formula. Good enough for a "this fence is X km²" UX hint.
 */
function polygonAreaM2(coords: [number, number][]): number {
  if (coords.length < 3) return 0
  const R = 6_371_000
  let area = 0
  for (let i = 0; i < coords.length; i++) {
    const [x1, y1] = coords[i]
    const [x2, y2] = coords[(i + 1) % coords.length]
    area += ((x2 - x1) * Math.PI) / 180 * (2 + Math.sin((y1 * Math.PI) / 180) + Math.sin((y2 * Math.PI) / 180))
  }
  return Math.abs((area * R * R) / 2)
}

function formatArea(m2: number): string {
  if (m2 < 10_000) return `${Math.round(m2)} m²`
  if (m2 < 1_000_000) return `${(m2 / 10_000).toFixed(1)} ha`
  return `${(m2 / 1_000_000).toFixed(2)} km²`
}

// ---- drawing tools (react-leaflet hooks) ----------------------------------

interface PolygonDrawerProps {
  vertices: [number, number][] // [lat, lon]
  closed: boolean
  onAddVertex: (lat: number, lon: number) => void
  onClose: () => void
}

/**
 * Click adds a vertex; double-click closes the polygon (only when ≥ 3
 * vertices). Map's default doubleClickZoom is suppressed at MapContainer
 * level so dblclick acts as the close signal.
 */
function PolygonDrawer({
  vertices,
  closed,
  onAddVertex,
  onClose,
}: PolygonDrawerProps) {
  useMapEvents({
    click(e) {
      if (closed) return
      onAddVertex(e.latlng.lat, e.latlng.lng)
    },
    dblclick() {
      if (closed) return
      if (vertices.length >= 3) onClose()
    },
  })
  return null
}

interface CircleDrawerProps {
  hasCenter: boolean
  onSetCenter: (lat: number, lon: number) => void
}

function CircleDrawer({ hasCenter, onSetCenter }: CircleDrawerProps) {
  useMapEvents({
    click(e) {
      onSetCenter(e.latlng.lat, e.latlng.lng)
    },
  })
  // First click sets, subsequent clicks move — both handled by the same hook.
  // (hasCenter is unused but kept in the signature for future "lock after first" toggling.)
  void hasCenter
  return null
}

// ---- existing geofences faded behind ------------------------------------

function FadedExisting({ list }: { list: GeofenceDTO[] }) {
  return (
    <>
      {list.map((g) =>
        g.shape.kind === "circle" ? (
          <Circle
            key={g.id}
            center={[g.shape.center[1], g.shape.center[0]]}
            radius={g.shape.radiusM}
            pathOptions={{
              color: hexFor(g.color),
              weight: 1,
              opacity: 0.4,
              fillOpacity: 0.06,
              dashArray: "3 3",
            }}
            interactive={false}
          />
        ) : (
          <Polygon
            key={g.id}
            positions={g.shape.coordinates.map((c) => [c[1], c[0]] as [number, number])}
            pathOptions={{
              color: hexFor(g.color),
              weight: 1,
              opacity: 0.4,
              fillOpacity: 0.06,
              dashArray: "3 3",
            }}
            interactive={false}
          />
        )
      )}
    </>
  )
}

// ---- map auto-fit on first load ------------------------------------------

function FitOnLoad({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap()
  const didFit = useRef(false)
  useEffect(() => {
    if (didFit.current || !bounds) return
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
    didFit.current = true
  }, [bounds, map])
  return null
}

function MapInstanceCapture({ onReady }: { onReady: (m: L.Map) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

// ---- main page ------------------------------------------------------------

export function GeofenceNewPage() {
  const navigate = useNavigate()

  // shape state
  const [kind, setKind] = useState<ShapeKind>("polygon")
  const [vertices, setVertices] = useState<[number, number][]>([]) // [lat, lon]
  const [closed, setClosed] = useState(false)
  const [center, setCenter] = useState<[number, number] | null>(null)
  const [radiusM, setRadiusM] = useState(500)

  // form state
  const [name, setName] = useState("")
  const [color, setColor] = useState<GeofenceColorId>("sapphire")
  const [proximityBufferM, setProximityBufferM] = useState(0)
  const [dwellThresholdMin, setDwellThresholdMin] = useState(0)
  const [proximityEnabled, setProximityEnabled] = useState(false)
  const [dwellEnabled, setDwellEnabled] = useState(false)

  // submission
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // map instance — captured once mounted, used by floating nav controls
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null)

  // existing geofences (for faded background)
  const [existing, setExisting] = useState<GeofenceDTO[] | null>(null)
  useEffect(() => {
    void geofencesApi
      .list()
      .then(setExisting)
      .catch(() => setExisting([]))
  }, [])

  // initial map bounds: user's existing geofences if any, else default
  const initialBounds = useMemo<L.LatLngBoundsExpression | null>(() => {
    if (!existing || existing.length === 0) return null
    const points: [number, number][] = []
    for (const g of existing) {
      if (g.shape.kind === "circle") {
        points.push([g.shape.center[1], g.shape.center[0]])
      } else {
        for (const c of g.shape.coordinates) points.push([c[1], c[0]])
      }
    }
    if (points.length === 0) return null
    return L.latLngBounds(points)
  }, [existing])

  const polygonReady = vertices.length >= 3 && closed
  const shapeReady =
    kind === "polygon" ? polygonReady : center !== null && radiusM >= 50

  function reset() {
    setVertices([])
    setClosed(false)
    setCenter(null)
    setRadiusM(500)
    setServerError(null)
  }

  function switchKind(next: ShapeKind) {
    if (next === kind) return
    setKind(next)
    reset()
  }

  function addVertex(lat: number, lon: number) {
    setVertices((prev) => [...prev, [lat, lon]])
  }

  function closePolygon() {
    setClosed(true)
  }

  function setCircleCenter(lat: number, lon: number) {
    setCenter([lat, lon])
  }

  // ---- save ---------------------------------------------------------------

  async function onSave() {
    setServerError(null)
    if (!name.trim()) {
      setServerError("Give the geofence a name.")
      return
    }
    if (!shapeReady) {
      setServerError(
        kind === "polygon"
          ? "Click at least 3 points on the map, then double-click to close the polygon."
          : "Click on the map to set the circle's center, then adjust the radius."
      )
      return
    }

    let shape: GeofenceShape
    if (kind === "polygon") {
      // shared types use [lng, lat]; we collected [lat, lon].
      shape = {
        kind: "polygon",
        coordinates: vertices.map(([lat, lon]) => [lon, lat] as [number, number]),
      }
    } else {
      shape = {
        kind: "circle",
        center: [center![1], center![0]],
        radiusM,
      }
    }

    setIsSubmitting(true)
    try {
      const created = await geofencesApi.create({
        name: name.trim(),
        color,
        shape,
        proximityBufferM: proximityEnabled ? proximityBufferM : 0,
        dwellThresholdMin: dwellEnabled ? dwellThresholdMin : 0,
      })
      toast.success(`Created “${created.name}”.`)
      navigate("/geofences", { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        const issues =
          (err.body as { issues?: Array<{ message: string }> } | undefined)
            ?.issues
        if (issues && issues.length > 0) {
          setServerError(issues.map((i) => i.message).join("; "))
        } else if ((err.body as { error?: string } | undefined)?.error === "self_intersecting_polygon") {
          setServerError(
            "The polygon edges cross each other. Click Reset and redraw without overlapping lines."
          )
        } else {
          setServerError(err.message)
        }
      } else {
        setServerError("Couldn't save geofence. Try again.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // ---- derived display ---------------------------------------------------

  const polygonPositions: [number, number][] = vertices
  const previewPolygon =
    kind === "polygon" && vertices.length >= 2 && !closed
      ? [...vertices, vertices[0]]
      : null

  const colorHex = hexFor(color)

  return (
    <AppShell
      flush
      breadcrumbs={[
        { label: "Geofences", to: "/geofences" },
        { label: "New" },
      ]}
    >
      <div className="flex flex-1 flex-col lg:flex-row">
        {/* ---- map ---- */}
        <div className="relative h-[55vh] flex-1 lg:h-auto">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            doubleClickZoom={false}
            className="size-full min-h-[55vh] lg:min-h-0"
            attributionControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />

            <FitOnLoad bounds={initialBounds} />
            <MapInstanceCapture onReady={setMapInstance} />
            {existing ? <FadedExisting list={existing} /> : null}

            {/* Drawing handlers */}
            {kind === "polygon" ? (
              <PolygonDrawer
                vertices={vertices}
                closed={closed}
                onAddVertex={addVertex}
                onClose={closePolygon}
              />
            ) : (
              <CircleDrawer hasCenter={!!center} onSetCenter={setCircleCenter} />
            )}

            {/* Live polygon preview */}
            {kind === "polygon" && polygonPositions.length > 0 ? (
              closed ? (
                <Polygon
                  positions={polygonPositions}
                  pathOptions={{
                    color: colorHex,
                    weight: 2.5,
                    fillOpacity: 0.18,
                  }}
                />
              ) : (
                <Polyline
                  positions={previewPolygon ?? polygonPositions}
                  pathOptions={{
                    color: colorHex,
                    weight: 2,
                    dashArray: "4 4",
                  }}
                />
              )
            ) : null}

            {/* Polygon vertex markers */}
            {kind === "polygon"
              ? polygonPositions.map((v, i) => (
                  <CircleMarker
                    key={i}
                    center={v}
                    radius={5}
                    pathOptions={{
                      color: colorHex,
                      fillColor: "#ffffff",
                      fillOpacity: 1,
                      weight: 2,
                    }}
                  />
                ))
              : null}

            {/* Circle preview */}
            {kind === "circle" && center ? (
              <>
                <Circle
                  center={center}
                  radius={radiusM}
                  pathOptions={{
                    color: colorHex,
                    weight: 2.5,
                    fillOpacity: 0.18,
                  }}
                />
                <CircleMarker
                  center={center}
                  radius={5}
                  pathOptions={{
                    color: colorHex,
                    fillColor: "#ffffff",
                    fillOpacity: 1,
                    weight: 2,
                  }}
                />
              </>
            ) : null}
          </MapContainer>

          {/* Floating nav controls — search, locate, jump-to-device */}
          {mapInstance ? <MapNavControls map={mapInstance} /> : null}

          {/* Instruction pill — bottom-left of the map (out of the way of search) */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-[400] max-w-xs">
            <div className="pointer-events-auto flex items-start gap-2 border bg-background/95 px-3 py-2 ring-1 ring-foreground/10 backdrop-blur">
              {kind === "polygon" ? (
                <IconPolygon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <IconCircle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              )}
              <div className="flex flex-col gap-0.5 text-[11px] leading-relaxed">
                <span className="font-medium">
                  {kind === "polygon"
                    ? polygonReady
                      ? "Polygon closed"
                      : `Click to add vertex · ${vertices.length} so far`
                    : center
                      ? "Adjust radius in the side panel"
                      : "Click on the map to set the center"}
                </span>
                {kind === "polygon" && vertices.length > 0 && !closed ? (
                  <span className="text-[10px] text-muted-foreground">
                    Double-click to close once you have 3+ vertices.
                  </span>
                ) : null}
                {kind === "polygon" && polygonReady ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {vertices.length} verts ·{" "}
                    {formatArea(
                      polygonAreaM2(vertices.map(([lat, lon]) => [lon, lat]))
                    )}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Reset chip — bottom-left, stacked above the instruction pill */}
          {(vertices.length > 0 || center) && (
            <div className="pointer-events-none absolute bottom-[5.5rem] left-4 z-[400]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-events-auto bg-background/95 backdrop-blur"
                onClick={reset}
              >
                <IconRefresh data-icon="inline-start" />
                Reset shape
              </Button>
            </div>
          )}
        </div>

        {/* ---- side panel ---- */}
        <aside className="flex w-full shrink-0 flex-col gap-5 border-t bg-background p-5 lg:w-96 lg:border-l lg:border-t-0">
          <header className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              New geofence
            </span>
            <h1 className="font-heading text-xl font-medium leading-tight tracking-tight">
              Define a boundary
            </h1>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Pick a shape, draw it on the map, give it a name, and decide
              which alerts fire.
            </p>
          </header>

          {/* Shape kind toggle */}
          <Field>
            <FieldLabel>Shape</FieldLabel>
            <div className="grid grid-cols-2 gap-1.5 border bg-muted/30 p-1 ring-1 ring-foreground/5">
              <ShapeButton
                active={kind === "polygon"}
                onClick={() => switchKind("polygon")}
                icon={<IconPolygon className="size-3.5" />}
                label="Polygon"
                hint="Click vertices, dbl-click to close"
              />
              <ShapeButton
                active={kind === "circle"}
                onClick={() => switchKind("circle")}
                icon={<IconCircle className="size-3.5" />}
                label="Circle"
                hint="Click center, set radius"
              />
            </div>
          </Field>

          {/* Color picker */}
          <Field>
            <FieldLabel>Color</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              {GEOFENCE_COLOR_IDS.map((id) => {
                const active = id === color
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setColor(id)}
                    aria-label={id}
                    aria-pressed={active}
                    className={cn(
                      "group/swatch relative grid place-items-center transition-transform",
                      active ? "scale-110" : "hover:scale-105"
                    )}
                  >
                    <span
                      className={cn(
                        "block size-7 ring-1 ring-foreground/15 transition-all",
                        active && "ring-2 ring-foreground/60"
                      )}
                      style={{ backgroundColor: hexFor(id) }}
                    />
                    {active ? (
                      <IconCheck
                        className="absolute size-3.5 text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.4)]"
                        strokeWidth={3}
                      />
                    ) : null}
                  </button>
                )
              })}
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {color}
            </span>
          </Field>

          {/* Name */}
          <Field>
            <FieldLabel htmlFor="geofence-name">Name</FieldLabel>
            <Input
              id="geofence-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="HQ campus · Restricted zone · ..."
              autoFocus
              required
            />
          </Field>

          {/* Circle radius (only when circle + has center) */}
          {kind === "circle" && center ? (
            <Field>
              <FieldLabel>Radius</FieldLabel>
              <div className="flex flex-col gap-2">
                <input
                  type="range"
                  min={50}
                  max={50_000}
                  step={50}
                  value={radiusM}
                  onChange={(e) => setRadiusM(Number(e.target.value))}
                  className="accent-foreground"
                />
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <span>50 m</span>
                  <span className="text-foreground">{formatRadiusLabel(radiusM)}</span>
                  <span>50 km</span>
                </div>
              </div>
            </Field>
          ) : null}

          {/* Alert config */}
          <div className="flex flex-col gap-3 border-t pt-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Alerts
            </span>

            <ToggleRow
              label="Approach"
              hint="Notify when a device enters a buffer around the boundary"
              enabled={proximityEnabled}
              onToggle={setProximityEnabled}
            >
              {proximityEnabled ? (
                <div className="flex flex-col gap-1">
                  <input
                    type="range"
                    min={50}
                    max={5_000}
                    step={50}
                    value={proximityBufferM || 200}
                    onChange={(e) =>
                      setProximityBufferM(Number(e.target.value))
                    }
                    className="accent-foreground"
                  />
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span>50 m</span>
                    <span className="text-foreground">
                      {formatRadiusLabel(proximityBufferM || 200)}
                    </span>
                    <span>5 km</span>
                  </div>
                </div>
              ) : null}
            </ToggleRow>

            <ToggleRow
              label="Dwell"
              hint="Notify after a device has stayed inside for ≥ N minutes"
              enabled={dwellEnabled}
              onToggle={setDwellEnabled}
            >
              {dwellEnabled ? (
                <div className="flex flex-col gap-1">
                  <input
                    type="range"
                    min={5}
                    max={1440}
                    step={5}
                    value={dwellThresholdMin || 30}
                    onChange={(e) =>
                      setDwellThresholdMin(Number(e.target.value))
                    }
                    className="accent-foreground"
                  />
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span>5 min</span>
                    <span className="text-foreground">
                      {dwellThresholdMin || 30} min
                    </span>
                    <span>24 hr</span>
                  </div>
                </div>
              ) : null}
            </ToggleRow>
          </div>

          {/* Server error */}
          {serverError ? (
            <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive ring-1 ring-foreground/5">
              <IconAlertCircle className="size-3.5 shrink-0" />
              {serverError}
            </div>
          ) : null}

          {/* Actions */}
          <div className="mt-auto flex items-center gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate("/geofences")}
              disabled={isSubmitting}
            >
              <IconX data-icon="inline-start" />
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void onSave()}
              disabled={isSubmitting || !shapeReady || !name.trim()}
              className="flex-1"
            >
              {isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconShape data-icon="inline-start" />
              )}
              {isSubmitting ? "Saving…" : "Create geofence"}
            </Button>
          </div>
        </aside>
      </div>
    </AppShell>
  )
}

// ---- subcomponents ----

function ShapeButton({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors",
        active
          ? "bg-background ring-1 ring-foreground/20"
          : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </span>
      <span className="text-[10px] leading-tight text-muted-foreground">
        {hint}
      </span>
    </button>
  )
}

function ToggleRow({
  label,
  hint,
  enabled,
  onToggle,
  children,
}: {
  label: string
  hint: string
  enabled: boolean
  onToggle: (next: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 border bg-muted/20 px-3 py-2.5 ring-1 ring-foreground/5">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 size-3.5 accent-foreground"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs font-medium leading-tight">{label}</span>
          <span className="text-[10px] leading-tight text-muted-foreground">
            {hint}
          </span>
        </div>
      </label>
      {children}
    </div>
  )
}
