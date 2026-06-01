import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { useSession } from "@/lib/auth-client"
import { useGeofenceEvents } from "@/lib/fleet-stream"
import { readPrefs } from "@/lib/notification-prefs"
import { playEventChime } from "@/lib/use-event-sound"
import { useActiveOrg } from "@/lib/use-active-org"

import type { Role } from "@trackit/shared/permissions"

import { EventRow } from "./event-row"
import { useEventDisplay, useGeofencesIndex } from "./use-event-display"

/**
 * Mounts once at the top of the authed app. Listens for new geofence
 * events and dispatches:
 *   - sonner toast (rich event row)
 *   - chime via Web Audio
 *
 * Both gated on per-user preferences (localStorage).
 */
export function GeofenceNotificationBridge() {
  const { data: session, isPending } = useSession()
  if (isPending || !session?.user) return null
  return <GeofenceNotificationBridgeInner />
}

function GeofenceNotificationBridgeInner() {
  const { latestEvent, lastEventReceivedAt } = useGeofenceEvents()
  const { data: session } = useSession()
  const { activeOrg } = useActiveOrg()
  const { byId } = useGeofencesIndex()

  const lastDispatchedAtRef = useRef<number | null>(null)

  // Resolve the user's role in the active org for default prefs.
  const userId = session?.user.id
  const myMembership = activeOrg?.members?.find(
    (m) => m.userId === userId
  )
  const role = (myMembership?.role ?? "member") as Role

  useEffect(() => {
    if (!latestEvent || !lastEventReceivedAt) return
    if (lastDispatchedAtRef.current === lastEventReceivedAt) return
    lastDispatchedAtRef.current = lastEventReceivedAt

    const prefs = readPrefs(userId, role)

    if (prefs.soundEnabled) {
      playEventChime(latestEvent.type)
    }

    if (prefs.toastsEnabled) {
      toast.custom(
        () => (
          <ToastEventRow event={latestEvent} geofencesById={byId} />
        ),
        {
          duration: 5_000,
          unstyled: true,
        }
      )
    }
  }, [latestEvent, lastEventReceivedAt, role, userId, byId])

  return null
}

function ToastEventRow({
  event,
  geofencesById,
}: {
  event: NonNullable<ReturnType<typeof useGeofenceEvents>["latestEvent"]>
  geofencesById: ReturnType<typeof useGeofencesIndex>["byId"]
}) {
  const { device, geofence } = useEventDisplay(event, geofencesById)
  return (
    <div className="border bg-background ring-1 ring-foreground/10 shadow-sm">
      <EventRow event={event} device={device} geofence={geofence} compact />
    </div>
  )
}
