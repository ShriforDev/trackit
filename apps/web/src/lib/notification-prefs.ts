/**
 * Notification preferences. Stored in localStorage per browser. Defaults
 * follow the spec: ON for owner/admin, OFF for member.
 *
 * Keys are namespaced by user id so multiple accounts in the same browser
 * don't share preferences.
 */

import type { Role } from "@trackit/shared/permissions"

export interface NotificationPrefs {
  soundEnabled: boolean
  toastsEnabled: boolean
}

const VERSION_KEY = "trackit:notif-prefs:v1"

function storageKey(userId: string): string {
  return `${VERSION_KEY}:${userId}`
}

export function defaultPrefsForRole(role: Role | undefined): NotificationPrefs {
  const isAdmin = role === "owner" || role === "admin"
  return {
    soundEnabled: isAdmin,
    toastsEnabled: true,
  }
}

export function readPrefs(
  userId: string | undefined,
  role: Role | undefined
): NotificationPrefs {
  const fallback = defaultPrefsForRole(role)
  if (!userId || typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>
    return {
      soundEnabled:
        typeof parsed.soundEnabled === "boolean"
          ? parsed.soundEnabled
          : fallback.soundEnabled,
      toastsEnabled:
        typeof parsed.toastsEnabled === "boolean"
          ? parsed.toastsEnabled
          : fallback.toastsEnabled,
    }
  } catch {
    return fallback
  }
}

export function writePrefs(userId: string, prefs: NotificationPrefs): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(prefs))
  } catch {
    // ignore quota / private-mode failures
  }
}
