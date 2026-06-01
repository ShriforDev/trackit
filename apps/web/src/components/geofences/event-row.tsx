import { Link } from "react-router"
import { IconArrowRight } from "@tabler/icons-react"

import { GeofenceSwatch } from "@/components/ui/geofence-swatch"
import { cn } from "@/lib/utils"

import {
  type GeofenceEventDTO,
  type GeofenceColorId,
} from "@trackit/shared/geofence"

import {
  formatEventClock,
  formatEventTime,
  presentationFor,
} from "./event-presentation"

export interface EventRowDevice {
  name: string
  /** DeviceColorId hex resolution is up to the caller. */
  colorHex?: string
}

export interface EventRowGeofence {
  name: string
  color: GeofenceColorId
}

interface EventRowProps {
  event: GeofenceEventDTO
  device?: EventRowDevice
  geofence?: EventRowGeofence
  /** Compact variant — used inside toasts. */
  compact?: boolean
  className?: string
}

/**
 * Single event row. Color-coded by event type, with the device on the
 * left and the geofence on the right. Clickable when not compact —
 * navigates to the geofence detail page.
 */
export function EventRow({
  event,
  device,
  geofence,
  compact = false,
  className,
}: EventRowProps) {
  const pres = presentationFor(event.type)
  const Icon = pres.icon

  const inner = (
    <>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center border ring-1 ring-foreground/5",
          pres.bgTone,
          compact ? "size-7" : "size-9"
        )}
      >
        <Icon className={cn("size-4", pres.tone)} strokeWidth={1.8} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-1.5 text-xs leading-tight">
          <span
            className={cn(
              "font-mono text-[10px] uppercase tracking-[0.16em]",
              pres.tone
            )}
          >
            {pres.label}
          </span>
          <span className="flex items-center gap-1 truncate">
            {device?.colorHex ? (
              <span
                aria-hidden
                className="size-2.5 shrink-0 ring-1 ring-foreground/15"
                style={{ backgroundColor: device.colorHex }}
              />
            ) : null}
            <span className="truncate font-medium">
              {device?.name ?? `Device ${event.deviceId.slice(0, 6)}`}
            </span>
          </span>
          <IconArrowRight className="size-3 shrink-0 text-muted-foreground" />
          <span className="flex items-center gap-1 truncate">
            <GeofenceSwatch
              color={geofence?.color ?? "graphite"}
              size="sm"
            />
            <span className="truncate font-medium">
              {geofence?.name ?? "Geofence"}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="tabular-nums">{formatEventClock(event.time)}</span>
          <span>·</span>
          <span>{formatEventTime(event.time)}</span>
          {typeof event.latitude === "number" && typeof event.longitude === "number" ? (
            <>
              <span>·</span>
              <span className="tabular-nums">
                {event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </>
  )

  const outerClass = cn(
    "group/event flex items-center gap-3 transition-colors",
    compact ? "px-3 py-2" : "px-4 py-3 hover:bg-muted/40",
    className
  )

  if (compact) {
    return <div className={outerClass}>{inner}</div>
  }

  return (
    <Link
      to={`/geofences/${event.geofenceId}`}
      className={outerClass}
      title="View geofence"
    >
      {inner}
    </Link>
  )
}
