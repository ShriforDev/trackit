import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
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
  IconArrowLeft,
  IconCircle,
  IconDeviceFloppy,
  IconHistory,
  IconPolygon,
  IconRefresh,
  IconX,
} from "@tabler/icons-react"

import { MapNavControls } from "@/components/map/map-nav-controls"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { GeofenceSwatch } from "@/components/ui/geofence-swatch"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"
import { geofencesApi } from "@/lib/geofences-client"
import { cn } from "@/lib/utils"

import {
  GEOFENCE_COLORS,
  type GeofenceDTO,
  type GeofenceShape,
  isCircleShape,
  isPolygonShape,
} from "@trackit/shared/geofence"

import "leaflet/dist/leaflet.css"

type ShapeKind = "polygon" | "circle"

function formatRadiusLabel(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 2)} km`
  return `${m} m`
}

// ---- map helpers ---------------------------------------------------------

function PolygonDrawer({
  vertices,
  closed,
  onAddVertex,
  onClose,
}: {
  vertices: [number, number][]
  closed: boolean
  onAddVertex: (lat: number, lon: number) => void
  onClose: () => void
}) {
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

function CircleDrawer({ onSetCenter }: { onSetCenter: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onSetCenter(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function FitToShape({ geofence }: { geofence: GeofenceDTO | null }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !geofence) return
    if (isPolygonShape(geofence.shape)) {
      const positions: [number, number][] = geofence.shape.coordinates.map(
        ([lon, lat]) => [lat, lon]
      )
      map.fitBounds(positions, { padding: [60, 60], maxZoom: 17 })
    } else if (isCircleShape(geofence.shape)) {
      const center: [number, number] = [
        geofence.shape.center[1],
        geofence.shape.center[0],
      ]
      const r = geofence.shape.radiusM
      const radDeg = r / 111_000
      const lonDeg = r / (111_000 * Math.cos((center[0] * Math.PI) / 180))
      map.fitBounds(
        [
          [center[0] - radDeg, center[1] - lonDeg],
          [center[0] + radDeg, center[1] + lonDeg],
        ],
        { padding: [60, 60], maxZoom: 17 }
      )
    }
    fitted.current = true
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

// ---- main page ------------------------------------------------------------

export function GeofenceEditShapePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [geofence, setGeofence] = useState<GeofenceDTO | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // editing state — kind defaults to original shape; can be switched
  const [kind, setKind] = useState<ShapeKind>("polygon")
  const [vertices, setVertices] = useState<[number, number][]>([])
  const [closed, setClosed] = useState(false)
  const [center, setCenter] = useState<[number, number] | null>(null)
  const [radiusM, setRadiusM] = useState(500)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null)

  // Load + initialize from existing shape
  useEffect(() => {
    if (!id) return
    let cancelled = false
    geofencesApi
      .get(id)
      .then((g) => {
        if (cancelled) return
        setGeofence(g)
        if (isCircleShape(g.shape)) {
          setKind("circle")
          setCenter([g.shape.center[1], g.shape.center[0]])
          setRadiusM(g.shape.radiusM)
        } else if (isPolygonShape(g.shape)) {
          setKind("polygon")
          setVertices(
            g.shape.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
          )
          setClosed(true)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setLoadError("not_found")
        } else {
          setLoadError(err instanceof ApiError ? err.message : "Couldn't load geofence.")
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

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

  // Restore the original shape (undo any changes)
  function restoreOriginal() {
    if (!geofence) return
    if (isCircleShape(geofence.shape)) {
      setKind("circle")
      setCenter([geofence.shape.center[1], geofence.shape.center[0]])
      setRadiusM(geofence.shape.radiusM)
      setVertices([])
      setClosed(false)
    } else if (isPolygonShape(geofence.shape)) {
      setKind("polygon")
      setVertices(
        geofence.shape.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
      )
      setClosed(true)
      setCenter(null)
    }
    setServerError(null)
  }

  const polygonReady = vertices.length >= 3 && closed
  const shapeReady =
    kind === "polygon" ? polygonReady : center !== null && radiusM >= 50

  const isDirty = useMemo(() => {
    if (!geofence) return false
    if (kind === "polygon") {
      if (!isPolygonShape(geofence.shape)) return true
      const orig = geofence.shape.coordinates
      if (orig.length !== vertices.length) return true
      for (let i = 0; i < orig.length; i++) {
        if (
          Math.abs(orig[i][0] - vertices[i][1]) > 1e-9 ||
          Math.abs(orig[i][1] - vertices[i][0]) > 1e-9
        ) {
          return true
        }
      }
      return false
    }
    if (kind === "circle") {
      if (!isCircleShape(geofence.shape)) return true
      if (!center) return false
      const dLat = Math.abs(center[0] - geofence.shape.center[1])
      const dLon = Math.abs(center[1] - geofence.shape.center[0])
      if (dLat > 1e-9 || dLon > 1e-9) return true
      if (radiusM !== geofence.shape.radiusM) return true
      return false
    }
    return false
  }, [geofence, kind, vertices, center, radiusM])

  async function onSave() {
    if (!geofence) return
    setServerError(null)
    if (!shapeReady) {
      setServerError(
        kind === "polygon"
          ? "Click at least 3 points on the map, then double-click to close the polygon."
          : "Click on the map to set the circle's center and adjust the radius."
      )
      return
    }
    if (!isDirty) {
      toast("No changes to save.")
      return
    }

    let shape: GeofenceShape
    if (kind === "polygon") {
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
      const updated = await geofencesApi.updateShape(geofence.id, { shape })
      toast.success(
        `Saved revision ${updated.shapeRevision}. Devices were re-evaluated against the new boundary.`
      )
      navigate(`/geofences/${geofence.id}`, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; issues?: { message: string }[] } | undefined
        if (body?.error === "self_intersecting_polygon") {
          setServerError(
            "The polygon edges cross each other. Reset and redraw without overlapping lines."
          )
        } else if (body?.issues?.length) {
          setServerError(body.issues.map((i) => i.message).join("; "))
        } else {
          setServerError(err.message)
        }
      } else {
        setServerError("Couldn't save shape changes. Try again.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // ---- error state --------

  if (loadError === "not_found") {
    return (
      <AppShell breadcrumbs={[{ label: "Geofences", to: "/geofences" }]}>
        <div className="mt-12 flex flex-col items-center justify-center gap-4 py-16 text-center">
          <span className="grid size-12 place-items-center border bg-muted/40 ring-1 ring-foreground/10">
            <IconPolygon className="size-5 text-muted-foreground" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Geofence not found</h2>
            <p className="max-w-sm text-xs text-muted-foreground">
              It may have been deleted, or the link is wrong.
            </p>
          </div>
          <Button render={<Link to="/geofences" />} size="sm">
            <IconArrowLeft data-icon="inline-start" />
            Back to geofences
          </Button>
        </div>
      </AppShell>
    )
  }

  if (loadError) {
    return (
      <AppShell breadcrumbs={[{ label: "Geofences", to: "/geofences" }]}>
        <div className="mt-6 flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive ring-1 ring-foreground/5">
          <IconAlertCircle className="size-3.5 shrink-0" />
          {loadError}
        </div>
      </AppShell>
    )
  }

  if (!geofence) {
    return (
      <AppShell
        flush
        breadcrumbs={[
          { label: "Geofences", to: "/geofences" },
          { label: "Edit shape" },
        ]}
      >
        <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <Skeleton className="h-full min-h-[55vh]" />
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </AppShell>
    )
  }

  // ---- render ----

  const colorHex = GEOFENCE_COLORS[geofence.color]
  const polygonPositions: [number, number][] = vertices
  const previewPolygon =
    kind === "polygon" && vertices.length >= 2 && !closed
      ? [...vertices, vertices[0]]
      : null

  return (
    <AppShell
      flush
      breadcrumbs={[
        { label: "Geofences", to: "/geofences" },
        { label: geofence.name, to: `/geofences/${geofence.id}` },
        { label: "Edit shape" },
      ]}
    >
      <div className="flex flex-1 flex-col lg:flex-row">
        {/* MAP */}
        <div className="relative h-[55vh] flex-1 lg:h-auto">
          <MapContainer
            center={[12.9716, 77.5946]}
            zoom={13}
            doubleClickZoom={false}
            className="size-full min-h-[55vh] lg:min-h-0"
            attributionControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <FitToShape geofence={geofence} />
            <MapInstanceCapture onReady={setMapInstance} />

            {/* Reference shape — original boundary, faded behind the new draw */}
            {isCircleShape(geofence.shape) ? (
              <Circle
                center={[geofence.shape.center[1], geofence.shape.center[0]]}
                radius={geofence.shape.radiusM}
                pathOptions={{
                  color: colorHex,
                  weight: 1.5,
                  fillOpacity: 0.05,
                  dashArray: "4 4",
                  opacity: 0.5,
                }}
                interactive={false}
              />
            ) : null}

            {isPolygonShape(geofence.shape) ? (
              <Polygon
                positions={geofence.shape.coordinates.map(
                  ([lon, lat]) => [lat, lon] as [number, number]
                )}
                pathOptions={{
                  color: colorHex,
                  weight: 1.5,
                  fillOpacity: 0.05,
                  dashArray: "4 4",
                  opacity: 0.5,
                }}
                interactive={false}
              />
            ) : null}

            {/* Drawing handlers */}
            {kind === "polygon" ? (
              <PolygonDrawer
                vertices={vertices}
                closed={closed}
                onAddVertex={addVertex}
                onClose={closePolygon}
              />
            ) : (
              <CircleDrawer onSetCenter={setCircleCenter} />
            )}

            {/* Live polygon */}
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

            {/* Live circle */}
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

          {mapInstance ? <MapNavControls map={mapInstance} /> : null}

          {/* Top banner — clear context that we are editing */}
          <div className="pointer-events-none absolute left-1/2 top-20 z-[400] -translate-x-1/2 lg:top-4 lg:left-4 lg:translate-x-0">
            <div className="pointer-events-auto flex items-center gap-2 border border-amber-500/30 bg-amber-500/5 px-3 py-2 ring-1 ring-amber-500/15 backdrop-blur">
              <IconHistory className="size-3.5 text-amber-700 dark:text-amber-300" />
              <span className="text-[11px] text-amber-900 dark:text-amber-100">
                Editing shape · saving creates revision{" "}
                <span className="font-mono font-medium tabular-nums">
                  {geofence.shapeRevision + 1}
                </span>
              </span>
            </div>
          </div>

          {/* Reset chip — bottom-left */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-[400] flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-events-auto bg-background/95 backdrop-blur"
              onClick={reset}
            >
              <IconRefresh data-icon="inline-start" />
              Clear & redraw
            </Button>
            {isDirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="pointer-events-auto bg-background/95 backdrop-blur"
                onClick={restoreOriginal}
              >
                <IconHistory data-icon="inline-start" />
                Restore original
              </Button>
            ) : null}
          </div>
        </div>

        {/* SIDE PANEL */}
        <aside className="flex w-full shrink-0 flex-col gap-5 border-t bg-background p-5 lg:w-96 lg:border-l lg:border-t-0">
          <header className="flex items-start gap-3">
            <GeofenceSwatch color={geofence.color} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Edit shape
              </span>
              <h1 className="font-heading text-xl font-medium leading-tight tracking-tight">
                {geofence.name}
              </h1>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Currently rev {geofence.shapeRevision}
              </span>
            </div>
          </header>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The current shape is shown faded on the map for reference. Click
            "Clear & redraw" to draw a fresh boundary, or adjust the circle
            radius below.
          </p>

          {/* Shape kind toggle */}
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Shape
            </span>
            <div className="grid grid-cols-2 gap-1.5 border bg-muted/30 p-1 ring-1 ring-foreground/5">
              <ShapeButton
                active={kind === "polygon"}
                onClick={() => switchKind("polygon")}
                icon={<IconPolygon className="size-3.5" />}
                label="Polygon"
                hint="Click vertices, dbl-click close"
              />
              <ShapeButton
                active={kind === "circle"}
                onClick={() => switchKind("circle")}
                icon={<IconCircle className="size-3.5" />}
                label="Circle"
                hint="Click center, set radius"
              />
            </div>
          </div>

          {/* Circle radius */}
          {kind === "circle" && center ? (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Radius
              </span>
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
          ) : null}

          {/* Live readout */}
          <div className="flex flex-col gap-2 border bg-muted/20 px-3 py-2.5 ring-1 ring-foreground/5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Status
            </span>
            <p className="text-[11px] leading-relaxed">
              {!isDirty ? (
                <span className="text-muted-foreground">
                  Shape unchanged from rev {geofence.shapeRevision}.
                </span>
              ) : !shapeReady ? (
                <span className="text-amber-700 dark:text-amber-300">
                  {kind === "polygon"
                    ? `${vertices.length} vertices placed — need 3+ and double-click to close.`
                    : "Click on the map to set the circle's center."}
                </span>
              ) : (
                <span className="text-emerald-700 dark:text-emerald-300">
                  Ready to save · creates rev{" "}
                  <span className="font-mono tabular-nums">
                    {geofence.shapeRevision + 1}
                  </span>
                </span>
              )}
            </p>
          </div>

          {serverError ? (
            <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive ring-1 ring-foreground/5">
              <IconAlertCircle className="size-3.5 shrink-0" />
              {serverError}
            </div>
          ) : null}

          <div className="mt-auto flex items-center gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate(`/geofences/${geofence.id}`)}
              disabled={isSubmitting}
            >
              <IconX data-icon="inline-start" />
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void onSave()}
              disabled={isSubmitting || !shapeReady || !isDirty}
              className="flex-1"
            >
              {isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconDeviceFloppy data-icon="inline-start" />
              )}
              {isSubmitting ? "Saving…" : "Save shape"}
            </Button>
          </div>
        </aside>
      </div>
    </AppShell>
  )
}

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
