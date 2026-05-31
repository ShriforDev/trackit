import type {
  CreateGeofenceInput,
  GeofenceDTO,
  GeofenceEventDTO,
  UpdateGeofenceInput,
  UpdateGeofenceShapeInput,
} from "@trackit/shared/geofence"

import { api } from "./api"

/**
 * Thin wrapper around `api.*` for geofences. Mirrors the pattern other
 * features use (devices, invitations) — all calls return typed promises
 * that surface ApiError on non-2xx responses.
 */

export const geofencesApi = {
  list: () => api.get<GeofenceDTO[]>("/geofences"),
  get: (id: string) => api.get<GeofenceDTO>(`/geofences/${id}`),
  create: (input: CreateGeofenceInput) =>
    api.post<GeofenceDTO>("/geofences", input),
  update: (id: string, input: UpdateGeofenceInput) =>
    api.patch<GeofenceDTO>(`/geofences/${id}`, input),
  updateShape: (id: string, input: UpdateGeofenceShapeInput) =>
    api.post<GeofenceDTO>(`/geofences/${id}/shape`, input),
  delete: (id: string) =>
    api.delete<{ ok: true }>(`/geofences/${id}`),
}

/**
 * Events feed. Filterable. `since`/`until` accept ISO strings or Date.
 */
export interface EventsQuery {
  since?: string | Date
  until?: string | Date
  geofenceIds?: string[]
  deviceIds?: string[]
  types?: ("enter" | "exit" | "approach" | "dwell")[]
  limit?: number
}

export const eventsApi = {
  list: (q: EventsQuery = {}) => {
    const sp = new URLSearchParams()
    if (q.since) sp.set("since", q.since instanceof Date ? q.since.toISOString() : q.since)
    if (q.until) sp.set("until", q.until instanceof Date ? q.until.toISOString() : q.until)
    if (q.geofenceIds) q.geofenceIds.forEach((g) => sp.append("geofence", g))
    if (q.deviceIds) q.deviceIds.forEach((d) => sp.append("device", d))
    if (q.types) q.types.forEach((t) => sp.append("type", t))
    if (q.limit) sp.set("limit", String(q.limit))
    return api.get<GeofenceEventDTO[]>(
      sp.toString() ? `/events?${sp.toString()}` : "/events"
    )
  },
  active: () =>
    api.get<
      Array<{
        deviceId: string
        deviceName: string
        deviceColor: string
        geofenceId: string
        geofenceName: string
        geofenceColor: string
        insideSince: string | null
        lastFix: { lat: number; lon: number; time: string } | null
      }>
    >("/events/active"),
}
