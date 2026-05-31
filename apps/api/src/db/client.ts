import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as authSchema from "./schema"
import * as geofenceSchema from "./geofence-schema"
import * as historySchema from "./history-schema"
import * as tenantSchema from "./tenant-schema"

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill it in."
  )
}

// Pooled client. Drizzle uses this for app queries; Better Auth (Step 6)
// gets the same drizzle instance via its drizzle adapter so we share one
// connection pool across the whole api.
const client = postgres(url, {
  max: 10, // pool size
  idle_timeout: 20, // seconds before idle connections are closed
  connect_timeout: 10, // seconds before a connection attempt times out
  prepare: false, // safer with poolers like pgbouncer; tiny perf cost
})

export const schema = {
  ...authSchema,
  ...tenantSchema,
  ...geofenceSchema,
  ...historySchema,
}
export const db = drizzle(client, { schema })
export type Database = typeof db

// Graceful shutdown: drain in-flight queries, then close. Wired into the
// SIGINT/SIGTERM handlers in src/index.ts so dev `Ctrl+C` doesn't leak
// connections.
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 })
}
