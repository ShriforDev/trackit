import { useEffect, useState } from "react"
import { toast } from "sonner"
import { IconAlertCircle, IconCheck, IconDeviceFloppy } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"
import { geofencesApi } from "@/lib/geofences-client"
import { cn } from "@/lib/utils"

import {
  GEOFENCE_COLORS,
  GEOFENCE_COLOR_IDS,
  type GeofenceColorId,
  type GeofenceDTO,
  type UpdateGeofenceInput,
} from "@trackit/shared/geofence"

interface EditSettingsDialogProps {
  open: boolean
  onClose: () => void
  geofence: GeofenceDTO
  onUpdated: (next: GeofenceDTO) => void
}

function formatRadiusLabel(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 2)} km`
  return `${m} m`
}

export function EditSettingsDialog({
  open,
  onClose,
  geofence,
  onUpdated,
}: EditSettingsDialogProps) {
  const [name, setName] = useState(geofence.name)
  const [color, setColor] = useState<GeofenceColorId>(geofence.color)
  const [proximityEnabled, setProximityEnabled] = useState(
    geofence.proximityBufferM > 0
  )
  const [proximityBufferM, setProximityBufferM] = useState(
    geofence.proximityBufferM > 0 ? geofence.proximityBufferM : 200
  )
  const [dwellEnabled, setDwellEnabled] = useState(
    geofence.dwellThresholdMin > 0
  )
  const [dwellThresholdMin, setDwellThresholdMin] = useState(
    geofence.dwellThresholdMin > 0 ? geofence.dwellThresholdMin : 30
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset local state every time the dialog opens with a (potentially new) geofence
  useEffect(() => {
    if (!open) return
    setName(geofence.name)
    setColor(geofence.color)
    setProximityEnabled(geofence.proximityBufferM > 0)
    setProximityBufferM(
      geofence.proximityBufferM > 0 ? geofence.proximityBufferM : 200
    )
    setDwellEnabled(geofence.dwellThresholdMin > 0)
    setDwellThresholdMin(
      geofence.dwellThresholdMin > 0 ? geofence.dwellThresholdMin : 30
    )
    setError(null)
  }, [open, geofence])

  const isDirty =
    name.trim() !== geofence.name ||
    color !== geofence.color ||
    (proximityEnabled ? proximityBufferM : 0) !== geofence.proximityBufferM ||
    (dwellEnabled ? dwellThresholdMin : 0) !== geofence.dwellThresholdMin

  async function onSave() {
    if (!isDirty) {
      onClose()
      return
    }
    if (!name.trim()) {
      setError("Name can't be empty.")
      return
    }
    setIsSubmitting(true)
    setError(null)
    const patch: UpdateGeofenceInput = {}
    if (name.trim() !== geofence.name) patch.name = name.trim()
    if (color !== geofence.color) patch.color = color
    const nextBuffer = proximityEnabled ? proximityBufferM : 0
    if (nextBuffer !== geofence.proximityBufferM) {
      patch.proximityBufferM = nextBuffer
    }
    const nextDwell = dwellEnabled ? dwellThresholdMin : 0
    if (nextDwell !== geofence.dwellThresholdMin) {
      patch.dwellThresholdMin = nextDwell
    }

    try {
      const updated = await geofencesApi.update(geofence.id, patch)
      toast.success(`Updated “${updated.name}”.`)
      onUpdated(updated)
      onClose()
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't save changes."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit geofence</DialogTitle>
          <DialogDescription>
            Update name, color, or alert thresholds. Editing the shape happens
            on its own page.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <Field>
            <FieldLabel htmlFor="edit-geofence-name">Name</FieldLabel>
            <Input
              id="edit-geofence-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Office, HQ campus, ..."
              required
            />
          </Field>

          <Field>
            <FieldLabel>Color</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              {GEOFENCE_COLOR_IDS.map((id) => {
                const active = id === color
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setColor(id)}
                    aria-label={id}
                    aria-pressed={active}
                    className={cn(
                      "relative grid place-items-center transition-transform",
                      active ? "scale-110" : "hover:scale-105"
                    )}
                  >
                    <span
                      className={cn(
                        "block size-7 ring-1 ring-foreground/15 transition-all",
                        active && "ring-2 ring-foreground/60"
                      )}
                      style={{ backgroundColor: GEOFENCE_COLORS[id] }}
                    />
                    {active ? (
                      <IconCheck
                        className="absolute size-3.5 text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.4)]"
                        strokeWidth={3}
                      />
                    ) : null}
                  </button>
                )
              })}
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {color}
            </span>
          </Field>

          <div className="flex flex-col gap-3 border-t pt-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Alerts
            </span>

            <ToggleRow
              label="Approach buffer"
              hint="Notify when a device enters a buffer around the boundary"
              enabled={proximityEnabled}
              onToggle={setProximityEnabled}
            >
              {proximityEnabled ? (
                <div className="flex flex-col gap-1">
                  <input
                    type="range"
                    min={50}
                    max={5_000}
                    step={50}
                    value={proximityBufferM}
                    onChange={(e) =>
                      setProximityBufferM(Number(e.target.value))
                    }
                    className="accent-foreground"
                  />
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span>50 m</span>
                    <span className="text-foreground">
                      {formatRadiusLabel(proximityBufferM)}
                    </span>
                    <span>5 km</span>
                  </div>
                </div>
              ) : null}
            </ToggleRow>

            <ToggleRow
              label="Dwell threshold"
              hint="Notify after a device has stayed inside for ≥ N minutes"
              enabled={dwellEnabled}
              onToggle={setDwellEnabled}
            >
              {dwellEnabled ? (
                <div className="flex flex-col gap-1">
                  <input
                    type="range"
                    min={5}
                    max={1440}
                    step={5}
                    value={dwellThresholdMin}
                    onChange={(e) =>
                      setDwellThresholdMin(Number(e.target.value))
                    }
                    className="accent-foreground"
                  />
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span>5 min</span>
                    <span className="text-foreground">
                      {dwellThresholdMin} min
                    </span>
                    <span>24 hr</span>
                  </div>
                </div>
              ) : null}
            </ToggleRow>
          </div>

          {error ? (
            <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive ring-1 ring-foreground/5">
              <IconAlertCircle className="size-3.5 shrink-0" />
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
            onClick={() => void onSave()}
            disabled={isSubmitting || !name.trim()}
          >
            {isSubmitting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconDeviceFloppy data-icon="inline-start" />
            )}
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ToggleRow({
  label,
  hint,
  enabled,
  onToggle,
  children,
}: {
  label: string
  hint: string
  enabled: boolean
  onToggle: (next: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 border bg-muted/20 px-3 py-2.5 ring-1 ring-foreground/5">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 size-3.5 accent-foreground"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs font-medium leading-tight">{label}</span>
          <span className="text-[10px] leading-tight text-muted-foreground">
            {hint}
          </span>
        </div>
      </label>
      {children}
    </div>
  )
}
