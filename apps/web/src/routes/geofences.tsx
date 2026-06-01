import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import {
  IconAlertCircle,
  IconBroadcast,
  IconCircle,
  IconList,
  IconPolygon,
  IconRefresh,
  IconShape,
  IconShieldLock,
  IconWaveSawTool,
} from "@tabler/icons-react"

import { DeleteDialog } from "@/components/geofences/delete-dialog"
import { EditSettingsDialog } from "@/components/geofences/edit-settings-dialog"
import { EventsFeed } from "@/components/geofences/events-feed"
import { GeofenceMenu } from "@/components/geofences/geofence-menu"
import { LiveSnapshot } from "@/components/geofences/live-snapshot"
import { NotificationsToggle } from "@/components/geofences/notifications-toggle"
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
import { useFleetStream } from "@/lib/fleet-stream"
import { cn } from "@/lib/utils"

import {
  GEOFENCE_COLORS,
  type GeofenceDTO,
  isCircleShape,
  isPolygonShape,
} from "@trackit/shared/geofence"
import type { Role } from "@trackit/shared/permissions"

type TabKey = "list" | "events" | "live"

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
  onEditSettings,
  onDelete,
}: {
  geofence: GeofenceDTO
  isAdmin: boolean
  onEditSettings: () => void
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
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: GEOFENCE_COLORS[geofence.color] }}
      />

      <header className="flex items-start gap-3">
        <Link to={`/geofences/${geofence.id}`} className="shrink-0">
          <GeofenceSwatch color={geofence.color} size="lg" />
        </Link>
        <Link
          to={`/geofences/${geofence.id}`}
          className="min-w-0 flex-1 transition-opacity group-hover:opacity-90"
        >
          <h3 className="truncate text-sm font-medium leading-tight">
            {geofence.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <ShapeIcon className="size-3" />
            {shapeMeta}
          </p>
        </Link>
        <GeofenceMenu
          geofence={geofence}
          isAdmin={isAdmin}
          onEditSettings={onEditSettings}
          onDelete={onDelete}
        />
      </header>

      <Link to={`/geofences/${geofence.id}`} className="contents">
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
      </Link>

      <footer className="flex items-center justify-between border-t pt-2.5 text-[10px] text-muted-foreground">
        <span className="font-mono uppercase tracking-[0.14em]">
          rev {geofence.shapeRevision} · {formatRelative(geofence.updatedAt)}
        </span>
        <Link
          to={`/geofences/${geofence.id}`}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          Open →
        </Link>
      </footer>
    </article>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  badge,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
        active
          ? "bg-background text-foreground ring-1 ring-foreground/15"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {badge !== undefined && badge > 0 ? (
        <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center bg-emerald-500 px-1 font-mono text-[9px] font-medium tabular-nums text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  )
}

export function GeofencesPage() {
  const { data: session } = useSession()
  const { activeOrg } = useActiveOrg()
  const { unreadEventsCount, clearUnreadEvents } = useFleetStream()

  const [tab, setTab] = useState<TabKey>("list")
  const [geofences, setGeofences] = useState<GeofenceDTO[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [editTarget, setEditTarget] = useState<GeofenceDTO | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<GeofenceDTO | null>(null)

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

  // Clear the unread badge when the user navigates to this page's
  // events tab — they're now seeing the events directly.
  useEffect(() => {
    if (tab === "events" || tab === "live") {
      clearUnreadEvents()
    }
  }, [tab, clearUnreadEvents])

  function onDeleted(deletedId: string) {
    setGeofences((prev) => prev?.filter((g) => g.id !== deletedId) ?? null)
  }

  function onUpdated(next: GeofenceDTO) {
    setGeofences((prev) =>
      prev?.map((g) => (g.id === next.id ? next : g)) ?? null
    )
  }

  const totalCount = geofences?.length ?? 0
  const polygonCount =
    geofences?.filter((g) => g.shape.kind === "polygon").length ?? 0
  const circleCount = totalCount - polygonCount
  const insideCount =
    geofences?.reduce((acc, g) => acc + (g.insideCount ?? 0), 0) ?? 0

  const eventsBadge = useMemo(
    () => (tab !== "events" ? unreadEventsCount : 0),
    [tab, unreadEventsCount]
  )

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
            <NotificationsToggle />
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

      {/* Tabs */}
      <div className="mt-5 flex items-center gap-1 border bg-muted/20 p-0.5 self-start ring-1 ring-foreground/5 w-fit">
        <TabButton
          active={tab === "list"}
          onClick={() => setTab("list")}
          icon={IconList}
          label="List"
        />
        <TabButton
          active={tab === "events"}
          onClick={() => setTab("events")}
          icon={IconWaveSawTool}
          label="Events"
          badge={eventsBadge}
        />
        <TabButton
          active={tab === "live"}
          onClick={() => setTab("live")}
          icon={IconBroadcast}
          label="Live"
        />
      </div>

      <div className="mt-6">
        {tab === "list" ? (
          <ListTab
            geofences={geofences}
            loadError={loadError}
            isAdmin={isAdmin}
            onEditSettings={(g) => setEditTarget(g)}
            onDelete={(g) => setDeleteTarget(g)}
          />
        ) : null}

        {tab === "events" ? <EventsFeed /> : null}

        {tab === "live" ? <LiveSnapshot /> : null}
      </div>

      {editTarget ? (
        <EditSettingsDialog
          open={editTarget !== null}
          onClose={() => setEditTarget(null)}
          geofence={editTarget}
          onUpdated={onUpdated}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteDialog
          open={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          geofence={deleteTarget}
          onDeleted={onDeleted}
        />
      ) : null}
    </AppShell>
  )
}

function ListTab({
  geofences,
  loadError,
  isAdmin,
  onEditSettings,
  onDelete,
}: {
  geofences: GeofenceDTO[] | null
  loadError: string | null
  isAdmin: boolean
  onEditSettings: (g: GeofenceDTO) => void
  onDelete: (g: GeofenceDTO) => void
}) {
  return (
    <>
      {loadError ? (
        <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive ring-1 ring-foreground/5">
          <IconAlertCircle className="size-3.5 shrink-0" />
          {loadError}
        </div>
      ) : null}

      {!geofences && !loadError ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : null}

      {geofences && geofences.length === 0 ? (
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
      ) : null}

      {geofences && geofences.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {geofences.map((g) => (
            <GeofenceCard
              key={g.id}
              geofence={g}
              isAdmin={isAdmin}
              onEditSettings={() => onEditSettings(g)}
              onDelete={() => onDelete(g)}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}
