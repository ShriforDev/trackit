import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import {
  IconAlertCircle,
  IconBroadcast,
  IconClockHour4,
  IconRefresh,
  IconRoute,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { GeofenceSwatch } from "@/components/ui/geofence-swatch"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { eventsApi } from "@/lib/geofences-client"
import { useGeofenceEvents } from "@/lib/fleet-stream"
import { cn } from "@/lib/utils"

import { DEVICE_COLORS } from "@trackit/shared"
import type { GeofenceColorId } from "@trackit/shared/geofence"

import { useGeofencesIndex } from "./use-event-display"

interface ActiveRow {
  deviceId: string
  deviceName: string
  deviceColor: string
  geofenceId: string
  geofenceName: string
  geofenceColor: string
  insideSince: string | null
  lastFix: { lat: number; lon: number; time: string } | null
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(0, Math.floor(ms / 1000))}s`
  const totalMin = Math.floor(ms / 60_000)
  if (totalMin < 60) return `${totalMin}m`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h < 24) return m === 0 ? `${h}h` : `${h}h ${m}m`
  const d = Math.floor(h / 24)
  const remH = h % 24
  return remH === 0 ? `${d}d` : `${d}d ${remH}h`
}

function deviceHexFor(id: string): string {
  return DEVICE_COLORS.find((c) => c.id === id)?.hex ?? "#737373"
}

export function LiveSnapshot() {
  const [rows, setRows] = useState<ActiveRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const { byId: geofencesById } = useGeofencesIndex()
  const { latestEvent, lastEventReceivedAt, status } = useGeofenceEvents()

  // 1-second tick to refresh duration counters in place.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  async function load() {
    setIsLoading(true)
    try {
      const data = await eventsApi.active()
      setRows(data as ActiveRow[])
      setError(null)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't load live state."
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  // Refresh on every event — cheaper than recomputing locally and we
  // get authoritative state including server-side dwell flags.
  useEffect(() => {
    if (!latestEvent) return
    void load()
  }, [latestEvent, lastEventReceivedAt])

  // Group rows by geofence
  const grouped = useMemo(() => {
    if (!rows) return []
    const map = new Map<string, ActiveRow[]>()
    for (const r of rows) {
      const arr = map.get(r.geofenceId) ?? []
      arr.push(r)
      map.set(r.geofenceId, arr)
    }
    return Array.from(map.entries()).map(([geofenceId, items]) => ({
      geofenceId,
      geofenceName: items[0]?.geofenceName ?? "Geofence",
      geofenceColor: items[0]?.geofenceColor ?? "graphite",
      items: items.sort((a, b) => {
        const ta = a.insideSince ? new Date(a.insideSince).getTime() : 0
        const tb = b.insideSince ? new Date(b.insideSince).getTime() : 0
        return tb - ta
      }),
    }))
  }, [rows])

  const totalInside = rows?.length ?? 0
  const distinctZones = grouped.length

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b pb-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              status === "live" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
            )}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {status === "live" ? "Live" : status}
          </span>
        </div>
        <span className="text-xs">
          <span className="font-mono tabular-nums">{totalInside}</span>{" "}
          {totalInside === 1 ? "device" : "devices"} ·{" "}
          <span className="font-mono tabular-nums">{distinctZones}</span>{" "}
          {distinctZones === 1 ? "zone" : "zones"}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => void load()}
          disabled={isLoading}
        >
          <IconRefresh
            data-icon="inline-start"
            className={isLoading ? "animate-spin" : ""}
          />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive ring-1 ring-foreground/5">
          <IconAlertCircle className="size-3.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {!rows && isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : null}

      {rows && rows.length === 0 ? (
        <EmptyState
          icon={<IconBroadcast className="size-5" />}
          title="No devices currently inside any geofence"
          description="As soon as a tracked device crosses into a boundary, it will appear here in real time."
        />
      ) : null}

      {grouped.map((g) => {
        const geo = geofencesById.get(g.geofenceId)
        const dwellThreshold = geo?.dwellThresholdMin ?? 0
        return (
          <section
            key={g.geofenceId}
            className="border bg-background ring-1 ring-foreground/5"
          >
            <header
              className="flex items-center gap-3 border-b px-4 py-3"
              style={{
                borderTopColor: undefined,
              }}
            >
              <GeofenceSwatch
                color={(g.geofenceColor as GeofenceColorId) ?? "graphite"}
                size="md"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium leading-tight">
                  {g.geofenceName}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {g.items.length} inside
                  {dwellThreshold > 0 ? ` · dwell ${dwellThreshold}m` : ""}
                </span>
              </div>
              <Link
                to={`/geofences/${g.geofenceId}`}
                className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
              >
                <IconRoute className="size-3" />
                Open
              </Link>
            </header>
            <ul className="divide-y">
              {g.items.map((r) => {
                const insideMs = r.insideSince
                  ? Math.max(0, now - new Date(r.insideSince).getTime())
                  : 0
                const dwellHit =
                  dwellThreshold > 0 && insideMs >= dwellThreshold * 60_000
                return (
                  <li
                    key={`${r.deviceId}-${r.geofenceId}`}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <span
                      aria-hidden
                      className="size-3 shrink-0 ring-1 ring-foreground/15"
                      style={{
                        backgroundColor: deviceHexFor(r.deviceColor),
                      }}
                    />
                    <span className="truncate text-xs font-medium">
                      {r.deviceName}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      {dwellHit ? (
                        <span className="flex items-center gap-1 border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
                          <IconClockHour4 className="size-3" /> Dwell
                        </span>
                      ) : null}
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        inside for{" "}
                        <span className="text-foreground tabular-nums">
                          {formatDuration(insideMs)}
                        </span>
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
