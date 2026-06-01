import { useEffect, useState } from "react"

import { ApiError } from "@/lib/api"
import { useFleet, useGeofences } from "@/lib/fleet-stream"
import { geofencesApi } from "@/lib/geofences-client"

import { DEVICE_COLORS } from "@trackit/shared"
import {
  type GeofenceColorId,
  type GeofenceDTO,
  type GeofenceEventDTO,
} from "@trackit/shared/geofence"

import type { EventRowDevice, EventRowGeofence } from "./event-row"

/**
 * Backwards-compatible wrapper around the central `useGeofences()` hook
 * provided by FleetStreamProvider. Existing callers (events feed, live
 * snapshot, notification bridge) keep their `{ byId, refresh, isLoading,
 * error }` shape — but they now automatically reflect WS-driven updates
 * because the underlying state lives in the provider.
 */
export function useGeofencesIndex(): {
  byId: Map<string, GeofenceDTO>
  refresh: () => Promise<void>
  isLoading: boolean
  error: string | null
} {
  const { geofences } = useGeofences()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(geofences.size === 0)

  // The provider already loaded a snapshot at session start. We expose
  // a manual refresh as a no-op fallback for callers that still call it.
  async function refresh() {
    setIsLoading(true)
    try {
      // Trigger a fresh REST list — the provider doesn't currently
      // accept a "manual reload" API, so we simply hit the endpoint
      // again and let WS broadcasts keep things in sync afterwards.
      await geofencesApi.list()
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load geofences.")
    } finally {
      setIsLoading(false)
    }
  }

  // First-load tracking: as soon as the provider has populated the map,
  // mark loading as false. Subsequent renders are always non-loading.
  useEffect(() => {
    if (geofences.size > 0) setIsLoading(false)
  }, [geofences])

  return { byId: geofences, refresh, isLoading, error }
}

function deviceColorHexFor(id: string | undefined): string | undefined {
  if (!id) return undefined
  return DEVICE_COLORS.find((c) => c.id === id)?.hex
}

/**
 * Build display info for a single event from the live fleet snapshot
 * + the geofences index. Returns undefined for either side if the
 * referenced device/geofence isn't currently known — the row falls
 * back to a friendly placeholder in that case.
 */
export function useEventDisplay(
  event: GeofenceEventDTO,
  geofencesById: Map<string, GeofenceDTO>
): {
  device: EventRowDevice | undefined
  geofence: EventRowGeofence | undefined
} {
  const { positions } = useFleet()
  const pos = positions.get(event.deviceId)
  const geo = geofencesById.get(event.geofenceId)

  const device: EventRowDevice | undefined = pos
    ? {
        name: pos.deviceName,
        colorHex: deviceColorHexFor(pos.deviceColor),
      }
    : undefined

  const geofence: EventRowGeofence | undefined = geo
    ? { name: geo.name, color: geo.color as GeofenceColorId }
    : undefined

  return { device, geofence }
}
