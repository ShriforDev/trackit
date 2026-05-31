import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router"
import {
  IconAlertCircle,
  IconArrowLeft,
  IconChevronRight,
  IconClock,
  IconCompass,
  IconGauge,
  IconMap,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBackFilled,
  IconPlayerSkipForwardFilled,
  IconRoute,
} from "@tabler/icons-react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import {
  DEVICE_COLORS,
  type Device,
  type DeviceColorId,
  type LocationHistoryRow,
} from "@trackit/shared"

// ----- constants -----

const PLAYBACK_TICK_MS = 50
const PLAYBACK_SPEEDS = [1, 2, 4, 8, 16] as const

type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

type PresetId = "1h" | "24h" | "7d" | "custom"

interface DateRange {
  from: Date
  to: Date
  preset: PresetId
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function makePreset(preset: Exclude<PresetId, "custom">): DateRange {
  const to = new Date()
  const ms = preset === "1h" ? HOUR : preset === "24h" ? DAY : 7 * DAY
  return { from: new Date(to.getTime() - ms), to, preset }
}

const PRESETS: { id: Exclude<PresetId, "custom">; label: string }[] = [
  { id: "1h", label: "Last hour" },
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
]

// ----- helpers -----

function colorHexFor(id: string): string {
  return DEVICE_COLORS.find((c) => c.id === id)?.hex ?? "#737373"
}

/**
 * Haversine distance between two lat/lon points in meters.
 * Good enough for any per-segment ground distance we'll see.
 */
function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function formatDuration(ms: number): string {
  if (ms < 0) return "—"
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ${sec % 60}s`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ${min % 60}m`
  const days = Math.floor(hr / 24)
  return `${days}d ${hr % 24}h`
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(2)} km`
}

function formatSpeed(mps: number | null): string {
  if (mps === null || !Number.isFinite(mps)) return "—"
  return `${(mps * 3.6).toFixed(1)} km/h`
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function toLocalDatetimeInput(d: Date): string {
  // "yyyy-MM-ddTHH:mm" — what <input type="datetime-local"> wants.
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ----- page -----

export function DeviceHistoryPage() {
  const { id } = useParams<{ id: string }>()
  const [device, setDevice] = useState<Device | null>(null)
  const [deviceError, setDeviceError] = useState<string | null>(null)

  const [range, setRange] = useState<DateRange>(() => makePreset("24h"))

  // Server returns DESC (newest first); we sort ASC for the timeline.
  const [points, setPoints] = useState<LocationHistoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const [scrubIndex, setScrubIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)

  const requestSeqRef = useRef(0)

  // Load device metadata once.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    api
      .get<Device>(`/devices/${id}`)
      .then((d) => {
        if (!cancelled) setDevice(d)
      })
      .catch((err) => {
        if (cancelled) return
        const msg =
          err instanceof ApiError
            ? err.status === 403
              ? "You don't have access to this device."
              : err.status === 404
                ? "This device doesn't exist or has been deleted."
                : err.message
            : "Couldn't load this device."
        setDeviceError(msg)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // Reload history whenever range or id changes.
  useEffect(() => {
    if (!id) return
    const seq = ++requestSeqRef.current
    setIsLoading(true)
    setHistoryError(null)
    setIsPlaying(false)
    setScrubIndex(0)

    api
      .get<LocationHistoryRow[]>(
        `/devices/${id}/history?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`
      )
      .then((rows) => {
        if (seq !== requestSeqRef.current) return
        // API returns newest first; reverse for timeline ordering.
        const ascending = [...rows].sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        )
        setPoints(ascending)
      })
      .catch((err) => {
        if (seq !== requestSeqRef.current) return
        const msg =
          err instanceof ApiError
            ? err.message
            : "Couldn't load history for this range."
        setHistoryError(msg)
        setPoints([])
      })
      .finally(() => {
        if (seq === requestSeqRef.current) setIsLoading(false)
      })
  }, [id, range])

  // Playback ticker.
  useEffect(() => {
    if (!isPlaying) return
    if (points.length < 2) {
      setIsPlaying(false)
      return
    }
    const handle = window.setInterval(() => {
      setScrubIndex((i) => {
        const next = i + speed
        if (next >= points.length - 1) {
          setIsPlaying(false)
          return points.length - 1
        }
        return next
      })
    }, PLAYBACK_TICK_MS)
    return () => window.clearInterval(handle)
  }, [isPlaying, speed, points.length])

  // Cap scrub index when points shrink (range change).
  useEffect(() => {
    if (scrubIndex > 0 && scrubIndex >= points.length) {
      setScrubIndex(Math.max(0, points.length - 1))
    }
  }, [points.length, scrubIndex])

  const stats = useMemo(() => computeStats(points), [points])

  // ----- early states -----

  if (!id) return null

  if (deviceError) {
    return (
      <AppShell
        breadcrumbs={[
          { label: "Devices", to: "/devices" },
          { label: "History" },
        ]}
        flush
      >
        <ErrorState message={deviceError} />
      </AppShell>
    )
  }

  if (!device) {
    return (
      <AppShell
        breadcrumbs={[
          { label: "Devices", to: "/devices" },
          { label: "History" },
        ]}
        flush
      >
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      </AppShell>
    )
  }

  const color = colorHexFor(device.color as DeviceColorId)

  return (
    <AppShell
      breadcrumbs={[
        { label: "Devices", to: "/devices" },
        { label: device.name, to: `/devices/${device.id}` },
        { label: "History" },
      ]}
      flush
    >
      <PageBar device={device} range={range} onRangeChange={setRange} />

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Map */}
        <div className="relative h-[60vh] flex-1 lg:h-auto">
          {isLoading ? (
            <div className="absolute inset-0 z-[1000] grid place-items-center bg-background/60 backdrop-blur-sm">
              <Spinner />
            </div>
          ) : null}

          {historyError ? (
            <div className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2 border border-destructive/40 bg-background px-3 py-2 text-xs text-destructive shadow ring-1 ring-foreground/10">
              <IconAlertCircle data-icon="inline-start" />
              {historyError}
            </div>
          ) : null}

          {!isLoading && points.length === 0 && !historyError ? (
            <div className="absolute inset-0 z-[1000] grid place-items-center bg-background/40">
              <EmptyState range={range} />
            </div>
          ) : null}

          <HistoryMap points={points} color={color} cursorIndex={scrubIndex} />
        </div>

        {/* Right rail (stats) */}
        <aside className="flex shrink-0 flex-col gap-4 border-t bg-background p-5 lg:w-80 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-3 ring-1 ring-foreground/10"
              style={{ backgroundColor: color }}
            />
            <h2 className="text-sm font-medium tracking-tight">
              {device.name}
            </h2>
          </div>
          <StatsGrid stats={stats} />
          <CurrentPointPanel
            points={points}
            scrubIndex={scrubIndex}
            color={color}
          />
        </aside>
      </div>

      <PlaybackDock
        points={points}
        index={scrubIndex}
        onSeek={setScrubIndex}
        isPlaying={isPlaying}
        onTogglePlay={() => {
          if (points.length < 2) return
          setIsPlaying((p) => {
            // Auto-rewind to start if the user pressed play at the end.
            if (!p && scrubIndex >= points.length - 1) setScrubIndex(0)
            return !p
          })
        }}
        speed={speed}
        onCycleSpeed={() => {
          const idx = PLAYBACK_SPEEDS.indexOf(speed)
          setSpeed(PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length])
        }}
      />
    </AppShell>
  )
}

function PageBar({
  device,
  range,
  onRangeChange,
}: {
  device: Device
  range: DateRange
  onRangeChange: (r: DateRange) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-6 py-3">
      <div className="flex items-center gap-3">
        <Button
          render={<Link to={`/devices/${device.id}`} />}
          variant="ghost"
          size="sm"
          className="-ml-2"
        >
          <IconArrowLeft data-icon="inline-start" />
          Back to device
        </Button>
        <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <IconRoute className="size-3.5" />
          History
          <IconChevronRight className="size-3 opacity-50" />
          <span className="font-medium text-foreground">{device.name}</span>
        </div>
      </div>
      <RangePicker range={range} onChange={onRangeChange} />
    </div>
  )
}

// ----- range picker -----

function RangePicker({
  range,
  onChange,
}: {
  range: DateRange
  onChange: (r: DateRange) => void
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(toLocalDatetimeInput(range.from))
  const [customTo, setCustomTo] = useState(toLocalDatetimeInput(range.to))
  const [customError, setCustomError] = useState<string | null>(null)

  function applyPreset(id: Exclude<PresetId, "custom">) {
    const r = makePreset(id)
    onChange(r)
    setCustomFrom(toLocalDatetimeInput(r.from))
    setCustomTo(toLocalDatetimeInput(r.to))
    setCustomOpen(false)
    setCustomError(null)
  }

  function applyCustom() {
    const from = new Date(customFrom)
    const to = new Date(customTo)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      setCustomError("Pick valid start and end times.")
      return
    }
    if (from >= to) {
      setCustomError("Start must be before end.")
      return
    }
    setCustomError(null)
    onChange({ from, to, preset: "custom" })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={range.preset === p.id ? "default" : "outline"}
            onClick={() => applyPreset(p.id)}
          >
            {p.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant={range.preset === "custom" ? "default" : "outline"}
          onClick={() => setCustomOpen((o) => !o)}
        >
          Custom
        </Button>
      </div>

      {customOpen ? (
        <div className="flex flex-col items-end gap-2 border bg-background p-3 ring-1 ring-foreground/10">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              From
              <input
                type="datetime-local"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 border bg-background px-2 text-xs ring-1 ring-foreground/10 focus:outline-none focus:ring-foreground/30"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              To
              <input
                type="datetime-local"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 border bg-background px-2 text-xs ring-1 ring-foreground/10 focus:outline-none focus:ring-foreground/30"
              />
            </label>
            <Button size="sm" onClick={applyCustom}>
              Apply
            </Button>
          </div>
          {customError ? (
            <span className="text-[11px] text-destructive">{customError}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ----- map -----

const DEFAULT_CENTER: [number, number] = [20, 0]
const DEFAULT_ZOOM = 2

function HistoryMap({
  points,
  color,
  cursorIndex,
}: {
  points: LocationHistoryRow[]
  color: string
  cursorIndex: number
}) {
  const positions = useMemo<[number, number][]>(
    () => points.map((p) => [p.latitude, p.longitude]),
    [points]
  )

  const cursor = points[cursorIndex]
  const start = points[0]
  const end = points[points.length - 1]

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: "#0a0a0a" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {positions.length > 1 ? (
        <Polyline
          positions={positions}
          pathOptions={{ color, weight: 4, opacity: 0.7, lineCap: "round" }}
        />
      ) : null}

      {start ? (
        <CircleMarker
          center={[start.latitude, start.longitude]}
          radius={6}
          pathOptions={{
            color: "#fff",
            weight: 2,
            fillColor: "#10b981",
            fillOpacity: 1,
          }}
        >
          <Tooltip>Start · {formatTimestamp(start.time)}</Tooltip>
        </CircleMarker>
      ) : null}

      {end && end !== start ? (
        <CircleMarker
          center={[end.latitude, end.longitude]}
          radius={6}
          pathOptions={{
            color: "#fff",
            weight: 2,
            fillColor: "#ef4444",
            fillOpacity: 1,
          }}
        >
          <Tooltip>End · {formatTimestamp(end.time)}</Tooltip>
        </CircleMarker>
      ) : null}

      {cursor ? (
        <CircleMarker
          center={[cursor.latitude, cursor.longitude]}
          radius={9}
          pathOptions={{
            color: "#fff",
            weight: 3,
            fillColor: color,
            fillOpacity: 1,
          }}
        >
          <Tooltip permanent direction="top" offset={L.point(0, -10)}>
            {formatTimestamp(cursor.time)}
          </Tooltip>
        </CircleMarker>
      ) : null}

      <FitToPath positions={positions} />
    </MapContainer>
  )
}

function FitToPath({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  const lastFitRef = useRef<string | null>(null)

  useEffect(() => {
    if (positions.length === 0) return
    // Re-fit whenever the path itself changes (range change). Recompute a
    // signature so we don't re-fit on cursor moves.
    const sig = `${positions.length}:${positions[0][0]},${positions[0][1]}:${positions.at(-1)?.join(",")}`
    if (sig === lastFitRef.current) return
    lastFitRef.current = sig

    if (positions.length === 1) {
      map.setView(positions[0], 15)
      return
    }
    const bounds = L.latLngBounds(positions)
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 })
  }, [positions, map])

  return null
}

// ----- empty / error -----

function EmptyState({ range }: { range: DateRange }) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-3 border bg-background px-6 py-8 text-center ring-1 ring-foreground/10">
      <IconMap className="size-6 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">No fixes in this range</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Nothing recorded between{" "}
          <span className="font-medium text-foreground">
            {formatTimestamp(range.from.toISOString())}
          </span>{" "}
          and{" "}
          <span className="font-medium text-foreground">
            {formatTimestamp(range.to.toISOString())}
          </span>
          . Try a wider range or start tracking the device from its detail
          page.
        </p>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="flex w-full flex-col items-center gap-4 border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
        <IconAlertCircle className="size-6 text-destructive" />
        <div className="flex flex-col gap-1">
          <h1 className="text-base font-medium">Couldn&apos;t open history</h1>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
        <Button render={<Link to="/devices" />} variant="outline" size="sm">
          <IconArrowLeft data-icon="inline-start" />
          Back to devices
        </Button>
      </div>
    </main>
  )
}

// ----- stats -----

interface PathStats {
  totalDistanceM: number
  durationMs: number
  avgSpeedMps: number | null
  maxSpeedMps: number | null
  pointCount: number
  firstAt: string | null
  lastAt: string | null
}

function computeStats(points: LocationHistoryRow[]): PathStats {
  if (points.length === 0) {
    return {
      totalDistanceM: 0,
      durationMs: 0,
      avgSpeedMps: null,
      maxSpeedMps: null,
      pointCount: 0,
      firstAt: null,
      lastAt: null,
    }
  }

  let total = 0
  let maxReportedSpeed = -Infinity
  let maxSegmentSpeed = -Infinity

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const cur = points[i]
    const seg = haversineMeters(
      prev.latitude,
      prev.longitude,
      cur.latitude,
      cur.longitude
    )
    total += seg

    if (cur.speedMps !== null && Number.isFinite(cur.speedMps)) {
      if (cur.speedMps > maxReportedSpeed) maxReportedSpeed = cur.speedMps
    }

    const dt = (new Date(cur.time).getTime() - new Date(prev.time).getTime()) / 1000
    if (dt > 0.1) {
      const segSpeed = seg / dt
      if (segSpeed > maxSegmentSpeed) maxSegmentSpeed = segSpeed
    }
  }

  const first = points[0]
  const last = points[points.length - 1]
  const durationMs =
    new Date(last.time).getTime() - new Date(first.time).getTime()
  const avg = durationMs > 0 ? (total / durationMs) * 1000 : null

  // Prefer reported speed when it exists; fall back to segment-derived.
  const max =
    maxReportedSpeed !== -Infinity
      ? maxReportedSpeed
      : maxSegmentSpeed !== -Infinity
        ? maxSegmentSpeed
        : null

  return {
    totalDistanceM: total,
    durationMs,
    avgSpeedMps: avg,
    maxSpeedMps: max,
    pointCount: points.length,
    firstAt: first.time,
    lastAt: last.time,
  }
}

function StatsGrid({ stats }: { stats: PathStats }) {
  return (
    <dl className="grid grid-cols-2 gap-3">
      <Stat
        icon={IconRoute}
        label="Distance"
        value={formatDistance(stats.totalDistanceM)}
      />
      <Stat
        icon={IconClock}
        label="Duration"
        value={formatDuration(stats.durationMs)}
      />
      <Stat
        icon={IconGauge}
        label="Avg speed"
        value={formatSpeed(stats.avgSpeedMps)}
      />
      <Stat
        icon={IconGauge}
        label="Max speed"
        value={formatSpeed(stats.maxSpeedMps)}
      />
      <Stat
        icon={IconCompass}
        label="Fixes"
        value={stats.pointCount.toLocaleString()}
      />
      <Stat
        icon={IconClock}
        label="From"
        value={stats.firstAt ? formatTimestamp(stats.firstAt) : "—"}
        small
      />
    </dl>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  small,
}: {
  icon: typeof IconRoute
  label: string
  value: string
  small?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 border bg-muted/30 p-2.5 ring-1 ring-foreground/5">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </span>
      <span
        className={cn(
          "font-medium tabular-nums",
          small ? "text-[11px]" : "text-sm"
        )}
      >
        {value}
      </span>
    </div>
  )
}

function CurrentPointPanel({
  points,
  scrubIndex,
  color,
}: {
  points: LocationHistoryRow[]
  scrubIndex: number
  color: string
}) {
  const point = points[scrubIndex]
  if (!point) return null

  const first = points[0]
  const offsetMs = first
    ? new Date(point.time).getTime() - new Date(first.time).getTime()
    : 0

  return (
    <section className="flex flex-col gap-2 border bg-background p-3 ring-1 ring-foreground/5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Cursor
        </span>
        <Badge
          variant="outline"
          className="gap-1"
          style={{ borderColor: `${color}66` }}
        >
          {scrubIndex + 1} / {points.length}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <span className="text-muted-foreground">Time</span>
        <span className="text-right tabular-nums">
          {formatTimestamp(point.time)}
        </span>
        <span className="text-muted-foreground">Offset</span>
        <span className="text-right tabular-nums">
          +{formatDuration(offsetMs)}
        </span>
        <span className="text-muted-foreground">Lat / Lon</span>
        <span className="text-right tabular-nums">
          {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
        </span>
        {point.speedMps !== null ? (
          <>
            <span className="text-muted-foreground">Speed</span>
            <span className="text-right tabular-nums">
              {formatSpeed(point.speedMps)}
            </span>
          </>
        ) : null}
        {point.accuracyM !== null ? (
          <>
            <span className="text-muted-foreground">Accuracy</span>
            <span className="text-right tabular-nums">
              ±{Math.round(point.accuracyM)}m
            </span>
          </>
        ) : null}
        {point.altitudeM !== null ? (
          <>
            <span className="text-muted-foreground">Altitude</span>
            <span className="text-right tabular-nums">
              {Math.round(point.altitudeM)}m
            </span>
          </>
        ) : null}
        {point.batteryPct !== null ? (
          <>
            <span className="text-muted-foreground">Battery</span>
            <span className="text-right tabular-nums">{point.batteryPct}%</span>
          </>
        ) : null}
      </div>
    </section>
  )
}

// ----- playback dock -----

function PlaybackDock({
  points,
  index,
  onSeek,
  isPlaying,
  onTogglePlay,
  speed,
  onCycleSpeed,
}: {
  points: LocationHistoryRow[]
  index: number
  onSeek: (i: number) => void
  isPlaying: boolean
  onTogglePlay: () => void
  speed: PlaybackSpeed
  onCycleSpeed: () => void
}) {
  const disabled = points.length < 2

  function step(by: number) {
    onSeek(Math.max(0, Math.min(points.length - 1, index + by)))
  }

  const cur = points[index]
  const first = points[0]

  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t bg-background px-6 py-3">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSeek(0)}
          disabled={disabled}
          aria-label="Restart"
        >
          <IconPlayerSkipBackFilled className="size-3.5" />
        </Button>
        <Button
          size="sm"
          onClick={onTogglePlay}
          disabled={disabled}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <IconPlayerPauseFilled data-icon="inline-start" />
          ) : (
            <IconPlayerPlayFilled data-icon="inline-start" />
          )}
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => step(1)}
          disabled={disabled || index >= points.length - 1}
          aria-label="Step forward"
        >
          <IconPlayerSkipForwardFilled className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onCycleSpeed}
          disabled={disabled}
          aria-label="Cycle speed"
          className="min-w-[3rem] justify-center font-mono"
        >
          {speed}×
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <input
          type="range"
          min={0}
          max={Math.max(0, points.length - 1)}
          step={1}
          value={index}
          onChange={(e) => onSeek(Number(e.target.value))}
          disabled={disabled}
          className="h-1.5 w-full cursor-pointer appearance-none bg-muted accent-foreground"
          aria-label="Playback position"
        />
        <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>
            {first ? formatTimestamp(first.time) : "—"}
          </span>
          <span className="font-medium text-foreground">
            {cur ? formatTimestamp(cur.time) : "—"}
          </span>
          <span>
            {points.length > 0
              ? formatTimestamp(points[points.length - 1].time)
              : "—"}
          </span>
        </div>
      </div>
    </div>
  )
}
