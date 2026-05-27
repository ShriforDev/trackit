import { Link } from "react-router"
import { toast } from "sonner"
import { IconBolt, IconPlayerStopFilled } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { stopTracking } from "@/lib/device-tracker"
import { useDeviceTracker } from "@/lib/use-device-tracker"

/**
 * Compact tracking indicator for the app header. Renders nothing unless a
 * device is actively streaming (status === "tracking"). Lets the user jump
 * back to the device detail or stop tracking from anywhere in the app.
 */
export function TrackingPill() {
  const tracker = useDeviceTracker()

  if (
    tracker.status !== "tracking" ||
    !tracker.activeDeviceId ||
    !tracker.activeDeviceName
  ) {
    return null
  }

  function onStop() {
    stopTracking()
    toast("Tracking stopped.")
  }

  return (
    <div className="hidden items-center gap-1 border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-800 dark:text-emerald-200 sm:flex">
      <IconBolt className="size-3" />
      <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
      <Link
        to={`/devices/${tracker.activeDeviceId}`}
        className="max-w-[14ch] truncate font-medium hover:underline"
        title={`Tracking ${tracker.activeDeviceName}`}
      >
        {tracker.activeDeviceName}
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onStop}
        aria-label="Stop tracking"
        className="-mr-1 ml-0.5 h-5 px-1 text-emerald-900 hover:bg-emerald-500/20 hover:text-emerald-950 dark:text-emerald-100"
      >
        <IconPlayerStopFilled className="size-3" />
      </Button>
    </div>
  )
}
