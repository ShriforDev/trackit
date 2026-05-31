import { useEffect, useState } from "react"
import { Link } from "react-router"
import {
  IconAlertCircle,
  IconDeviceMobile,
  IconPlus,
  IconRefresh,
  IconRouter,
} from "@tabler/icons-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError } from "@/lib/api"
import { useSession } from "@/lib/auth-client"
import { useActiveOrg } from "@/lib/use-active-org"
import { useDeviceTracker } from "@/lib/use-device-tracker"
import { cn } from "@/lib/utils"

import type { Device, DeviceColorId } from "@trackit/shared/devices"
import {
  DEVICE_COLORS,
  getDeviceColor,
} from "@trackit/shared/devices"

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMin = Math.round((now - then) / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.round(diffH / 24)
  if (diffD < 30) return `${diffD}d ago`
  return new Date(iso).toLocaleDateString()
}

function ColorSwatch({
  colorId,
  size = "md",
}: {
  colorId: DeviceColorId
  size?: "sm" | "md"
}) {
  const color = DEVICE_COLORS.find((c) => c.id === colorId)
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block ring-1 ring-foreground/10",
        size === "sm" ? "size-3" : "size-4"
      )}
      style={{ backgroundColor: color?.hex ?? "#737373" }}
    />
  )
}

export function DevicesPage() {
  const { data: session } = useSession()
  const { activeOrg, isLoading: orgLoading } = useActiveOrg()
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  async function load(showSpinner = false) {
    if (showSpinner) setIsRefreshing(true)
    try {
      const rows = await api.get<Device[]>("/devices")
      setDevices(rows)
      setError(null)
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Couldn't load devices."
      setError(message)
    } finally {
      if (showSpinner) setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const myMembership = activeOrg?.members?.find(
    (m) => m.userId === session?.user.id
  )
  const myRole = myMembership?.role ?? "member"
  const isAdmin = myRole === "owner" || myRole === "admin"

  const totalCount = devices?.length ?? 0
  const phoneCount = devices?.filter((d) => d.kind === "phone").length ?? 0
  const iotCount = totalCount - phoneCount

  return (
    <AppShell breadcrumbs={[{ label: "Devices" }]}>
      <PageHeader
        eyebrow="Fleet"
        title={
          orgLoading
            ? "Devices"
            : `${activeOrg?.name ?? "Your organization"}'s devices`
        }
        description={
          isAdmin
            ? "You see every active device in the organization."
            : "You see devices you own and any that have been shared with you."
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load(true)}
              disabled={isRefreshing}
              aria-label="Refresh devices"
            >
              {isRefreshing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconRefresh data-icon="inline-start" />
              )}
              Refresh
            </Button>
            <Button render={<Link to="/devices/new" />} size="sm">
              <IconPlus data-icon="inline-start" />
              Register a device
            </Button>
          </>
        }
        meta={
          devices ? (
            <>
              <CountChip label="Total" value={totalCount} />
              <CountChip label="Phones" value={phoneCount} />
              <CountChip label="IoT" value={iotCount} />
            </>
          ) : null
        }
      />

      {error ? (
        <div className="mt-6 flex items-center gap-2 border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          <IconAlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-6">
        {devices === null && !error ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[148px]" />
            ))}
          </div>
        ) : devices && devices.length === 0 ? (
          <EmptyState
            icon={<IconDeviceMobile className="size-6" />}
            title="No devices yet"
            description="Register your first device — start with the phone you're using right now, then add more as your team grows."
            action={
              <Button render={<Link to="/devices/new" />} size="sm">
                <IconPlus data-icon="inline-start" />
                Register a device
              </Button>
            }
          />
        ) : devices ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map((d) => (
              <DeviceCard key={d.id} device={d} />
            ))}
          </ul>
        ) : null}
      </div>
    </AppShell>
  )
}

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 border bg-background px-2 py-1 ring-1 ring-foreground/5">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-xs font-medium tabular-nums">
        {value}
      </span>
    </span>
  )
}

function DeviceCard({ device }: { device: Device }) {
  const tracker = useDeviceTracker(device.id)
  const color = (() => {
    try {
      return getDeviceColor(device.color as DeviceColorId)
    } catch {
      return null
    }
  })()
  const isPhone = device.kind === "phone"

  return (
    <li className="group">
      <Link
        to={`/devices/${device.id}`}
        className={cn(
          "flex h-full flex-col gap-3 border bg-background p-4 ring-1 ring-foreground/5 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
          tracker.isThisDevice && "ring-emerald-500/40"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <ColorSwatch colorId={device.color as DeviceColorId} />
            <span className="line-clamp-1 text-sm font-medium">
              {device.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {tracker.isThisDevice ? (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                live
              </Badge>
            ) : null}
            <Badge variant="outline" className="gap-1">
              {isPhone ? (
                <IconDeviceMobile className="size-3" />
              ) : (
                <IconRouter className="size-3" />
              )}
              {device.kind}
            </Badge>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-muted-foreground">Color</dt>
          <dd className="font-medium">{color?.label ?? device.color}</dd>
          <dt className="text-muted-foreground">Registered</dt>
          <dd className="font-medium">{formatRelative(device.createdAt)}</dd>
          {device.metadata?.os ? (
            <>
              <dt className="text-muted-foreground">OS</dt>
              <dd
                className="line-clamp-1 font-medium"
                title={device.metadata.os}
              >
                {device.metadata.os}
              </dd>
            </>
          ) : null}
          {device.metadata?.browser ? (
            <>
              <dt className="text-muted-foreground">Browser</dt>
              <dd className="line-clamp-1 font-medium">
                {device.metadata.browser}
              </dd>
            </>
          ) : null}
        </dl>
      </Link>
    </li>
  )
}
