import { useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { IconBolt, IconMenu2, IconPlayerStopFilled, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { stopTracking } from "@/lib/device-tracker"
import { useDeviceTracker } from "@/lib/use-device-tracker"
import { cn } from "@/lib/utils"

import { AppSidebar } from "./app-sidebar"

interface AppTopbarProps {
  breadcrumbs?: BreadcrumbItem[]
}

/**
 * Slim top bar: 48px tall, sticky, blurred. Holds the breadcrumb trail and
 * the global actions (theme, tracking pill). Hamburger on mobile opens the
 * sidebar in a drawer.
 */
export function AppTopbar({ breadcrumbs }: AppTopbarProps) {
  const tracker = useDeviceTracker()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement | null>(null)

  // Close on route change.
  useEffect(() => {
    function handler() {
      setDrawerOpen(false)
    }
    window.addEventListener("hashchange", handler)
    window.addEventListener("popstate", handler)
    return () => {
      window.removeEventListener("hashchange", handler)
      window.removeEventListener("popstate", handler)
    }
  }, [])

  // Close on Escape + outside click.
  useEffect(() => {
    if (!drawerOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false)
    }
    function onClick(e: MouseEvent) {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(e.target as Node)
      ) {
        setDrawerOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("mousedown", onClick)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("mousedown", onClick)
    }
  }, [drawerOpen])

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70"
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="lg:hidden"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <IconMenu2 className="size-4" />
        </Button>

        <div className="flex min-w-0 flex-1 items-center">
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <Breadcrumbs items={breadcrumbs} />
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              trackit
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {tracker.status === "tracking" &&
          tracker.activeDeviceId &&
          tracker.activeDeviceName ? (
            <TopbarTrackingPill
              deviceId={tracker.activeDeviceId}
              deviceName={tracker.activeDeviceName}
            />
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            aria-hidden
          />
          <div
            ref={drawerRef}
            className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar shadow-2xl"
            role="dialog"
            aria-label="Navigation"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Menu
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
              >
                <IconX className="size-4" />
              </Button>
            </div>
            <div className="-mt-px flex-1 overflow-y-auto">
              {/* Reuse the same sidebar content. The drawer wrapper handles
                  positioning; the sidebar itself just renders normally. */}
              <div className="lg:hidden">
                <AppSidebar />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function TopbarTrackingPill({
  deviceId,
  deviceName,
}: {
  deviceId: string
  deviceName: string
}) {
  function onStop() {
    stopTracking()
    toast("Tracking stopped.")
  }

  return (
    <div
      className={cn(
        "hidden h-8 items-center gap-1.5 border border-emerald-500/40 bg-emerald-500/10 pl-2 pr-1 text-[11px] text-emerald-900 dark:text-emerald-200 sm:flex"
      )}
    >
      <IconBolt className="size-3" />
      <span className="size-1 animate-pulse rounded-full bg-emerald-500" />
      <Link
        to={`/devices/${deviceId}`}
        className="max-w-[14ch] truncate font-medium hover:underline"
        title={`Tracking ${deviceName}`}
      >
        {deviceName}
      </Link>
      <button
        type="button"
        onClick={onStop}
        aria-label="Stop tracking"
        className="grid size-5 place-items-center border border-emerald-500/30 bg-emerald-500/10 transition-colors hover:bg-emerald-500/20"
      >
        <IconPlayerStopFilled className="size-2.5" />
      </button>
    </div>
  )
}
