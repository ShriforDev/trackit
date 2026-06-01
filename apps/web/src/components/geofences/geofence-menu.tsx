import { useNavigate } from "react-router"
import {
  IconDots,
  IconExternalLink,
  IconPolygon,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import type { GeofenceDTO } from "@trackit/shared/geofence"

interface GeofenceMenuProps {
  geofence: GeofenceDTO
  isAdmin: boolean
  onEditSettings: () => void
  onDelete: () => void
  /** When true, hides the "Open" item — used on the detail page itself. */
  hideOpen?: boolean
  className?: string
}

/**
 * Three-dot dropdown menu used both in the list-page cards and the
 * detail-page header. Member role gets a no-menu fallback (Open link).
 */
export function GeofenceMenu({
  geofence,
  isAdmin,
  onEditSettings,
  onDelete,
  hideOpen = false,
  className,
}: GeofenceMenuProps) {
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${geofence.name}`}
        className={cn(
          "grid size-7 place-items-center border bg-background text-muted-foreground ring-1 ring-foreground/10 transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
          className
        )}
      >
        <IconDots className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {hideOpen ? null : (
          <DropdownMenuItem
            onClick={() => navigate(`/geofences/${geofence.id}`)}
            className="gap-2"
          >
            <IconExternalLink className="size-3.5" />
            <span>Open</span>
          </DropdownMenuItem>
        )}

        {isAdmin ? (
          <>
            <DropdownMenuItem onClick={onEditSettings} className="gap-2">
              <IconSettings className="size-3.5" />
              <span>Edit settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                navigate(`/geofences/${geofence.id}/edit-shape`)
              }
              className="gap-2"
            >
              <IconPolygon className="size-3.5" />
              <span>Edit shape</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="gap-2 text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
            >
              <IconTrash className="size-3.5" />
              <span>Delete</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
