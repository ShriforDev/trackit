import type { Server } from "bun"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { sql } from "drizzle-orm"
import { auth } from "./auth"
import { closeDb, db } from "./db/client"
import { startDwellSweep, stopDwellSweep } from "./lib/geofence-dwell-sweep"
import { deviceRoutes } from "./routes/devices"
import { eventRoutes } from "./routes/events"
import { fleetRoutes } from "./routes/fleet"
import { geofenceRoutes } from "./routes/geofences"
import { invitationRoutes } from "./routes/invitations"
import { closeTile38, tile38 } from "./tile38/client"
import {
  fleetWebSocketHandlers,
  handleFleetUpgrade,
  type FleetSocketData,
} from "./ws/fleet-server"

const app = new Hono()

app.use("*", logger())
app.use(
  "*",
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  })
)

const startedAt = Date.now()

// Liveness — process is up.
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "@trackit/api",
    version: "0.0.1",
    uptimeMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  })
})

// Readiness for Postgres. Returns 503 if the DB isn't reachable so we can
// wire this into a real orchestrator's probes later.
app.get("/health/db", async (c) => {
  const start = Date.now()
  try {
    await db.execute(sql`SELECT 1`)
    return c.json({ db: "ok", elapsedMs: Date.now() - start })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json(
      { db: "error", elapsedMs: Date.now() - start, message },
      503
    )
  }
})

// Readiness for Tile38 (realtime geo store). With OUTPUT mode set to json
// (see tile38/client.ts), PING returns a JSON envelope `{"ok":true,"ping":"pong",...}`
// — fall back to the plain "PONG" string for safety on a fresh connect.
app.get("/health/tile38", async (c) => {
  const start = Date.now()
  try {
    const reply = await tile38.ping()
    let ok = reply === "PONG"
    if (!ok && typeof reply === "string" && reply.startsWith("{")) {
      try {
        const parsed = JSON.parse(reply) as { ok?: boolean; ping?: string }
        ok = parsed.ok === true || parsed.ping === "pong"
      } catch {
        ok = false
      }
    }
    return c.json({
      tile38: ok ? "ok" : "unexpected",
      reply,
      elapsedMs: Date.now() - start,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json(
      { tile38: "error", elapsedMs: Date.now() - start, message },
      503
    )
  }
})

app.get("/", (c) =>
  c.text("trackit api — see /health, /health/db, /health/tile38")
)

// Better Auth — mounts sign-up, sign-in, sign-out, get-session, etc. under
// /api/auth/*. Hono passes the raw Request straight through.
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))

// Tenant resources, all under /api so they don't collide with frontend
// SPA routes (e.g. /devices, /map, /team) on a hard refresh.
app.route("/api/devices", deviceRoutes)
app.route("/api/events", eventRoutes)
app.route("/api/fleet", fleetRoutes)
app.route("/api/geofences", geofenceRoutes)
app.route("/api/invitations", invitationRoutes)

const port = Number(process.env.API_PORT ?? 3001)

console.log(`[api] listening on http://localhost:${port}`)

// Start the in-process geofence dwell sweep. Idempotent — safe to call
// once at boot.
startDwellSweep()

// Drain DB and Tile38 connections on Ctrl+C / container stop so dev restarts
// are clean.
const shutdown = async (signal: string) => {
  console.log(`[api] received ${signal}, closing connections…`)
  stopDwellSweep()
  const results = await Promise.allSettled([closeDb(), closeTile38()])
  for (const r of results) {
    if (r.status === "rejected") console.error("[api] shutdown error:", r.reason)
  }
  process.exit(0)
}
process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))

export default {
  port,
  /**
   * Bun's serve fetch signature is (req, server). We peel off the WS
   * upgrade path here; everything else falls through to Hono.
   */
  async fetch(req: Request, server: Server<FleetSocketData>) {
    const url = new URL(req.url)
    if (url.pathname === "/ws/fleet") {
      return await handleFleetUpgrade(req, server)
    }
    return app.fetch(req)
  },
  websocket: fleetWebSocketHandlers,
}
