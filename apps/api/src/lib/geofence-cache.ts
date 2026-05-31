import { and, eq, isNull } from "drizzle-orm"

import type {
  GeofenceColorId,
  GeofenceShape,
} from "@trackit/shared/geofence"

import { db } from "../db/client"
import {
  geofence,
  geofenceShapeVersion,
} from "../db/geofence-schema"

/**
 * Hot-path cache for the geofence-detection engine. The location ingest
 * endpoint (POST /devices/:id/locations) needs the org's active geofences
 * + their current shape on every fix; querying the DB inline would mean
 * 1–2 extra round-trips per device per fix.
 *
 * Invariant: the cache always returns a *consistent snapshot* per org —
 * no torn reads where a geofence row exists but its shape doesn't.
 *
 * TTL is intentionally short (30 s). Any successful CRUD on the
 * geofence resource calls `invalidateOrg(orgId)` which forces the next
 * read to re-query, so the TTL is just a safety net for races where a
 * cache invalidation is missed.
 *
 * For multi-instance scaling we'd swap this for a Redis/PG-LISTEN
 * coordinator, but at single-instance scale the in-process map is plenty.
 */

export interface CachedGeofence {
  id: string
  organizationId: string
  name: string
  color: GeofenceColorId
  shape: GeofenceShape
  shapeVersionId: string
  proximityBufferM: number
  dwellThresholdMin: number
}

interface OrgEntry {
  loadedAt: number
  geofences: CachedGeofence[]
}

const TTL_MS = 30_000

const orgCache = new Map<string, OrgEntry>()

/**
 * Get the active (non-deleted) geofences for an org. Returns a snapshot
 * — the caller may freely iterate/copy without holding any lock.
 */
export async function getActiveGeofences(
  organizationId: string
): Promise<CachedGeofence[]> {
  const cached = orgCache.get(organizationId)
  if (cached && Date.now() - cached.loadedAt < TTL_MS) {
    return cached.geofences
  }

  const rows = await db
    .select({
      id: geofence.id,
      organizationId: geofence.organizationId,
      name: geofence.name,
      color: geofence.color,
      shape: geofenceShapeVersion.shape,
      shapeVersionId: geofenceShapeVersion.id,
      proximityBufferM: geofence.proximityBufferM,
      dwellThresholdMin: geofence.dwellThresholdMin,
    })
    .from(geofence)
    .innerJoin(
      geofenceShapeVersion,
      eq(geofence.currentShapeVersionId, geofenceShapeVersion.id)
    )
    .where(
      and(
        eq(geofence.organizationId, organizationId),
        isNull(geofence.deletedAt)
      )
    )

  const snapshot: CachedGeofence[] = rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    color: r.color,
    shape: r.shape,
    shapeVersionId: r.shapeVersionId,
    proximityBufferM: r.proximityBufferM,
    dwellThresholdMin: r.dwellThresholdMin,
  }))

  orgCache.set(organizationId, {
    loadedAt: Date.now(),
    geofences: snapshot,
  })
  return snapshot
}

/**
 * Drop the org's cache entry. Call after any successful create / update
 * / shape-change / delete on a geofence in that org.
 */
export function invalidateOrg(organizationId: string): void {
  orgCache.delete(organizationId)
}

/** Drop everything — used by tests + on graceful shutdown. */
export function clearAllGeofenceCaches(): void {
  orgCache.clear()
}
