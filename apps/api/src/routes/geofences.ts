import { and, asc, count, desc, eq, isNull } from "drizzle-orm"
import { Hono } from "hono"
import { nanoid } from "nanoid"

import {
  GEOFENCE_COLORS,
  createGeofenceInputSchema,
  updateGeofenceInputSchema,
  updateGeofenceShapeInputSchema,
  type GeofenceColorId,
  type GeofenceDTO,
  type GeofenceEventDTO,
  type GeofenceEventTypeName,
} from "@trackit/shared/geofence"

import { db } from "../db/client"
import {
  deviceGeofenceState,
  geofence,
  geofenceShapeVersion,
} from "../db/geofence-schema"
import {
  isOrgAdmin,
  requireSession,
  type SessionContext,
} from "../middleware/session"
import { invalidateOrg } from "../lib/geofence-cache"
import { insertGeofenceEvent } from "../lib/geofence-detect"
import {
  evaluatePoint,
  polygonHasSelfIntersection,
} from "../lib/geofence-geometry"
import { emitGeofenceMessage } from "../ws/fleet-bus"

const geofences = new Hono<{ Variables: { session: SessionContext } }>()

geofences.use("*", requireSession)

// ----- helpers -------------------------------------------------------------

function isValidColor(color: string): color is GeofenceColorId {
  return color in GEOFENCE_COLORS
}

async function loadDtoById(id: string): Promise<GeofenceDTO | null> {
  const [row] = await db
    .select({
      id: geofence.id,
      organizationId: geofence.organizationId,
      name: geofence.name,
      color: geofence.color,
      shape: geofenceShapeVersion.shape,
      shapeVersionId: geofenceShapeVersion.id,
      shapeRevision: geofenceShapeVersion.revision,
      proximityBufferM: geofence.proximityBufferM,
      dwellThresholdMin: geofence.dwellThresholdMin,
      createdBy: geofence.createdBy,
      createdAt: geofence.createdAt,
      updatedAt: geofence.updatedAt,
      deletedAt: geofence.deletedAt,
    })
    .from(geofence)
    .innerJoin(
      geofenceShapeVersion,
      eq(geofence.currentShapeVersionId, geofenceShapeVersion.id)
    )
    .where(eq(geofence.id, id))
    .limit(1)
  if (!row || row.deletedAt) return null
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    color: row.color,
    shape: row.shape,
    shapeVersionId: row.shapeVersionId,
    shapeRevision: row.shapeRevision,
    proximityBufferM: row.proximityBufferM,
    dwellThresholdMin: row.dwellThresholdMin,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ----- GET /api/geofences --------------------------------------------------

geofences.get("/", async (c) => {
  const { organizationId } = c.get("session")
  const rows = await db
    .select({
      id: geofence.id,
      organizationId: geofence.organizationId,
      name: geofence.name,
      color: geofence.color,
      shape: geofenceShapeVersion.shape,
      shapeVersionId: geofenceShapeVersion.id,
      shapeRevision: geofenceShapeVersion.revision,
      proximityBufferM: geofence.proximityBufferM,
      dwellThresholdMin: geofence.dwellThresholdMin,
      createdBy: geofence.createdBy,
      createdAt: geofence.createdAt,
      updatedAt: geofence.updatedAt,
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
    .orderBy(desc(geofence.createdAt))

  // Inside-counts in a single grouped query.
  const insideRows = await db
    .select({
      geofenceId: deviceGeofenceState.geofenceId,
      n: count(),
    })
    .from(deviceGeofenceState)
    .innerJoin(geofence, eq(geofence.id, deviceGeofenceState.geofenceId))
    .where(
      and(
        eq(geofence.organizationId, organizationId),
        eq(deviceGeofenceState.isInside, true)
      )
    )
    .groupBy(deviceGeofenceState.geofenceId)
  const insideMap = new Map(insideRows.map((r) => [r.geofenceId, Number(r.n)]))

  const dtos: GeofenceDTO[] = rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    color: r.color,
    shape: r.shape,
    shapeVersionId: r.shapeVersionId,
    shapeRevision: r.shapeRevision,
    proximityBufferM: r.proximityBufferM,
    dwellThresholdMin: r.dwellThresholdMin,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    insideCount: insideMap.get(r.id) ?? 0,
  }))

  return c.json(dtos)
})

// ----- GET /api/geofences/:id ---------------------------------------------

geofences.get("/:id", async (c) => {
  const id = c.req.param("id")
  const { organizationId } = c.get("session")
  const dto = await loadDtoById(id)
  if (!dto || dto.organizationId !== organizationId) {
    return c.json({ error: "not_found" }, 404)
  }

  // Inside count for this geofence.
  const [{ n }] = await db
    .select({ n: count() })
    .from(deviceGeofenceState)
    .where(
      and(
        eq(deviceGeofenceState.geofenceId, id),
        eq(deviceGeofenceState.isInside, true)
      )
    )

  return c.json({ ...dto, insideCount: Number(n) } satisfies GeofenceDTO)
})

// ----- POST /api/geofences -------------------------------------------------

geofences.post("/", async (c) => {
  const { userId, organizationId, role } = c.get("session")
  if (!isOrgAdmin(role)) {
    return c.json({ error: "forbidden", reason: "owner_or_admin_only" }, 403)
  }

  const json = await c.req.json().catch(() => null)
  const parsed = createGeofenceInputSchema.safeParse(json)
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400
    )
  }

  const { name, color, shape, proximityBufferM, dwellThresholdMin } = parsed.data
  if (!isValidColor(color)) {
    return c.json({ error: "invalid_color" }, 400)
  }
  if (shape.kind === "polygon" && polygonHasSelfIntersection(shape)) {
    return c.json({ error: "self_intersecting_polygon" }, 400)
  }

  const geofenceId = nanoid()
  const versionId = nanoid()
  const now = new Date()

  await db.transaction(async (tx) => {
    await tx.insert(geofence).values({
      id: geofenceId,
      organizationId,
      name,
      color,
      currentShapeVersionId: null, // patched below once version row is in
      proximityBufferM: proximityBufferM ?? 0,
      dwellThresholdMin: dwellThresholdMin ?? 0,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    await tx.insert(geofenceShapeVersion).values({
      id: versionId,
      geofenceId,
      revision: 1,
      shape,
      editedBy: userId,
      createdAt: now,
    })
    await tx
      .update(geofence)
      .set({ currentShapeVersionId: versionId })
      .where(eq(geofence.id, geofenceId))
  })

  invalidateOrg(organizationId)
  const dto = (await loadDtoById(geofenceId))!
  emitGeofenceMessage(organizationId, { type: "geofence:created", geofence: dto })
  return c.json(dto, 201)
})

// ----- PATCH /api/geofences/:id  (rename, recolor, alert config) -----------

geofences.patch("/:id", async (c) => {
  const id = c.req.param("id")
  const { organizationId, role } = c.get("session")
  if (!isOrgAdmin(role)) {
    return c.json({ error: "forbidden", reason: "owner_or_admin_only" }, 403)
  }

  const dto = await loadDtoById(id)
  if (!dto || dto.organizationId !== organizationId) {
    return c.json({ error: "not_found" }, 404)
  }

  const json = await c.req.json().catch(() => null)
  const parsed = updateGeofenceInputSchema.safeParse(json)
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400
    )
  }

  const next = parsed.data
  if (next.color && !isValidColor(next.color)) {
    return c.json({ error: "invalid_color" }, 400)
  }

  await db
    .update(geofence)
    .set({
      ...(next.name !== undefined ? { name: next.name } : {}),
      ...(next.color !== undefined ? { color: next.color } : {}),
      ...(next.proximityBufferM !== undefined
        ? { proximityBufferM: next.proximityBufferM }
        : {}),
      ...(next.dwellThresholdMin !== undefined
        ? { dwellThresholdMin: next.dwellThresholdMin }
        : {}),
    })
    .where(eq(geofence.id, id))

  invalidateOrg(organizationId)
  const fresh = (await loadDtoById(id))!
  emitGeofenceMessage(organizationId, { type: "geofence:updated", geofence: fresh })
  return c.json(fresh)
})

// ----- POST /api/geofences/:id/shape  (new shape revision + re-evaluate) ---

geofences.post("/:id/shape", async (c) => {
  const id = c.req.param("id")
  const { userId, organizationId, role } = c.get("session")
  if (!isOrgAdmin(role)) {
    return c.json({ error: "forbidden", reason: "owner_or_admin_only" }, 403)
  }

  const existing = await loadDtoById(id)
  if (!existing || existing.organizationId !== organizationId) {
    return c.json({ error: "not_found" }, 404)
  }

  const json = await c.req.json().catch(() => null)
  const parsed = updateGeofenceShapeInputSchema.safeParse(json)
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400
    )
  }
  const { shape } = parsed.data
  if (shape.kind === "polygon" && polygonHasSelfIntersection(shape)) {
    return c.json({ error: "self_intersecting_polygon" }, 400)
  }

  const now = new Date()
  const newVersionId = nanoid()
  const newRevision = existing.shapeRevision + 1

  // Insert the new revision + flip the pointer in one transaction. Synthetic
  // events for state-flips happen AFTER the commit so a failure to broadcast
  // doesn't roll back the legitimate shape edit.
  await db.transaction(async (tx) => {
    await tx.insert(geofenceShapeVersion).values({
      id: newVersionId,
      geofenceId: id,
      revision: newRevision,
      shape,
      editedBy: userId,
      createdAt: now,
    })
    await tx
      .update(geofence)
      .set({ currentShapeVersionId: newVersionId, updatedAt: now })
      .where(eq(geofence.id, id))
  })
  invalidateOrg(organizationId)

  // Re-evaluate every device that has either a state row OR a recent fix
  // against the new shape, fire synthetic enter/exit events. We use the
  // device's last-known fix from its state row (or fall back to history.location).
  const stateRows = await db
    .select({
      deviceId: deviceGeofenceState.deviceId,
      isInside: deviceGeofenceState.isInside,
      isInProximity: deviceGeofenceState.isInProximity,
      lastFixLat: deviceGeofenceState.lastFixLat,
      lastFixLon: deviceGeofenceState.lastFixLon,
      lastFixTime: deviceGeofenceState.lastFixTime,
    })
    .from(deviceGeofenceState)
    .where(eq(deviceGeofenceState.geofenceId, id))

  const syntheticEvents: GeofenceEventDTO[] = []
  const newProximityBufferM = existing.proximityBufferM

  for (const s of stateRows) {
    if (s.lastFixLat == null || s.lastFixLon == null) continue
    const evalResult = evaluatePoint(
      { lat: s.lastFixLat, lon: s.lastFixLon },
      shape,
      newProximityBufferM
    )

    let synthetic: GeofenceEventTypeName | null = null
    if (!s.isInside && evalResult.isInside) synthetic = "enter"
    else if (s.isInside && !evalResult.isInside) synthetic = "exit"
    else if (
      !s.isInside &&
      !s.isInProximity &&
      evalResult.isInBuffer
    )
      synthetic = "approach"

    if (synthetic) {
      const evt = await insertGeofenceEvent({
        time: now,
        geofenceId: id,
        shapeVersionId: newVersionId,
        deviceId: s.deviceId,
        organizationId,
        type: synthetic,
        latitude: s.lastFixLat,
        longitude: s.lastFixLon,
      })
      syntheticEvents.push(evt)
    }

    await db
      .update(deviceGeofenceState)
      .set({
        shapeVersionId: newVersionId,
        isInside: evalResult.isInside,
        isInProximity: evalResult.isInBuffer,
        // Touch insideSince / proximitySince on flips so dwell timer is
        // anchored to the moment the shape edit happened.
        ...(!s.isInside && evalResult.isInside ? { insideSince: now } : {}),
        ...(s.isInside && !evalResult.isInside ? { insideSince: null } : {}),
        ...(!s.isInProximity && evalResult.isInBuffer
          ? { proximitySince: now }
          : {}),
        ...(s.isInProximity && !evalResult.isInBuffer
          ? { proximitySince: null }
          : {}),
        // Reset dwell on enter / exit; preserve otherwise.
        ...(s.isInside !== evalResult.isInside ? { dwellAlerted: false } : {}),
      })
      .where(
        and(
          eq(deviceGeofenceState.deviceId, s.deviceId),
          eq(deviceGeofenceState.geofenceId, id)
        )
      )
  }

  const fresh = (await loadDtoById(id))!
  emitGeofenceMessage(organizationId, {
    type: "geofence:shape_changed",
    geofence: fresh,
    revision: newRevision,
  })
  for (const ev of syntheticEvents) {
    emitGeofenceMessage(organizationId, { type: "geofence:event", event: ev })
  }
  return c.json(fresh)
})

// ----- DELETE /api/geofences/:id (soft) ------------------------------------

geofences.delete("/:id", async (c) => {
  const id = c.req.param("id")
  const { organizationId, role } = c.get("session")
  if (!isOrgAdmin(role)) {
    return c.json({ error: "forbidden", reason: "owner_or_admin_only" }, 403)
  }

  const [row] = await db
    .select({ id: geofence.id, organizationId: geofence.organizationId, deletedAt: geofence.deletedAt })
    .from(geofence)
    .where(eq(geofence.id, id))
    .limit(1)
  if (!row || row.organizationId !== organizationId || row.deletedAt) {
    return c.json({ error: "not_found" }, 404)
  }

  await db
    .update(geofence)
    .set({ deletedAt: new Date() })
    .where(eq(geofence.id, id))

  // Detach state rows so future location ingest doesn't keep updating them.
  await db.delete(deviceGeofenceState).where(eq(deviceGeofenceState.geofenceId, id))

  invalidateOrg(organizationId)
  emitGeofenceMessage(organizationId, { type: "geofence:deleted", geofenceId: id })
  return c.json({ ok: true })
})

// ----- GET /api/geofences/:id/shape-versions ------------------------------

geofences.get("/:id/shape-versions", async (c) => {
  const id = c.req.param("id")
  const { organizationId } = c.get("session")
  const [g] = await db
    .select({ id: geofence.id, organizationId: geofence.organizationId, deletedAt: geofence.deletedAt })
    .from(geofence)
    .where(eq(geofence.id, id))
    .limit(1)
  if (!g || g.organizationId !== organizationId || g.deletedAt) {
    return c.json({ error: "not_found" }, 404)
  }

  const rows = await db
    .select({
      id: geofenceShapeVersion.id,
      revision: geofenceShapeVersion.revision,
      shape: geofenceShapeVersion.shape,
      editedBy: geofenceShapeVersion.editedBy,
      createdAt: geofenceShapeVersion.createdAt,
    })
    .from(geofenceShapeVersion)
    .where(eq(geofenceShapeVersion.geofenceId, id))
    .orderBy(asc(geofenceShapeVersion.revision))

  return c.json(
    rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }))
  )
})

export { geofences as geofenceRoutes }
