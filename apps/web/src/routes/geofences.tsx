import { useEffect, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import {
  IconAlertCircle,
  IconCircle,
  IconLock,
  IconPolygon,
  IconRefresh,
  IconShape,
  IconShieldLock,
  IconTrash,
} from "@tabler/icons-react"

import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { GeofenceSwatch } from "@/components/ui/geofence-swatch"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { useSession } from "@/lib/auth-client"
import { geofencesApi } from "@/lib/geofences-client"
import { useActiveOrg } from "@/lib/use-active-org"
import { cn } from "@/lib/utils"

import {
  type GeofenceDTO,
  isCircleShape,
  isPolygonShape,
} from "@trackit/shared/geofence"
import type { Role } from "@trackit/shared/permissions"

function formatRadius(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km`
  return `${m} m`
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMin = Math.round((Date.now() - then) / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.round(diffH / 24)
  if (diffD < 30) return `${diffD}d ago`
  return new Date(iso).toLocaleDateString()
}

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 border bg-background px-2.5 py-1 ring-1 ring-foreground/5">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-xs font-medium tabular-nums">
        {value}
      </span>
    </div>
  )
}

function GeofenceCard({
  geofence,
  isAdmin,
  onDelete,
}: {
  geofence: GeofenceDTO
  isAdmin: boolean
  onDelete: () => void
}) {
  const ShapeIcon = isCircleShape(geofence.shape) ? IconCircle : IconPolygon
  const shapeMeta = isCircleShape(geofence.shape)
    ? `Circle · ${formatRadius(geofence.shape.radiusM)}`
    : `Polygon · ${
        isPolygonShape(geofence.shape) ? geofence.shape.coordinates.length : 0
      } verts`

  const insideCount = geofence.insideCount ?? 0
  const hasProximity = geofence.proximityBufferM > 0
  const hasDwell = geofence.dwellThresholdMin > 0

  return (
    <article className="group relative flex flex-col gap-3 border bg-background px-4 pb-3 pt-4 ring-1 ring-foreground/5 transition-shadow hover:ring-foreground/10">
      {/* color stripe top */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: hexFor(geofence.color) }}
      />

      <header className="flex items-start gap-3">
        <GeofenceSwatch color={geofence.color} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium leading-tight">
            {geofence.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <ShapeIcon className="size-3" />
            {shapeMeta}
          </p>
        </div>
        <Link
          to={`/geofences/${geofence.id}`}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          Open →
        </Link>
      </header>

      <dl className="grid grid-cols-3 gap-2 border-t pt-3 text-[11px]">
        <div className="flex flex-col gap-0.5">
          <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            Inside
          </dt>
          <dd
            className={cn(
              "font-mono text-base font-medium tabular-nums",
              insideCount > 0 ? "text-emerald-600 dark:text-emerald-400" : ""
            )}
          >
            {insideCount}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            Proximity
          </dt>
          <dd className="font-mono text-base font-medium tabular-nums">
            {hasProximity ? formatRadius(geofence.proximityBufferM) : "—"}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            Dwell
          </dt>
          <dd className="font-mono text-base font-medium tabular-nums">
            {hasDwell ? `${geofence.dwellThresholdMin}m` : "—"}
          </dd>
        </div>
      </dl>

      <footer className="flex items-center justify-between border-t pt-2.5 text-[10px] text-muted-foreground">
        <span className="font-mono uppercase tracking-[0.14em]">
          rev {geofence.shapeRevision} · {formatRelative(geofence.updatedAt)}
        </span>
        {isAdmin ? (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-destructive"
            aria-label={`Delete ${geofence.name}`}
          >
            <IconTrash className="size-3" />
            Delete
          </button>
        ) : (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
            <IconLock className="size-3" />
            Read-only
          </span>
        )}
      </footer>
    </article>
  )
}

// --- color hex resolver (small import-side helper; identical to GeofenceSwatch's) ---
function hexFor(color: string): string {
  // match GEOFENCE_COLORS — duplicated to keep this file standalone, swatch is the source of truth
  const map: Record<string, string> = {
    citrine: "#f59e0b",
    jade: "#047857",
    sapphire: "#2563eb",
    amethyst: "#9333ea",
    carmine: "#dc2626",
    graphite: "#52525b",
  }
  return map[color] ?? "#737373"
}

export function GeofencesPage() {
  const { data: session } = useSession()
  const { activeOrg } = useActiveOrg()
  const [geofences, setGeofences] = useState<GeofenceDTO[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const myMembership = activeOrg?.members?.find(
    (m) => m.userId === session?.user.id
  )
  const myRole = (myMembership?.role ?? "member") as Role
  const isAdmin = myRole === "owner" || myRole === "admin"

  async function load(showSpinner = false): Promise<void> {
    if (showSpinner) setIsRefreshing(true)
    try {
      const rows = await geofencesApi.list()
      setGeofences(rows)
      setLoadError(null)
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Couldn't load geofences."
      )
    } finally {
      if (showSpinner) setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Past events stay attached to it.`)) return
    setDeletingId(id)
    try {
      await geofencesApi.delete(id)
      setGeofences((prev) => prev?.filter((g) => g.id !== id) ?? null)
      toast.success(`Deleted ${name}.`)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't delete geofence."
      )
    } finally {
      setDeletingId(null)
    }
  }

  const totalCount = geofences?.length ?? 0
  const polygonCount =
    geofences?.filter((g) => g.shape.kind === "polygon").length ?? 0
  const circleCount = totalCount - polygonCount
  const insideCount =
    geofences?.reduce((acc, g) => acc + (g.insideCount ?? 0), 0) ?? 0

  return (
    <AppShell breadcrumbs={[{ label: "Geofences" }]}>
      <PageHeader
        eyebrow="Boundaries"
        title="Geofences"
        description={
          isAdmin
            ? "Define polygon or circle areas. Devices in your organization fire enter / exit events as they cross."
            : "Polygon or circle areas defined by your organization. You can see events and current state but only owners and admins can edit."
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isRefreshing}
              onClick={() => void load(true)}
              aria-label="Refresh"
            >
              <IconRefresh
                data-icon="inline-start"
                className={isRefreshing ? "animate-spin" : ""}
              />
              Refresh
            </Button>
            {isAdmin ? (
              <Button render={<Link to="/geofences/new" />} size="sm">
                <IconShape data-icon="inline-start" />
                Create geofence
              </Button>
            ) : null}
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <CountChip label="Total" value={totalCount} />
            <CountChip label="Polygons" value={polygonCount} />
            <CountChip label="Circles" value={circleCount} />
            <CountChip label="Inside now" value={insideCount} />
          </div>
        }
      />

      {/* error */}
      {loadError ? (
        <div className="mt-6 flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive ring-1 ring-foreground/5">
          <IconAlertCircle className="size-3.5 shrink-0" />
          {loadError}
        </div>
      ) : null}

      {/* loading */}
      {!geofences && !loadError ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : null}

      {/* empty */}
      {geofences && geofences.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<IconShape className="size-5" />}
            title="No geofences yet"
            description={
              isAdmin
                ? "Draw a polygon or circle on the map to start watching for entries, exits, approaches, or stays."
                : "Once an owner or admin creates a geofence, you'll see it here and start receiving its events."
            }
            action={
              isAdmin ? (
                <Button render={<Link to="/geofences/new" />} size="sm">
                  <IconShape data-icon="inline-start" />
                  Create geofence
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <IconShieldLock className="size-3.5" />
                  Owner or admin only
                </span>
              )
            }
          />
        </div>
      ) : null}

      {/* grid */}
      {geofences && geofences.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {geofences.map((g) => (
            <GeofenceCard
              key={g.id}
              geofence={g}
              isAdmin={isAdmin}
              onDelete={() => void onDelete(g.id, g.name)}
            />
          ))}
        </div>
      ) : null}

      {deletingId ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 border bg-background px-4 py-2 text-xs ring-1 ring-foreground/10">
            <span className="size-2 animate-pulse rounded-full bg-amber-500" />
            Deleting…
          </div>
        </div>
      ) : null}
    </AppShell>
  )
}
