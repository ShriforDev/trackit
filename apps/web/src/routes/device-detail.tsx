import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { toast } from "sonner"
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBolt,
  IconClock,
  IconCompass,
  IconDeviceMobile,
  IconMap,
  IconPlayerStopFilled,
  IconRoute,
  IconRouter,
  IconShieldCheck,
  IconTrash,
} from "@tabler/icons-react"

import { AppFooter, AppHeader } from "@/components/layout/app-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError } from "@/lib/api"
import { useActiveOrganization, useSession } from "@/lib/auth-client"
import {
  startTracking,
  stopTracking,
  type DeviceTrackerState,
} from "@/lib/device-tracker"
import { useDeviceTracker } from "@/lib/use-device-tracker"
import { cn } from "@/lib/utils"

import {
  DEVICE_COLORS,
  type Device,
  type DeviceColorId,
} from "@trackit/shared"

function colorHexFor(id: string): string {
  return DEVICE_COLORS.find((c) => c.id === id)?.hex ?? "#737373"
}

function formatAge(unixSec: number | null): string {
  if (unixSec === null) return "—"
  const diff = Math.max(0, Math.round(Date.now() / 1000 - unixSec))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  return `${Math.round(diff / 3600)}h ago`
}

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: session } = useSession()
  const { data: activeOrg } = useActiveOrganization()

  const [device, setDevice] = useState<Device | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const tracker = useDeviceTracker(id)

  // Tick "last fix age" once a second while we're the active device.
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!tracker.isThisDevice) return
    const iv = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(iv)
  }, [tracker.isThisDevice])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) return
      try {
        const row = await api.get<Device>(`/devices/${id}`)
        if (!cancelled) setDevice(row)
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof ApiError
              ? err.status === 403
                ? "You don't have access to this device."
                : err.status === 404
                  ? "This device doesn't exist or has been deleted."
                  : err.message
              : "Couldn't load this device."
          setLoadError(message)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  function onStart() {
    if (!id || !device) return
    const result = startTracking({ deviceId: id, deviceName: device.name })
    if (!result.ok) return
    if (result.swappedFrom) {
      toast(
        `Switched tracking from ${result.swappedFrom.deviceName} to ${device.name}.`,
        { description: "Only one device can stream at a time per browser tab." }
      )
    } else {
      toast.success(`Now tracking ${device.name}.`)
    }
  }

  function onStop() {
    stopTracking()
    toast("Tracking stopped.")
  }

  async function onDelete() {
    if (!id) return
    setIsDeleting(true)

    // If we're tracking this device, stop first so we don't keep posting
    // to a deleted resource.
    if (tracker.activeDeviceId === id) {
      stopTracking({ silent: true })
    }

    try {
      await api.delete(`/devices/${id}`)
      toast.success(`Deleted "${device?.name ?? "device"}".`)
      setDeleteOpen(false)
      navigate("/devices", { replace: true })
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Couldn't delete the device."
      toast.error(message)
      setIsDeleting(false)
    }
  }

  if (!id) {
    return null
  }

  if (loadError) {
    return (
      <div className="flex min-h-svh flex-col">
        <AppHeader />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-10">
          <div className="flex w-full flex-col items-center gap-4 border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
            <IconAlertCircle className="size-6 text-destructive" />
            <div className="flex flex-col gap-1">
              <h1 className="text-base font-medium">Couldn&apos;t open device</h1>
              <p className="text-xs text-muted-foreground">{loadError}</p>
            </div>
            <Button
              render={<Link to="/devices" />}
              variant="outline"
              size="sm"
            >
              <IconArrowLeft data-icon="inline-start" />
              Back to devices
            </Button>
          </div>
        </main>
        <AppFooter />
      </div>
    )
  }

  if (!device) {
    return (
      <div className="flex min-h-svh flex-col">
        <AppHeader />
        <main className="flex flex-1 items-center justify-center">
          <Spinner />
        </main>
      </div>
    )
  }

  const isOwner = session?.user.id === device.ownerUserId
  const myMembership = activeOrg?.members?.find(
    (m) => m.userId === session?.user.id
  )
  const myRole = myMembership?.role ?? "member"
  const isOrgAdmin = myRole === "owner" || myRole === "admin"
  const canDelete = isOwner || isOrgAdmin
  const color = colorHexFor(device.color as DeviceColorId)
  const isPhone = device.kind === "phone"

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
        <div className="flex flex-col gap-2">
          <Button
            render={<Link to="/devices" />}
            variant="ghost"
            size="sm"
            className="-ml-2 w-fit"
          >
            <IconArrowLeft data-icon="inline-start" />
            Back to devices
          </Button>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="size-5 ring-1 ring-foreground/10"
              style={{ backgroundColor: color }}
            />
            <h1 className="font-heading text-2xl font-medium leading-tight tracking-tight">
              {device.name}
            </h1>
            <Badge variant="outline" className="gap-1">
              {isPhone ? (
                <IconDeviceMobile className="size-3" />
              ) : (
                <IconRouter className="size-3" />
              )}
              {device.kind}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {isOwner
              ? "You own this device. Use the controls below to stream this browser's location."
              : "You have read access to this device. Only the owner can stream its location."}
          </p>
        </div>

        {/* Tracking control (owner only) */}
        {isOwner ? (
          <TrackingControl
            tracker={tracker}
            currentDeviceId={id}
            currentDeviceName={device.name}
            isPhone={isPhone}
            onStart={onStart}
            onStop={onStop}
          />
        ) : null}

        {/* Metadata */}
        <section className="flex flex-col gap-3 border bg-background p-5 ring-1 ring-foreground/5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Captured at registration
          </span>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <Field label="Color">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-3 ring-1 ring-foreground/10"
                  style={{ backgroundColor: color }}
                />
                {DEVICE_COLORS.find((c) => c.id === device.color)?.label ??
                  device.color}
              </span>
            </Field>
            <Field
              label="Registered"
              value={new Date(device.createdAt).toLocaleString()}
            />
            <Field label="OS" value={device.metadata?.os ?? "—"} />
            <Field label="Browser" value={device.metadata?.browser ?? "—"} />
            <Field
              label="Screen"
              value={
                device.metadata?.screen
                  ? `${device.metadata.screen.width}×${device.metadata.screen.height}${
                      device.metadata.screen.dpr
                        ? ` @${device.metadata.screen.dpr}x`
                        : ""
                    }`
                  : "—"
              }
            />
            <Field
              label="Language"
              value={device.metadata?.language ?? "—"}
            />
            <Field
              label="Timezone"
              value={device.metadata?.timezone ?? "—"}
            />
          </dl>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {canDelete ? (
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <IconTrash data-icon="inline-start" />
                    Delete device
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this device?</DialogTitle>
                  <DialogDescription>
                    Permanently removes{" "}
                    <span className="font-medium text-foreground">
                      {device.name}
                    </span>{" "}
                    along with every recorded position. This can&apos;t be
                    undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">
                      Tracking will stop immediately
                    </span>
                    <span className="text-[11px] leading-relaxed">
                      The device disappears from /map within seconds and
                      every history fix is dropped.
                    </span>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose
                    render={
                      <Button variant="ghost" disabled={isDeleting}>
                        Cancel
                      </Button>
                    }
                  />
                  <Button
                    variant="destructive"
                    onClick={onDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <IconTrash data-icon="inline-start" />
                    )}
                    Delete forever
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <Button
              render={<Link to={`/devices/${id}/history`} />}
              variant="outline"
              size="sm"
            >
              <IconRoute data-icon="inline-start" />
              View history
            </Button>
            <Button render={<Link to="/map" />} variant="outline" size="sm">
              <IconMap data-icon="inline-start" />
              Open live map
            </Button>
            <Button render={<Link to="/devices" />} variant="ghost" size="sm">
              Done
            </Button>
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  )
}

function Field({
  label,
  value,
  children,
}: {
  label: string
  value?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border/60 py-1.5 last:border-b-0">
      <dt className="w-24 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="flex-1 truncate font-medium">
        {children ?? value ?? "—"}
      </dd>
    </div>
  )
}

interface TrackingControlProps {
  tracker: DeviceTrackerState & {
    isThisDevice: boolean
    isAnyTracking: boolean
  }
  currentDeviceId: string
  currentDeviceName: string
  isPhone: boolean
  onStart: () => void
  onStop: () => void
}

function TrackingControl({
  tracker,
  currentDeviceId,
  isPhone,
  onStart,
  onStop,
}: TrackingControlProps) {
  // The page's device is being tracked.
  const isThisDevice = tracker.isThisDevice
  // A *different* device is being tracked from this tab.
  const isOtherDevice =
    tracker.status === "tracking" &&
    tracker.activeDeviceId !== null &&
    tracker.activeDeviceId !== currentDeviceId
  const isPending =
    tracker.status === "requesting_permission" &&
    tracker.activeDeviceId === currentDeviceId
  const isDenied =
    tracker.status === "permission_denied" &&
    tracker.activeDeviceId === currentDeviceId

  return (
    <section
      className={cn(
        "flex flex-col gap-4 border bg-background p-5 ring-1 ring-foreground/5",
        isThisDevice && "ring-emerald-500/30"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid size-9 shrink-0 place-items-center border",
            isThisDevice
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-muted"
          )}
        >
          {isThisDevice ? (
            <IconBolt className="size-4" />
          ) : (
            <IconCompass className="size-4" />
          )}
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">
              Stream location from this browser
            </h2>
            {isThisDevice ? (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                live
              </Badge>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {!isPhone
              ? "IoT device tracking comes online in a later release."
              : isOtherDevice
                ? `Currently streaming from ${tracker.activeDeviceName}. Starting here will swap the active device.`
                : "Tracking continues across pages while a trackit tab stays open. Closing the tab stops it. We keep the screen awake while tracking is active."}
          </p>
        </div>
      </div>

      {isDenied ? (
        <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <IconShieldCheck className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">Permission denied</span>
            <span className="text-[11px] leading-relaxed">
              Re-enable Location for this site in your browser settings, then
              reload the page.
            </span>
          </div>
        </div>
      ) : tracker.lastError && tracker.activeDeviceId === currentDeviceId ? (
        <div className="flex items-center gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <IconAlertCircle className="size-4 shrink-0" />
          {tracker.lastError}
        </div>
      ) : null}

      {isThisDevice ? (
        <dl className="grid grid-cols-3 gap-4 border-t pt-4 text-xs">
          <Stat
            icon={IconBolt}
            label="Fixes posted"
            value={tracker.fixCount.toString()}
          />
          <Stat
            icon={IconCompass}
            label="Last accuracy"
            value={
              tracker.lastAccuracy === null
                ? "—"
                : `±${Math.round(tracker.lastAccuracy)}m`
            }
          />
          <Stat
            icon={IconClock}
            label="Last fix"
            value={formatAge(tracker.lastFixAt)}
          />
        </dl>
      ) : null}

      <div className="flex items-center gap-2">
        {!isThisDevice ? (
          <Button onClick={onStart} disabled={isPending || !isPhone}>
            {isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconBolt data-icon="inline-start" />
            )}
            {isPending
              ? "Requesting permission…"
              : isOtherDevice
                ? "Switch tracking here"
                : "Start tracking"}
          </Button>
        ) : (
          <Button variant="outline" onClick={onStop}>
            <IconPlayerStopFilled data-icon="inline-start" />
            Stop tracking
          </Button>
        )}
      </div>
    </section>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof IconBolt
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}
