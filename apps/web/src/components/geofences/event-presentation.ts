import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconBroadcast,
  IconClockHour4,
  type Icon,
} from "@tabler/icons-react"

import {
  type GeofenceEventDTO,
  type GeofenceEventTypeName,
} from "@trackit/shared/geofence"

/**
 * Per-event-type display tokens — icon, label, tone.
 * Tones are tailwind class names that work in light + dark mode.
 */
export interface EventTypePresentation {
  icon: Icon
  label: string
  /** Tailwind text/border class for accents. */
  tone: string
  /** Subtle bg class — alpha-blended so it works on either theme. */
  bgTone: string
}

export const EVENT_TYPE_PRESENTATION: Record<
  GeofenceEventTypeName,
  EventTypePresentation
> = {
  enter: {
    icon: IconArrowDownRight,
    label: "Enter",
    tone: "text-emerald-600 dark:text-emerald-400",
    bgTone: "bg-emerald-500/10",
  },
  exit: {
    icon: IconArrowUpRight,
    label: "Exit",
    tone: "text-amber-600 dark:text-amber-400",
    bgTone: "bg-amber-500/10",
  },
  approach: {
    icon: IconBroadcast,
    label: "Approach",
    tone: "text-sky-600 dark:text-sky-400",
    bgTone: "bg-sky-500/10",
  },
  dwell: {
    icon: IconClockHour4,
    label: "Dwell",
    tone: "text-violet-600 dark:text-violet-400",
    bgTone: "bg-violet-500/10",
  },
}

export function presentationFor(type: GeofenceEventTypeName): EventTypePresentation {
  return EVENT_TYPE_PRESENTATION[type] ?? EVENT_TYPE_PRESENTATION.enter
}

export function formatEventTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime()
  const diffMs = now - t
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.round(diffH / 24)
  if (diffD < 7) return `${diffD}d ago`
  return new Date(iso).toLocaleDateString()
}

export function formatEventClock(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

export function formatDayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return "TODAY"
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  if (isYesterday) return "YESTERDAY"
  return d
    .toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    .toUpperCase()
}

/**
 * Group events into ordered day buckets. The buckets keep their server
 * order (newest first within a day, days descending).
 */
export function groupEventsByDay(events: GeofenceEventDTO[]): Array<{
  label: string
  events: GeofenceEventDTO[]
}> {
  const buckets = new Map<string, { label: string; events: GeofenceEventDTO[] }>()
  for (const evt of events) {
    const dayKey = new Date(evt.time).toDateString()
    let bucket = buckets.get(dayKey)
    if (!bucket) {
      bucket = { label: formatDayLabel(evt.time), events: [] }
      buckets.set(dayKey, bucket)
    }
    bucket.events.push(evt)
  }
  return Array.from(buckets.values())
}
