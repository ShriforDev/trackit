import Redis from "ioredis"

// Tile38 speaks the Redis protocol, so we use ioredis as the client.
// The actual Tile38 commands (SET fleet:org id POINT lat lon, NEARBY, etc.)
// are issued via redis.call(...) or redis.sendCommand(...). The /health
// route below just uses PING which works identically against Redis or Tile38.

const host = process.env.TILE38_HOST ?? "localhost"
const port = Number(process.env.TILE38_PORT ?? 9851)

export const tile38 = new Redis({
  host,
  port,
  // Connect immediately so failures surface during boot instead of on first use.
  lazyConnect: false,
  // Backoff on reconnect: 200ms * attempt, capped at 3s.
  retryStrategy: (times) => Math.min(times * 200, 3000),
  // For health/ingest paths we want fast-fail rather than indefinite hangs.
  maxRetriesPerRequest: 3,
  // Helpful for debugging in dev logs.
  connectionName: "trackit-api",
})

tile38.on("error", (err) => {
  // ioredis fires "error" frequently during reconnection; log but don't crash.
  console.warn("[tile38] client error:", err.message)
})

/**
 * Switch Tile38 to JSON output mode. This must be the first command on
 * every (re)connection so subsequent SET/SCAN/GET return parseable JSON
 * strings instead of nested RESP arrays. Re-issued on `ready` so that
 * reconnects recover automatically.
 */
async function enableJsonOutput(): Promise<void> {
  try {
    await tile38.call("OUTPUT", "json")
  } catch (err) {
    console.warn(
      "[tile38] OUTPUT json failed:",
      err instanceof Error ? err.message : err
    )
  }
}

// Queue OUTPUT json right away so it lands BEFORE any application command
// when the offline queue drains on first connect.
void enableJsonOutput()

// And re-apply on every reconnect.
tile38.on("ready", () => {
  console.log("[tile38] connection ready")
  void enableJsonOutput()
})

// Graceful shutdown — wired into the SIGINT/SIGTERM handlers in src/index.ts.
export async function closeTile38(): Promise<void> {
  try {
    await tile38.quit()
  } catch {
    tile38.disconnect()
  }
}
