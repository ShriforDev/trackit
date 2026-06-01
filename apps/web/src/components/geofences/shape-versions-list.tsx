import { useEffect, useMemo, useState } from "react"
import {
  IconAlertCircle,
  IconCheck,
  IconCircle,
  IconHistory,
  IconPolygon,
  IconRefresh,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { geofencesApi, type ShapeVersionDTO } from "@/lib/geofences-client"
import { cn } from "@/lib/utils"

import {
  isCircleShape,
  isPolygonShape,
} from "@trackit/shared/geofence"

interface ShapeVersionsListProps {
  geofenceId: string
  /** The currently-active revision; used to mark the "current" row. */
  currentRevision: number
}

function formatRadius(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km`
  return `${m} m`
}

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function describeShape(shape: ShapeVersionDTO["shape"]): string {
  if (isCircleShape(shape)) {
    return `Circle · ${formatRadius(shape.radiusM)}`
  }
  if (isPolygonShape(shape)) {
    return `Polygon · ${shape.coordinates.length} vertices`
  }
  return "Unknown shape"
}

/**
 * Compute approximate polygon area on a sphere (m²). Mirrors the
 * helper used by the editor — duplicated here to avoid pulling
 * editor module dependencies into the detail page.
 */
function polygonAreaM2(coords: [number, number][]): number {
  if (coords.length < 3) return 0
  const R = 6_371_000
  let area = 0
  for (let i = 0; i < coords.length; i++) {
    const [x1, y1] = coords[i]
    const [x2, y2] = coords[(i + 1) % coords.length]
    area +=
      ((x2 - x1) * Math.PI) /
      180 *
      (2 + Math.sin((y1 * Math.PI) / 180) + Math.sin((y2 * Math.PI) / 180))
  }
  return Math.abs((area * R * R) / 2)
}

function formatArea(m2: number): string {
  if (m2 < 10_000) return `${Math.round(m2)} m²`
  if (m2 < 1_000_000) return `${(m2 / 10_000).toFixed(1)} ha`
  return `${(m2 / 1_000_000).toFixed(2)} km²`
}

export function ShapeVersionsList({
  geofenceId,
  currentRevision,
}: ShapeVersionsListProps) {
  const [versions, setVersions] = useState<ShapeVersionDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function load() {
    setIsLoading(true)
    try {
      const rows = await geofencesApi.shapeVersions(geofenceId)
      // Newest revision first
      setVersions(rows.slice().sort((a, b) => b.revision - a.revision))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load versions.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [geofenceId])

  // Build per-version metadata with deltas to the previous revision
  const enriched = useMemo(() => {
    if (!versions) return []
    // versions[] is descending by revision; for each row, find next-older.
    return versions.map((v, i) => {
      const previous = versions[i + 1]
      let delta: string | null = null
      if (previous) {
        if (
          isPolygonShape(v.shape) &&
          isPolygonShape(previous.shape)
        ) {
          const dV = v.shape.coordinates.length - previous.shape.coordinates.length
          if (dV !== 0) delta = `${dV > 0 ? "+" : ""}${dV} vertices`
        } else if (
          isCircleShape(v.shape) &&
          isCircleShape(previous.shape)
        ) {
          const dR = v.shape.radiusM - previous.shape.radiusM
          if (dR !== 0) {
            delta = `${dR > 0 ? "+" : ""}${formatRadius(Math.abs(dR))} radius`
            if (dR < 0) delta = `-${formatRadius(Math.abs(dR))} radius`
          }
        } else {
          delta = `Shape kind changed (${previous.shape.kind} → ${v.shape.kind})`
        }
      }

      return { ...v, delta }
    })
  }, [versions])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 border-b pb-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Shape history
        </span>
        <span className="text-xs">
          <span className="font-mono tabular-nums">{versions?.length ?? "—"}</span>{" "}
          {(versions?.length ?? 0) === 1 ? "revision" : "revisions"}
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

      {!versions && isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : null}

      {versions && versions.length === 0 ? (
        <EmptyState
          icon={<IconHistory className="size-5" />}
          title="No revision history"
          description="Shape revisions appear here when an admin edits the geofence's shape."
        />
      ) : null}

      {enriched.length > 0 ? (
        <ol className="flex flex-col border bg-background ring-1 ring-foreground/5 divide-y">
          {enriched.map((v) => {
            const isCurrent = v.revision === currentRevision
            const ShapeIcon = isCircleShape(v.shape) ? IconCircle : IconPolygon
            const meta = describeShape(v.shape)
            const areaSuffix =
              isPolygonShape(v.shape) && v.shape.coordinates.length >= 3
                ? ` · ${formatArea(polygonAreaM2(v.shape.coordinates))}`
                : ""

            return (
              <li
                key={v.id}
                className={cn(
                  "relative flex items-start gap-4 px-4 py-3",
                  isCurrent ? "bg-emerald-500/5" : ""
                )}
              >
                {isCurrent ? (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px] bg-emerald-500"
                  />
                ) : null}

                <span className="flex shrink-0 items-center justify-center">
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center border ring-1 ring-foreground/5",
                      isCurrent
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted/40 text-muted-foreground"
                    )}
                  >
                    <ShapeIcon className="size-4" strokeWidth={1.8} />
                  </span>
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-xs font-medium tabular-nums">
                      Revision {v.revision}
                    </span>
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
                        <IconCheck className="size-3" />
                        Current
                      </span>
                    ) : null}
                    {v.revision === 1 ? (
                      <span className="inline-flex items-center gap-1 border bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                        Initial
                      </span>
                    ) : null}
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {meta}
                    {areaSuffix}
                    {v.delta ? ` · ${v.delta}` : ""}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
                    {formatAbsoluteTime(v.createdAt)}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      ) : null}
    </div>
  )
}
