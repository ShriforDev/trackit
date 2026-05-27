import { and, eq } from "drizzle-orm"
import { createMiddleware } from "hono/factory"

import type { Role } from "@trackit/shared/permissions"

import { auth } from "../auth"
import { db } from "../db/client"
import { member } from "../db/schema"

export interface SessionContext {
  userId: string
  email: string
  organizationId: string
  role: Role
}

/**
 * Resolves a Better Auth session from the request cookies and looks up the
 * caller's role in their active organization. Routes that mount this
 * middleware get a typed `c.get("session")` returning a SessionContext.
 *
 * Errors are intentionally minimal — we don't leak why a request was
 * rejected beyond the bucket (unauthorized / no_active_organization /
 * not_a_member).
 */
export const requireSession = createMiddleware<{
  Variables: { session: SessionContext }
}>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) {
    return c.json({ error: "unauthorized" }, 401)
  }

  const organizationId = session.session.activeOrganizationId
  if (!organizationId) {
    return c.json({ error: "no_active_organization" }, 400)
  }

  // Look up the caller's role in this org. The org plugin guarantees a
  // member row exists for any user with an activeOrganizationId set, so
  // missing here is a hard error (not a soft 404).
  const [memberRow] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.userId, session.user.id),
        eq(member.organizationId, organizationId)
      )
    )
    .limit(1)

  if (!memberRow) {
    return c.json({ error: "not_a_member" }, 403)
  }

  c.set("session", {
    userId: session.user.id,
    email: session.user.email,
    organizationId,
    role: memberRow.role as Role,
  })

  await next()
})

/** Convenience: returns true for owner/admin, false for member. */
export function isOrgAdmin(role: Role): boolean {
  return role === "owner" || role === "admin"
}
