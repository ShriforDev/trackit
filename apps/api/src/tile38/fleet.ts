import { tile38 } from "./client"

/**
 * TTL on every fleet SET. Devices that stop reporting fall off the live
 * snapshot automatically after this window — useful so a closed browser
 * tab doesn't leave a stale dot on the map indefinitely.
 */
export const FLEET_TTL_SECONDS = 300 // 5 minutes

/** Per-org collection key. Tenant isolation is enforced at this layer. */
function fleetKey(organizationId: string): string {
  return `fleet:${organizationId}`
}

/** Numeric fields stored alongside each Tile38 point. */
const FIELD_KEYS = [
  "accuracyM",
  "altitudeM",
  "headingDeg",
  "speedMps",
  "batteryPct",
  "capturedAtUnix",
] as const
type FieldKey = (typeof FIELD_KEYS)[number]

export interface SetFleetLocationInput {
  organizationId: string
  deviceId: string
  lat: number
  lon: number
  fields?: Partial<Record<FieldKey, number>>
}

/**
 * Tile38 SET ... POINT. We always set EX so devices auto-expire on
 * disconnect. Fields are numeric only (Tile38 limitation) — strings live
 * in Postgres and get joined in for the snapshot response.
 *
 * @example
 *   SET fleet:org-abc dev-123 EX 300 FIELD accuracyM 12 FIELD capturedAtUnix 1716700000 POINT 12.97 77.59
 */
export async function setFleetLocation(
  input: SetFleetLocationInput
): Promise<void> {
  const args: (string | number)[] = [
    fleetKey(input.organizationId),
    input.deviceId,
    "EX",
    FLEET_TTL_SECONDS,
  ]

  if (input.fields) {
    for (const key of FIELD_KEYS) {
      const value = input.fields[key]
      if (typeof value === "number" && Number.isFinite(value)) {
        args.push("FIELD", key, value)
      }
    }
  }

  args.push("POINT", input.lat, input.lon)

  // Tile38 returns `{"ok":true,...}` in JSON mode; throws on protocol errors.
  await tile38.call("SET", ...args)
}

export interface FleetSnapshotEntry {
  deviceId: string
  lat: number
  lon: number
  fields: Partial<Record<FieldKey, number>>
}

/**
 * Tile38 SCAN over the org's collection. Returns every active position
 * paired with its numeric fields. SCAN is not strictly ordered but for our
 * "current snapshot" use case that's fine — the UI sorts client-side.
 *
 * Limit defaults to 1000; the org-tenant assumption is comfortably under
 * that. Bump if needed.
 */
export async function getFleetSnapshot(
  organizationId: string,
  limit = 1000
): Promise<FleetSnapshotEntry[]> {
  const reply = (await tile38.call(
    "SCAN",
    fleetKey(organizationId),
    "LIMIT",
    String(limit)
  )) as string

  // SCAN against an empty/non-existent key still returns ok=true with
  // an empty objects array; no special-case needed.
  const parsed = JSON.parse(reply) as {
    ok: boolean
    fields?: string[]
    objects?: Array<{
      id: string
      object: { type: "Point"; coordinates: [number, number] }
      fields?: number[]
    }>
  }

  if (!parsed.ok || !parsed.objects) return []

  const fieldNames = parsed.fields ?? []

  return parsed.objects.map((obj) => {
    const [lon, lat] = obj.object.coordinates
    const fields: Partial<Record<FieldKey, number>> = {}

    if (obj.fields) {
      for (let i = 0; i < fieldNames.length; i++) {
        const name = fieldNames[i] as FieldKey
        const value = obj.fields[i]
        // Tile38 reports 0 for unset fields. We can't distinguish "0"
        // from "unset" so we keep them — the UI treats 0 as "unknown"
        // for accuracy/heading by checking against capturedAtUnix.
        if (typeof value === "number") fields[name] = value
      }
    }

    return { deviceId: obj.id, lat, lon, fields }
  })
}

/**
 * GET a single device's current position from Tile38.
 * Returns null if the device hasn't reported (or its TTL elapsed).
 */
export async function getFleetDevice(
  organizationId: string,
  deviceId: string
): Promise<FleetSnapshotEntry | null> {
  const reply = (await tile38.call(
    "GET",
    fleetKey(organizationId),
    deviceId,
    "WITHFIELDS"
  )) as string

  const parsed = JSON.parse(reply) as {
    ok: boolean
    object?: { type: "Point"; coordinates: [number, number] }
    fields?: Record<string, number>
  }

  if (!parsed.ok || !parsed.object) return null

  const [lon, lat] = parsed.object.coordinates
  const fields: Partial<Record<FieldKey, number>> = {}

  if (parsed.fields) {
    for (const key of FIELD_KEYS) {
      const value = parsed.fields[key]
      if (typeof value === "number") fields[key] = value
    }
  }

  return { deviceId, lat, lon, fields }
}

/** Remove a device's entry — used when a device is archived or deleted. */
export async function dropFleetDevice(
  organizationId: string,
  deviceId: string
): Promise<void> {
  try {
    await tile38.call("DEL", fleetKey(organizationId), deviceId)
  } catch (err) {
    // DEL on a non-existent key returns a JSON envelope with ok:true;
    // protocol-level failures still throw.
    console.warn(
      "[fleet] DEL failed",
      organizationId,
      deviceId,
      err instanceof Error ? err.message : err
    )
  }
}
