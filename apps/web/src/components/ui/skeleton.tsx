import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A sharp lyra-style skeleton placeholder. Use to fill cards, tables, and
 * stat tiles while data is loading. Pulses opacity rather than the typical
 * "shimmering gradient" — feels more native to the rest of the UI.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "border bg-muted/40 ring-1 ring-foreground/5",
        "[animation:trackit-skeleton_1.4s_ease-in-out_infinite]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
