import { useEffect, useMemo, useState } from "react"

import { ApiError } from "@/lib/api"
import { useFleet } from "@/lib/use-fleet"
import { geofencesApi } from "@/lib/geofences-client"

import { DEVICE_COLORS } from "@trackit/shared"
import {
  type GeofenceColorId,
  type GeofenceDTO,
  type GeofenceEventDTO,
} from "@trackit/shared/geofence"

import type { EventRowDevice, EventRowGeofence } from "./event-row"

/**
 * Fetches and caches the org's geofences so events can be displayed
 * with name+color. Refreshes when the latest event references a
 * geofence we don't yet know about (newly-created geofence).
 */
export function useGeofencesIndex(): {
  byId: Map<string, GeofenceDTO>
  refresh: () => Promise<void>
  isLoading: boolean
  error: string | null
} {
  const [list, setList] = useState<GeofenceDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function load() {
    setIsLoading(true)
    try {
      const rows = await geofencesApi.list()
      setList(rows)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load geofences.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const byId = useMemo(() => {
    const m = new Map<string, GeofenceDTO>()
    if (list) for (const g of list) m.set(g.id, g)
    return m
  }, [list])

  return { byId, refresh: load, isLoading, error }
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
