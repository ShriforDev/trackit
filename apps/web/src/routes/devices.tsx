import { useEffect, useState } from "react"
import { Link } from "react-router"
import {
  IconAlertCircle,
  IconDeviceMobile,
  IconPlus,
  IconRefresh,
  IconRouter,
} from "@tabler/icons-react"

import { AppFooter, AppHeader } from "@/components/layout/app-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError } from "@/lib/api"
import { useActiveOrganization, useSession } from "@/lib/auth-client"
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
  const { data: activeOrg } = useActiveOrganization()
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

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <IconDeviceMobile className="size-3.5" />
              Devices
            </span>
            <h1 className="font-heading text-2xl font-medium leading-tight tracking-tight">
              {activeOrg?.name ?? "Your organization"}&apos;s devices
            </h1>
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {isAdmin
                ? "You see every active device in the organization."
                : "You see devices you own and any that have been shared with you."}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </section>

        {error ? (
          <div className="flex items-center gap-2 border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive">
            <IconAlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {devices === null && !error ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Spinner />
          </div>
        ) : devices && devices.length === 0 ? (
          <EmptyState />
        ) : devices ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map((d) => (
              <DeviceCard key={d.id} device={d} />
            ))}
          </ul>
        ) : null}
      </main>

      <AppFooter />
    </div>
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 border border-dashed bg-muted/20 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center border bg-background text-foreground">
        <IconDeviceMobile className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">No devices yet</h2>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          Register your first device — start with the phone you&apos;re using
          right now, then add more as your team grows.
        </p>
      </div>
      <Button render={<Link to="/devices/new" />} size="sm">
        <IconPlus data-icon="inline-start" />
        Register a device
      </Button>
    </div>
  )
}
