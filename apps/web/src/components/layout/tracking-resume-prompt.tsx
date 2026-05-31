import { useEffect, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { IconBolt, IconRefresh, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  clearPersistedIntent,
  getPersistedIntent,
  startTracking,
  type PersistedTrackingIntent,
} from "@/lib/device-tracker"
import { useDeviceTracker } from "@/lib/use-device-tracker"
import { useSession } from "@/lib/auth-client"

/**
 * Stale tracking intents older than this are silently discarded — the
 * user clearly didn't refresh; they came back the next day.
 */
const MAX_INTENT_AGE_MS = 6 * 60 * 60 * 1000 // 6h

/**
 * Surfaces a resume banner when the user returns to the app after a hard
 * refresh and there's a previously-active tracking intent in
 * sessionStorage. Renders nothing once tracking is live or the user
 * dismisses.
 *
 * Lives next to the pending-invitation banner — both belong inline below
 * the AppHeader.
 */
export function TrackingResumePrompt() {
  const { data: session } = useSession()
  const tracker = useDeviceTracker()

  const [intent, setIntent] = useState<PersistedTrackingIntent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const stored = getPersistedIntent()
    if (!stored) return
    if (Date.now() - stored.startedAt > MAX_INTENT_AGE_MS) {
      clearPersistedIntent()
      return
    }
    setIntent(stored)
  }, [])

  // Hide once the singleton picks up tracking (whether by us clicking
  // Resume or the user starting elsewhere).
  if (tracker.status === "tracking") return null
  if (tracker.status === "requesting_permission") return null
  if (!session) return null
  if (!intent) return null
  if (dismissed) return null

  function onResume() {
    if (!intent) return
    const result = startTracking({
      deviceId: intent.deviceId,
      deviceName: intent.deviceName,
    })
    if (!result.ok) {
      toast.error("Couldn't resume tracking on this browser.")
      return
    }
    toast.success(`Resumed tracking ${intent.deviceName}.`)
    setIntent(null)
  }

  function onDismiss() {
    clearPersistedIntent()
    setDismissed(true)
  }

  return (
    <div className="sticky top-12 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/60 bg-emerald-50 px-6 py-2.5 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/30">
      <div className="flex items-center gap-2.5">
        <span className="grid size-6 place-items-center border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/40 dark:text-emerald-200">
          <IconBolt className="size-3.5" />
        </span>
        <span className="text-emerald-950 dark:text-emerald-100">
          Tracking{" "}
          <Link
            to={`/devices/${intent.deviceId}`}
            className="font-medium underline underline-offset-2 hover:no-underline"
          >
            {intent.deviceName}
          </Link>{" "}
          was interrupted by a refresh. Resume?
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={onDismiss}
          className="border-emerald-300 bg-transparent hover:bg-emerald-100/60 dark:border-emerald-700/60 dark:hover:bg-emerald-900/30"
        >
          <IconX data-icon="inline-start" />
          Dismiss
        </Button>
        <Button
          size="sm"
          onClick={onResume}
          className="bg-emerald-900 text-emerald-50 hover:bg-emerald-950 dark:bg-emerald-100 dark:text-emerald-950 dark:hover:bg-emerald-200"
        >
          <IconRefresh data-icon="inline-start" />
          Resume tracking
        </Button>
      </div>
    </div>
  )
}
