import {
  GEOFENCE_COLORS,
  type GeofenceColorId,
} from "@trackit/shared/geofence"

import { cn } from "@/lib/utils"

interface GeofenceSwatchProps {
  color: GeofenceColorId
  size?: "sm" | "md" | "lg"
  variant?: "fill" | "ring"
  className?: string
}

/**
 * Visual chip for a geofence color. `fill` is the small solid square used
 * in cards and the picker; `ring` is the outlined square used as an inline
 * marker in lists.
 */
export function GeofenceSwatch({
  color,
  size = "md",
  variant = "fill",
  className,
}: GeofenceSwatchProps) {
  const hex = GEOFENCE_COLORS[color]
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block ring-1 ring-foreground/15",
        size === "sm" && "size-3",
        size === "md" && "size-4",
        size === "lg" && "size-5",
        className
      )}
      style={
        variant === "fill"
          ? { backgroundColor: hex }
          : { borderColor: hex, borderWidth: 2, backgroundColor: `${hex}22` }
      }
    />
  )
}
