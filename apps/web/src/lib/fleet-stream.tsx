import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { api } from "./api"
import { useSession } from "./auth-client"

import type { FleetPosition } from "@trackit/shared"
import type { GeofenceDTO, GeofenceEventDTO } from "@trackit/shared/geofence"

/**
 * FleetStream — the single websocket subscription for the whole app.
 *
 * Why a provider and not a per-page hook?
 *   - The sidebar needs to surface "new event" badges regardless of
 *     which page you're on.
 *   - Geofence event toasts should fire even when you're on /devices.
 *   - Opening a separate WS per page would cause every component to
 *     receive duplicate events (server broadcasts the same payload to
 *     every connection from the same user).
 *
 * The provider opens a single WS once the user is authenticated, and
 * tears it down on signout. All consumers read state via context
 * helpers (useFleet / useGeofenceEvents / useFleetStream).
 */

export type FleetStatus =
  | "idle" // signed out — no socket
  | "connecting"
  | "live"
  | "reconnecting"
  | "error"
  | "closed"

interface FleetStreamState {
  positions: Map<string, FleetPosition>
  /**
   * Recent geofence events, newest first. Capped at MAX_BUFFERED_EVENTS
   * to keep memory bounded. The /events feed handles older history.
   */
  events: GeofenceEventDTO[]
  /**
   * Live geofence definitions, keyed by id. Updated by REST snapshot at
   * connect, plus WS deltas (`geofence:created`, `:updated`, `:shape_changed`,
   * `:deleted`). Soft-deleted geofences are removed from the map.
   */
  geofences: Map<string, GeofenceDTO>
  status: FleetStatus
  error: string | null
  /**
   * Lifecycle counters used by the sidebar badge etc. Increments every
   * time a new event arrives; resets via clearUnreadEvents().
   */
  unreadEventsCount: number
  lastEventReceivedAt: number | null
  /**
   * Signal for any consumer that wants to react to fresh events
   * (toasts, sound, etc). Components subscribe via useEffect on
   * `latestEvent`.
   */
  latestEvent: GeofenceEventDTO | null
}

interface FleetStreamApi extends FleetStreamState {
  clearUnreadEvents: () => void
}

const MAX_BUFFERED_EVENTS = 200

const FleetStreamContext = createContext<FleetStreamApi | null>(null)

interface InboundMessage {
  type:
    | "snapshot"
    | "delta"
    | "geofence:created"
    | "geofence:updated"
    | "geofence:shape_changed"
    | "geofence:deleted"
    | "geofence:event"
    | "error"
  payload?: FleetPosition[] | FleetPosition
  geofence?: GeofenceDTO
  geofenceId?: string
  revision?: number
  event?: GeofenceEventDTO
  message?: string
}

export function FleetStreamProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending: sessionPending } = useSession()
  const userId = session?.user.id

  const [positions, setPositions] = useState<Map<string, FleetPosition>>(
    () => new Map()
  )
  const [events, setEvents] = useState<GeofenceEventDTO[]>([])
  const [geofences, setGeofences] = useState<Map<string, GeofenceDTO>>(
    () => new Map()
  )
  const [unreadEventsCount, setUnreadCount] = useState(0)
  const [lastEventReceivedAt, setLastEventReceivedAt] = useState<number | null>(
    null
  )
  const [latestEvent, setLatestEvent] = useState<GeofenceEventDTO | null>(null)
  const [status, setStatus] = useState<FleetStatus>("idle")
  const [error, setError] = useState<string | null>(null)

  // Keep mutable refs so handlers don't have to re-subscribe on every state tick.
  const positionsRef = useRef(positions)
  positionsRef.current = positions

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptRef = useRef(0)
  const cancelledRef = useRef(false)

  const clearUnreadEvents = useCallback(() => {
    setUnreadCount(0)
  }, [])

  useEffect(() => {
    // Wait for auth to settle. If signed out, ensure socket is closed.
    if (sessionPending) return
    if (!userId) {
      const ws = wsRef.current
      if (ws) {
        cancelledRef.current = true
        try {
          ws.close(1000, "signed out")
        } catch {
          // ignore
        }
        wsRef.current = null
      }
      setStatus("idle")
      setPositions(new Map())
      setEvents([])
      setGeofences(new Map())
      setLatestEvent(null)
      setUnreadCount(0)
      return
    }

    cancelledRef.current = false

    function applyPositions(next: Map<string, FleetPosition>) {
      positionsRef.current = next
      setPositions(next)
    }

    async function loadInitialSnapshot() {
      try {
        const rows = await api.get<FleetPosition[]>("/fleet")
        if (cancelledRef.current) return
        const next = new Map<string, FleetPosition>()
        for (const r of rows) next.set(r.deviceId, r)
        applyPositions(next)
      } catch (err) {
        // Non-fatal — the WS will also send a snapshot on open.
        console.warn(
          "[fleet-stream] initial snapshot failed",
          err instanceof Error ? err.message : err
        )
      }
    }

    async function loadInitialGeofences() {
      try {
        const rows = await api.get<GeofenceDTO[]>("/geofences")
        if (cancelledRef.current) return
        const next = new Map<string, GeofenceDTO>()
        for (const g of rows) next.set(g.id, g)
        setGeofences(next)
      } catch (err) {
        console.warn(
          "[fleet-stream] geofence snapshot failed",
          err instanceof Error ? err.message : err
        )
      }
    }

    function connect() {
      if (cancelledRef.current) return
      const baseURL =
        import.meta.env.VITE_API_URL || window.location.origin
      const wsUrl = baseURL.replace(/^http/, "ws") + "/ws/fleet"
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      setStatus("connecting")

      ws.addEventListener("open", () => {
        reconnectAttemptRef.current = 0
        setStatus("live")
        setError(null)
      })

      ws.addEventListener("message", (ev) => {
        let msg: InboundMessage
        try {
          msg = JSON.parse(String(ev.data)) as InboundMessage
        } catch {
          return
        }

        if (msg.type === "snapshot" && Array.isArray(msg.payload)) {
          const next = new Map<string, FleetPosition>()
          for (const r of msg.payload) next.set(r.deviceId, r)
          applyPositions(next)
        } else if (
          msg.type === "delta" &&
          msg.payload &&
          !Array.isArray(msg.payload)
        ) {
          const delta = msg.payload
          const next = new Map(positionsRef.current)
          next.set(delta.deviceId, delta)
          applyPositions(next)
        } else if (msg.type === "geofence:event" && msg.event) {
          const evt = msg.event
          setEvents((prev) => {
            const next = [evt, ...prev]
            if (next.length > MAX_BUFFERED_EVENTS) next.length = MAX_BUFFERED_EVENTS
            return next
          })
          setLatestEvent(evt)
          setLastEventReceivedAt(Date.now())
          setUnreadCount((n) => n + 1)
        } else if (
          (msg.type === "geofence:created" ||
            msg.type === "geofence:updated" ||
            msg.type === "geofence:shape_changed") &&
          msg.geofence
        ) {
          const g = msg.geofence
          setGeofences((prev) => {
            const next = new Map(prev)
            next.set(g.id, g)
            return next
          })
        } else if (msg.type === "geofence:deleted" && msg.geofenceId) {
          const id = msg.geofenceId
          setGeofences((prev) => {
            if (!prev.has(id)) return prev
            const next = new Map(prev)
            next.delete(id)
            return next
          })
        } else if (msg.type === "error") {
          setStatus("error")
          setError(msg.message ?? "stream error")
        }
        // Other geofence:* messages can be wired in Phase 4 when we have
        // a place to react to them. For now we only consume the event
        // stream + position deltas.
      })

      ws.addEventListener("close", (ev) => {
        if (cancelledRef.current) return
        if (ev.code === 1000) {
          setStatus("closed")
          return
        }
        const attempt = ++reconnectAttemptRef.current
        const delay = Math.min(1000 * 2 ** (attempt - 1), 15_000)
        setStatus("reconnecting")
        setError(`Disconnected (${ev.code}); retrying in ${Math.round(delay / 1000)}s`)
        setTimeout(() => {
          if (!cancelledRef.current) connect()
        }, delay)
      })

      ws.addEventListener("error", () => {
        // Reconnection is handled in close.
      })
    }

    void loadInitialSnapshot()
    void loadInitialGeofences()
    connect()

    return () => {
      cancelledRef.current = true
      const ws = wsRef.current
      if (ws && ws.readyState === ws.OPEN) {
        ws.close(1000, "provider unmount")
      }
      wsRef.current = null
    }
  }, [userId, sessionPending])

  const value = useMemo<FleetStreamApi>(
    () => ({
      positions,
      events,
      geofences,
      status,
      error,
      unreadEventsCount,
      lastEventReceivedAt,
      latestEvent,
      clearUnreadEvents,
    }),
    [
      positions,
      events,
      geofences,
      status,
      error,
      unreadEventsCount,
      lastEventReceivedAt,
      latestEvent,
      clearUnreadEvents,
    ]
  )

  return (
    <FleetStreamContext.Provider value={value}>
      {children}
    </FleetStreamContext.Provider>
  )
}

function useFleetStreamContext(): FleetStreamApi {
  const ctx = useContext(FleetStreamContext)
  if (!ctx) {
    throw new Error(
      "useFleetStream / useFleet / useGeofenceEvents must be used inside <FleetStreamProvider>."
    )
  }
  return ctx
}

export function useFleetStream(): FleetStreamApi {
  return useFleetStreamContext()
}

/**
 * Read-only access to live fleet positions. Returned shape matches the
 * legacy useFleet contract for backwards compatibility.
 */
export function useFleet(): {
  positions: Map<string, FleetPosition>
  status: FleetStatus
  error: string | null
} {
  const { positions, status, error } = useFleetStreamContext()
  return { positions, status, error }
}

/**
 * Live geofence definitions, kept synced via REST snapshot + WS deltas.
 * Returns both the keyed map and an array view for convenience.
 */
export function useGeofences(): {
  geofences: Map<string, GeofenceDTO>
  list: GeofenceDTO[]
} {
  const { geofences } = useFleetStreamContext()
  const list = useMemo(() => Array.from(geofences.values()), [geofences])
  return { geofences, list }
}

/**
 * Live geofence events buffer + unread tracking. The buffer is bounded
 * (MAX_BUFFERED_EVENTS); the /events feed is responsible for older history.
 */
export function useGeofenceEvents(): {
  events: GeofenceEventDTO[]
  latestEvent: GeofenceEventDTO | null
  lastEventReceivedAt: number | null
  unreadEventsCount: number
  clearUnreadEvents: () => void
  status: FleetStatus
} {
  const {
    events,
    latestEvent,
    lastEventReceivedAt,
    unreadEventsCount,
    clearUnreadEvents,
    status,
  } = useFleetStreamContext()
  return {
    events,
    latestEvent,
    lastEventReceivedAt,
    unreadEventsCount,
    clearUnreadEvents,
    status,
  }
}
