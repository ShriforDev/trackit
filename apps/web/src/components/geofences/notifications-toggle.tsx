import { useEffect, useState } from "react"
import { IconBell, IconBellOff, IconVolume, IconVolumeOff } from "@tabler/icons-react"

import { useSession } from "@/lib/auth-client"
import {
  defaultPrefsForRole,
  readPrefs,
  writePrefs,
  type NotificationPrefs,
} from "@/lib/notification-prefs"
import { useActiveOrg } from "@/lib/use-active-org"
import { cn } from "@/lib/utils"

import type { Role } from "@trackit/shared/permissions"

/**
 * Pair of toggle chips for sound + toasts. Hydrates from localStorage,
 * persists per-user. Used in the geofences page header.
 */
export function NotificationsToggle({ className }: { className?: string }) {
  const { data: session } = useSession()
  const { activeOrg } = useActiveOrg()

  const userId = session?.user.id
  const myMembership = activeOrg?.members?.find(
    (m) => m.userId === userId
  )
  const role = (myMembership?.role ?? "member") as Role

  const [prefs, setPrefs] = useState<NotificationPrefs>(() =>
    defaultPrefsForRole(role)
  )

  // Hydrate once we know the user
  useEffect(() => {
    if (!userId) return
    setPrefs(readPrefs(userId, role))
  }, [userId, role])

  function update(patch: Partial<NotificationPrefs>) {
    if (!userId) return
    const next = { ...prefs, ...patch }
    setPrefs(next)
    writePrefs(userId, next)
  }

  const SoundIcon = prefs.soundEnabled ? IconVolume : IconVolumeOff
  const ToastsIcon = prefs.toastsEnabled ? IconBell : IconBellOff

  return (
    <div
      className={cn(
        "flex items-center gap-1 border bg-muted/20 p-0.5 ring-1 ring-foreground/5",
        className
      )}
    >
      <Chip
        active={prefs.soundEnabled}
        onClick={() => update({ soundEnabled: !prefs.soundEnabled })}
        Icon={SoundIcon}
        label={prefs.soundEnabled ? "Sound on" : "Muted"}
        title={
          prefs.soundEnabled
            ? "Sound chimes on geofence events"
            : "Sound muted"
        }
      />
      <Chip
        active={prefs.toastsEnabled}
        onClick={() => update({ toastsEnabled: !prefs.toastsEnabled })}
        Icon={ToastsIcon}
        label={prefs.toastsEnabled ? "Toasts on" : "Toasts off"}
        title={
          prefs.toastsEnabled
            ? "Show in-app toast on geofence events"
            : "Toasts hidden"
        }
      />
    </div>
  )
}

function Chip({
  active,
  onClick,
  Icon,
  label,
  title,
}: {
  active: boolean
  onClick: () => void
  Icon: React.ComponentType<{ className?: string }>
  label: string
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] transition-colors",
        active
          ? "bg-background text-foreground ring-1 ring-foreground/15"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3" />
      {label}
    </button>
  )
}
