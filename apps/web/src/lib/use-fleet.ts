import { useEffect, useRef, useState } from "react"

import type { FleetPosition } from "@trackit/shared"

import { api } from "./api"

export type FleetStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "error"
  | "closed"

interface FleetState {
  /** deviceId -> latest position. Map identity is stable; mutations are in-place + setState(new Map(...)). */
  positions: Map<string, FleetPosition>
  status: FleetStatus
  /** Last error message if status === "error". */
  error: string | null
}

interface FleetServerMessage {
  type: "snapshot" | "delta" | "error"
  payload?: FleetPosition[] | FleetPosition
  message?: string
}

/**
 * Live fleet state. Calls GET /fleet for the initial snapshot, then opens
 * a WS connection to /ws/fleet for deltas. Reconnects with backoff on
 * unexpected close.
 *
 * Caller controls when to subscribe by mounting/unmounting the hook —
 * typically only on the /map route. Anywhere else, don't call this.
 */
export function useFleet(): FleetState {
  const [state, setState] = useState<FleetState>(() => ({
    positions: new Map(),
    status: "connecting",
    error: null,
  }))

  // Keep the Map across renders so deltas merge instead of replacing.
  const positionsRef = useRef<Map<string, FleetPosition>>(state.positions)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptRef = useRef(0)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false

    function applyPositions(next: Map<string, FleetPosition>) {
      positionsRef.current = next
      setState((s) => ({ ...s, positions: next }))
    }

    async function loadInitialSnapshot() {
      try {
        const rows = await api.get<FleetPosition[]>("/fleet")
        if (cancelledRef.current) return
        const next = new Map<string, FleetPosition>()
        for (const r of rows) next.set(r.deviceId, r)
        applyPositions(next)
      } catch (err) {
        // The WS will also send a snapshot on open, so a REST failure
        // isn't fatal — we just surface it as a soft warning and let
        // the WS take over.
        console.warn(
          "[useFleet] initial snapshot failed",
          err instanceof Error ? err.message : err
        )
      }
    }

    function connect() {
      if (cancelledRef.current) return

      // Same-origin by default — Vite proxies /ws → API. In prod, set
      // VITE_API_URL if the API lives on a different origin.
      const baseURL =
        import.meta.env.VITE_API_URL || window.location.origin
      const wsUrl = baseURL.replace(/^http/, "ws") + "/ws/fleet"
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.addEventListener("open", () => {
        reconnectAttemptRef.current = 0
        setState((s) => ({ ...s, status: "live", error: null }))
      })

      ws.addEventListener("message", (ev) => {
        let msg: FleetServerMessage
        try {
          msg = JSON.parse(String(ev.data)) as FleetServerMessage
        } catch {
          return
        }

        if (msg.type === "snapshot" && Array.isArray(msg.payload)) {
          const next = new Map<string, FleetPosition>()
          for (const r of msg.payload) next.set(r.deviceId, r)
          applyPositions(next)
        } else if (msg.type === "delta" && msg.payload && !Array.isArray(msg.payload)) {
          const delta = msg.payload
          const next = new Map(positionsRef.current)
          next.set(delta.deviceId, delta)
          applyPositions(next)
        } else if (msg.type === "error") {
          setState((s) => ({
            ...s,
            status: "error",
            error: msg.message ?? "stream error",
          }))
        }
      })

      ws.addEventListener("close", (ev) => {
        if (cancelledRef.current) return
        // Code 1000 = normal close. Anything else, retry with backoff.
        if (ev.code === 1000) {
          setState((s) => ({ ...s, status: "closed" }))
          return
        }
        const attempt = ++reconnectAttemptRef.current
        const delay = Math.min(1000 * 2 ** (attempt - 1), 15_000)
        setState((s) => ({
          ...s,
          status: "reconnecting",
          error: `disconnected (code ${ev.code}); retrying in ${Math.round(delay / 1000)}s`,
        }))
        setTimeout(() => {
          if (!cancelledRef.current) connect()
        }, delay)
      })

      ws.addEventListener("error", () => {
        // The browser fires error before close; we handle reconnection
        // in the close handler so we don't double-schedule.
      })
    }

    void loadInitialSnapshot()
    connect()

    return () => {
      cancelledRef.current = true
      const ws = wsRef.current
      if (ws && ws.readyState === ws.OPEN) {
        ws.close(1000, "unmount")
      }
      wsRef.current = null
    }
  }, [])

  return state
}
