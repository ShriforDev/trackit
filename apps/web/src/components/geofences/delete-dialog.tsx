import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { IconAlertTriangle, IconTrash } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { GeofenceSwatch } from "@/components/ui/geofence-swatch"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"
import { eventsApi, geofencesApi } from "@/lib/geofences-client"

import {
  type GeofenceDTO,
  isCircleShape,
  isPolygonShape,
} from "@trackit/shared/geofence"

interface DeleteDialogProps {
  open: boolean
  onClose: () => void
  geofence: GeofenceDTO
  onDeleted: (id: string) => void
}

function formatRadius(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km`
  return `${m} m`
}

export function DeleteDialog({
  open,
  onClose,
  geofence,
  onDeleted,
}: DeleteDialogProps) {
  const [confirmName, setConfirmName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [eventCount, setEventCount] = useState<number | null>(null)
  const [eventCountLoading, setEventCountLoading] = useState(false)

  // Reset state and fetch event count when dialog opens
  useEffect(() => {
    if (!open) return
    setConfirmName("")
    setError(null)

    let cancelled = false
    setEventCount(null)
    setEventCountLoading(true)
    eventsApi
      .list({ geofenceIds: [geofence.id], limit: 500 })
      .then((rows) => {
        if (cancelled) return
        // limit is 500; if we got 500 we know it's "500+"
        setEventCount(rows.length)
      })
      .catch(() => {
        if (cancelled) return
        setEventCount(null)
      })
      .finally(() => {
        if (!cancelled) setEventCountLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, geofence.id])

  const shapeMeta = useMemo(() => {
    if (isCircleShape(geofence.shape)) {
      return `Circle · ${formatRadius(geofence.shape.radiusM)}`
    }
    if (isPolygonShape(geofence.shape)) {
      return `Polygon · ${geofence.shape.coordinates.length} vertices`
    }
    return ""
  }, [geofence.shape])

  const isMatching = confirmName.trim() === geofence.name

  async function onConfirm() {
    if (!isMatching) {
      setError(`Type the name exactly to confirm: "${geofence.name}"`)
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await geofencesApi.delete(geofence.id)
      toast.success(`Deleted ${geofence.name}.`)
      onDeleted(geofence.id)
      onClose()
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't delete geofence."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center bg-destructive/10 ring-1 ring-destructive/30"
            >
              <IconAlertTriangle className="size-3.5 text-destructive" />
            </span>
            <DialogTitle>Delete this geofence?</DialogTitle>
          </div>
          <DialogDescription>
            This is a soft delete. Past events stay attached to the geofence
            for the historical record but no new events will fire.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {/* Geofence preview chip */}
          <div className="flex items-center gap-3 border bg-muted/20 px-3 py-2.5 ring-1 ring-foreground/5">
            <GeofenceSwatch color={geofence.color} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium leading-tight">
                {geofence.name}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {shapeMeta} ·{" "}
                {eventCountLoading
                  ? "counting events…"
                  : eventCount === null
                    ? "events unknown"
                    : `${eventCount}${eventCount === 500 ? "+" : ""} past events`}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="confirm-geofence-name"
              className="text-[11px] text-muted-foreground"
            >
              Type{" "}
              <span className="font-mono font-medium text-foreground">
                {geofence.name}
              </span>{" "}
              to confirm:
            </label>
            <Input
              id="confirm-geofence-name"
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={geofence.name}
              autoFocus
              autoComplete="off"
            />
          </div>

          {error ? (
            <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive ring-1 ring-foreground/5">
              <IconAlertTriangle className="size-3.5 shrink-0" />
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => void onConfirm()}
            disabled={isSubmitting || !isMatching}
          >
            {isSubmitting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconTrash data-icon="inline-start" />
            )}
            {isSubmitting ? "Deleting…" : "Delete geofence"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
