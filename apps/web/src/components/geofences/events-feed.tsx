import { useEffect, useMemo, useRef, useState } from "react"
import {
  IconAlertCircle,
  IconCalendar,
  IconChevronDown,
  IconRefresh,
  IconWaveSawTool,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"
import { useGeofenceEvents } from "@/lib/fleet-stream"
import { eventsApi, type EventsQuery } from "@/lib/geofences-client"
import { cn } from "@/lib/utils"

import {
  GEOFENCE_EVENT_TYPE_NAMES,
  type GeofenceEventDTO,
  type GeofenceEventTypeName,
} from "@trackit/shared/geofence"

import { groupEventsByDay, presentationFor } from "./event-presentation"
import { EventRow } from "./event-row"
import { useEventDisplay, useGeofencesIndex } from "./use-event-display"

type RangeKey = "1h" | "24h" | "7d" | "30d"

const RANGE_OPTIONS: { key: RangeKey; label: string; ms: number }[] = [
  { key: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
  { key: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
]

const PAGE_SIZE = 100

interface EventsFeedProps {
  /** When non-null, scopes to a single geofence (used by /geofences/:id). */
  geofenceId?: string
}

export function EventsFeed({ geofenceId }: EventsFeedProps) {
  const [range, setRange] = useState<RangeKey>("24h")
  const [activeTypes, setActiveTypes] = useState<Set<GeofenceEventTypeName>>(
    () => new Set(GEOFENCE_EVENT_TYPE_NAMES as readonly GeofenceEventTypeName[])
  )

  const [events, setEvents] = useState<GeofenceEventDTO[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { byId: geofencesById } = useGeofencesIndex()
  const { latestEvent, lastEventReceivedAt, clearUnreadEvents } =
    useGeofenceEvents()

  const lastSeenWsRef = useRef<number | null>(null)

  // Load page from server when filters change.
  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const rangeOpt = RANGE_OPTIONS.find((r) => r.key === range)!
        const since = new Date(Date.now() - rangeOpt.ms)
        const q: EventsQuery = {
          since,
          limit: PAGE_SIZE,
          types: Array.from(activeTypes),
        }
        if (geofenceId) q.geofenceIds = [geofenceId]
        const rows = await eventsApi.list(q)
        if (cancelled) return
        setEvents(rows)
        setHasMore(rows.length === PAGE_SIZE)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : "Couldn't load events.")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    clearUnreadEvents()

    return () => {
      cancelled = true
    }
  }, [range, geofenceId, activeTypes, clearUnreadEvents])

  // Prepend live events as they stream in (only ones inside the active filter set).
  useEffect(() => {
    if (!latestEvent || !lastEventReceivedAt) return
    if (lastSeenWsRef.current === lastEventReceivedAt) return
    lastSeenWsRef.current = lastEventReceivedAt

    if (!activeTypes.has(latestEvent.type)) return
    if (geofenceId && latestEvent.geofenceId !== geofenceId) return

    setEvents((prev) => {
      if (!prev) return prev
      // De-duplicate (same time + device + geofence + type)
      if (
        prev.find(
          (e) =>
            e.time === latestEvent.time &&
            e.deviceId === latestEvent.deviceId &&
            e.geofenceId === latestEvent.geofenceId &&
            e.type === latestEvent.type
        )
      ) {
        return prev
      }
      return [latestEvent, ...prev]
    })
  }, [latestEvent, lastEventReceivedAt, activeTypes, geofenceId])

  function toggleType(t: GeofenceEventTypeName) {
    setActiveTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      // Don't allow zero-types — re-add if we just emptied the set
      if (next.size === 0) return prev
      return next
    })
  }

  async function loadMore() {
    if (!events || events.length === 0) return
    const oldest = events[events.length - 1]
    setIsLoading(true)
    try {
      const q: EventsQuery = {
        until: oldest.time,
        limit: PAGE_SIZE,
        types: Array.from(activeTypes),
      }
      if (geofenceId) q.geofenceIds = [geofenceId]
      const rows = await eventsApi.list(q)
      setEvents((prev) => (prev ? [...prev, ...rows] : rows))
      setHasMore(rows.length === PAGE_SIZE)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load more events.")
    } finally {
      setIsLoading(false)
    }
  }

  const grouped = useMemo(
    () => (events ? groupEventsByDay(events) : []),
    [events]
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-4">
        <RangeSelect value={range} onChange={setRange} />
        <div className="h-4 w-px bg-border" />
        <div className="flex flex-wrap items-center gap-1.5">
          {(GEOFENCE_EVENT_TYPE_NAMES as readonly GeofenceEventTypeName[]).map(
            (t) => {
              const active = activeTypes.has(t)
              const pres = presentationFor(t)
              const Icon = pres.icon
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] transition-colors ring-1 ring-foreground/5",
                    active
                      ? cn(pres.bgTone, pres.tone)
                      : "text-muted-foreground/70 hover:bg-muted/40"
                  )}
                >
                  <Icon className="size-3" strokeWidth={1.8} />
                  {pres.label}
                </button>
              )
            }
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setEvents(null)
              setRange((r) => r) // noop; effect already triggers via state set
              // re-trigger by toggling type set ref — simpler: dispatch a manual reload
              void (async () => {
                setIsLoading(true)
                try {
                  const rangeOpt = RANGE_OPTIONS.find((r) => r.key === range)!
                  const since = new Date(Date.now() - rangeOpt.ms)
                  const q: EventsQuery = {
                    since,
                    limit: PAGE_SIZE,
                    types: Array.from(activeTypes),
                  }
                  if (geofenceId) q.geofenceIds = [geofenceId]
                  const rows = await eventsApi.list(q)
                  setEvents(rows)
                  setHasMore(rows.length === PAGE_SIZE)
                  setError(null)
                } catch (err) {
                  setError(
                    err instanceof ApiError ? err.message : "Couldn't reload."
                  )
                } finally {
                  setIsLoading(false)
                }
              })()
            }}
            disabled={isLoading}
          >
            <IconRefresh
              data-icon="inline-start"
              className={isLoading ? "animate-spin" : ""}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive ring-1 ring-foreground/5">
          <IconAlertCircle className="size-3.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* Loading skeleton */}
      {!events && isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : null}

      {/* Empty */}
      {events && events.length === 0 ? (
        <EmptyState
          icon={<IconWaveSawTool className="size-5" />}
          title="No events match"
          description="Try widening the time range or enabling more event types. Events are emitted as devices cross your geofence boundaries."
        />
      ) : null}

      {/* Grouped feed */}
      {grouped.length > 0 ? (
        <div className="flex flex-col gap-6">
          {grouped.map((day) => (
            <section key={day.label} className="flex flex-col">
              <h3 className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <span>{day.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  ({day.events.length})
                </span>
                <span className="h-px flex-1 bg-border" />
              </h3>
              <div className="flex flex-col border bg-background ring-1 ring-foreground/5 divide-y">
                {day.events.map((evt, i) => (
                  <EnrichedEventRow
                    key={`${evt.time}-${evt.deviceId}-${evt.geofenceId}-${evt.type}-${i}`}
                    event={evt}
                    geofencesById={geofencesById}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {/* Pagination */}
      {hasMore ? (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadMore()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconChevronDown data-icon="inline-start" />
            )}
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function EnrichedEventRow({
  event,
  geofencesById,
}: {
  event: GeofenceEventDTO
  geofencesById: ReturnType<typeof useGeofencesIndex>["byId"]
}) {
  const { device, geofence } = useEventDisplay(event, geofencesById)
  return <EventRow event={event} device={device} geofence={geofence} />
}

function RangeSelect({
  value,
  onChange,
}: {
  value: RangeKey
  onChange: (next: RangeKey) => void
}) {
  return (
    <div className="flex items-center gap-1.5 border bg-muted/20 p-0.5 ring-1 ring-foreground/5">
      <span className="flex items-center gap-1 px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <IconCalendar className="size-3" />
      </span>
      {RANGE_OPTIONS.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={active}
            className={cn(
              "px-2.5 py-1 text-[11px] transition-colors",
              active
                ? "bg-background ring-1 ring-foreground/15"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
