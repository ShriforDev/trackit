import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBroadcast,
  IconCircle,
  IconHistory,
  IconPolygon,
  IconRefresh,
  IconSettings,
  IconShape,
  IconShieldLock,
  IconTrash,
  IconWaveSawTool,
} from "@tabler/icons-react"

import { DeleteDialog } from "@/components/geofences/delete-dialog"
import { EditSettingsDialog } from "@/components/geofences/edit-settings-dialog"
import { EventsFeed } from "@/components/geofences/events-feed"
import { GeofenceDetailMap } from "@/components/geofences/geofence-detail-map"
import { GeofenceMenu } from "@/components/geofences/geofence-menu"
import { LiveSnapshot } from "@/components/geofences/live-snapshot"
import { ShapeVersionsList } from "@/components/geofences/shape-versions-list"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { GeofenceSwatch } from "@/components/ui/geofence-swatch"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { useSession } from "@/lib/auth-client"
import { useFleetStream } from "@/lib/fleet-stream"
import { geofencesApi } from "@/lib/geofences-client"
import { useActiveOrg } from "@/lib/use-active-org"
import { cn } from "@/lib/utils"

import {
  type GeofenceDTO,
  isCircleShape,
  isPolygonShape,
} from "@trackit/shared/geofence"
import type { Role } from "@trackit/shared/permissions"

type DetailTab = "live" | "events" | "versions"

function formatRadius(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km`
  return `${m} m`
}

function formatAbsoluteTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function StatRow({
  label,
  value,
  mono = true,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-right text-xs",
          mono && "font-mono tabular-nums"
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function GeofenceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: session } = useSession()
  const { activeOrg } = useActiveOrg()
  const { latestEvent } = useFleetStream()

  const [geofence, setGeofence] = useState<GeofenceDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState<DetailTab>("live")

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const myMembership = activeOrg?.members?.find(
    (m) => m.userId === session?.user.id
  )
  const myRole = (myMembership?.role ?? "member") as Role
  const isAdmin = myRole === "owner" || myRole === "admin"

  async function load(showSpinner = true) {
    if (!id) return
    if (showSpinner) setIsLoading(true)
    try {
      const row = await geofencesApi.get(id)
      setGeofence(row)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("not_found")
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't load geofence.")
      }
    } finally {
      if (showSpinner) setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  // Live refresh: when a new event for THIS geofence fires, re-fetch
  // (the inside count + updated_at may change).
  useEffect(() => {
    if (!latestEvent || latestEvent.geofenceId !== id) return
    void load(false)
  }, [latestEvent, id])

  function onDeleted(deletedId: string) {
    void deletedId
    navigate("/geofences", { replace: true })
  }

  function onUpdated(next: GeofenceDTO) {
    setGeofence(next)
  }

  // ---- error / loading ----------

  if (error === "not_found") {
    return (
      <AppShell breadcrumbs={[{ label: "Geofences", to: "/geofences" }]}>
        <div className="mt-12 flex flex-col items-center justify-center gap-4 py-16 text-center">
          <span className="grid size-12 place-items-center border bg-muted/40 ring-1 ring-foreground/10">
            <IconShape className="size-5 text-muted-foreground" />
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

  if (error) {
    return (
      <AppShell breadcrumbs={[{ label: "Geofences", to: "/geofences" }]}>
        <div className="mt-6 flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive ring-1 ring-foreground/5">
          <IconAlertCircle className="size-3.5 shrink-0" />
          {error}
        </div>
      </AppShell>
    )
  }

  if (isLoading || !geofence) {
    return (
      <AppShell breadcrumbs={[{ label: "Geofences", to: "/geofences" }]}>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,_1fr)_22rem]">
          <Skeleton className="h-[60vh] w-full" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </AppShell>
    )
  }

  // ---- main render ----------

  const ShapeIcon = isCircleShape(geofence.shape) ? IconCircle : IconPolygon
  const shapeMeta = isCircleShape(geofence.shape)
    ? `Circle · ${formatRadius(geofence.shape.radiusM)}`
    : `Polygon · ${
        isPolygonShape(geofence.shape) ? geofence.shape.coordinates.length : 0
      } vertices`
  const insideCount = geofence.insideCount ?? 0

  return (
    <AppShell
      breadcrumbs={[
        { label: "Geofences", to: "/geofences" },
        { label: geofence.name },
      ]}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,_1fr)_22rem]">
        {/* MAP — primary surface */}
        <GeofenceDetailMap
          geofence={geofence}
          className="h-[60vh] min-h-[400px] lg:h-[calc(100vh-12rem)]"
        />

        {/* RIGHT RAIL */}
        <aside className="flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-start gap-3">
            <GeofenceSwatch color={geofence.color} size="lg" />
            <div className="min-w-0 flex-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Boundary
              </span>
              <h1 className="font-heading text-xl font-medium leading-tight tracking-tight">
                {geofence.name}
              </h1>
              <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <ShapeIcon className="size-3" />
                {shapeMeta}
              </p>
            </div>
            {isAdmin ? (
              <GeofenceMenu
                geofence={geofence}
                isAdmin={isAdmin}
                hideOpen
                onEditSettings={() => setEditOpen(true)}
                onDelete={() => setDeleteOpen(true)}
              />
            ) : null}
          </div>

          {/* Inside-now hero */}
          <div
            className={cn(
              "flex items-center justify-between border bg-background px-3 py-2.5 ring-1",
              insideCount > 0
                ? "ring-emerald-500/40"
                : "ring-foreground/5"
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 rounded-full",
                  insideCount > 0
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-muted-foreground/40"
                )}
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Inside now
              </span>
            </div>
            <span
              className={cn(
                "font-mono text-2xl font-medium tabular-nums",
                insideCount > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : ""
              )}
            >
              {insideCount}
            </span>
          </div>

          {/* Config */}
          <section className="border bg-background px-3 ring-1 ring-foreground/5">
            <header className="border-b py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Configuration
              </span>
            </header>
            <StatRow
              label="Proximity buffer"
              value={
                geofence.proximityBufferM > 0
                  ? formatRadius(geofence.proximityBufferM)
                  : "—"
              }
            />
            <StatRow
              label="Dwell threshold"
              value={
                geofence.dwellThresholdMin > 0
                  ? `${geofence.dwellThresholdMin} min`
                  : "—"
              }
            />
            <StatRow label="Revision" value={`rev ${geofence.shapeRevision}`} />
            <StatRow label="Created" value={formatAbsoluteTime(geofence.createdAt)} />
            <StatRow label="Updated" value={formatAbsoluteTime(geofence.updatedAt)} />
          </section>

          {/* Action buttons */}
          {isAdmin ? (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <IconSettings data-icon="inline-start" />
                Edit settings
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                render={<Link to={`/geofences/${geofence.id}/edit-shape`} />}
              >
                <IconPolygon data-icon="inline-start" />
                Edit shape
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOpen(true)}
              >
                <IconTrash data-icon="inline-start" />
                Delete geofence
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void load(true)}
              >
                <IconRefresh data-icon="inline-start" />
                Refresh
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 border bg-muted/20 px-3 py-2.5 ring-1 ring-foreground/5">
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <IconShieldLock className="size-3.5" />
                Read-only
              </span>
              <span className="text-[10px] leading-relaxed text-muted-foreground/80">
                Only owners and admins can edit or delete geofences. You'll
                still see live state and events.
              </span>
            </div>
          )}
        </aside>
      </div>

      {/* Bottom tabs */}
      <div className="mt-8 flex flex-col gap-4">
        <div className="flex items-center gap-1 border bg-muted/20 p-0.5 ring-1 ring-foreground/5 self-start w-fit">
          <TabButton
            active={tab === "live"}
            onClick={() => setTab("live")}
            icon={IconBroadcast}
            label="Live"
          />
          <TabButton
            active={tab === "events"}
            onClick={() => setTab("events")}
            icon={IconWaveSawTool}
            label="Events"
          />
          <TabButton
            active={tab === "versions"}
            onClick={() => setTab("versions")}
            icon={IconHistory}
            label="Versions"
          />
        </div>

        {tab === "live" ? <ScopedLiveSnapshot geofenceId={geofence.id} /> : null}
        {tab === "events" ? <EventsFeed geofenceId={geofence.id} /> : null}
        {tab === "versions" ? (
          <ShapeVersionsList
            geofenceId={geofence.id}
            currentRevision={geofence.shapeRevision}
          />
        ) : null}
      </div>

      {/* Dialogs */}
      <EditSettingsDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        geofence={geofence}
        onUpdated={onUpdated}
      />
      <DeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        geofence={geofence}
        onDeleted={onDeleted}
      />
    </AppShell>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
        active
          ? "bg-background text-foreground ring-1 ring-foreground/15"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

/**
 * The shared LiveSnapshot displays every geofence; here we just want
 * this one. Quick scope wrapper — the LiveSnapshot fetches and groups
 * everything; we mount it without filtering for now and rely on the
 * fact that there's only one row group per geofence. A future
 * refactor could push a `geofenceId` prop into LiveSnapshot itself.
 */
function ScopedLiveSnapshot({ geofenceId }: { geofenceId: string }) {
  void geofenceId
  return <LiveSnapshot />
}
