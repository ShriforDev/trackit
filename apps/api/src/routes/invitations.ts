import { and, asc, eq, gt } from "drizzle-orm"
import { Hono } from "hono"

import { db } from "../db/client"
import { invitation, organization, user } from "../db/schema"
import {
  requireSession,
  type SessionContext,
} from "../middleware/session"

const invitations = new Hono()

/**
 * Pending invitations for the currently signed-in user, addressed by their
 * verified email. Used to power the in-app banner on the AppHeader so users
 * who signed in normally (and never opened the email) still see and act on
 * invites.
 *
 * IMPORTANT: must be registered BEFORE the /:id/preview route below, or
 * Hono will match `pending` as the dynamic id.
 */
const pendingApp = new Hono<{ Variables: { session: SessionContext } }>()

pendingApp.use("*", requireSession)

pendingApp.get("/", async (c) => {
  const { email } = c.get("session")

  const rows = await db
    .select({
      id: invitation.id,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      inviterName: user.name,
      inviterEmail: user.email,
    })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .innerJoin(user, eq(invitation.inviterId, user.id))
    .where(
      and(
        eq(invitation.email, email.toLowerCase()),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date())
      )
    )
    .orderBy(asc(invitation.createdAt))

  return c.json(
    rows.map((r) => ({
      id: r.id,
      role: r.role,
      status: r.status,
      expiresAt: r.expiresAt.toISOString(),
      organization: {
        id: r.organizationId,
        name: r.organizationName,
        slug: r.organizationSlug,
      },
      inviter: { name: r.inviterName, email: r.inviterEmail },
    }))
  )
})

invitations.route("/pending", pendingApp)

/**
 * Public invitation preview. Anyone holding the (unguessable) invitation id
 * can read just enough to render the onboarding card without signing in:
 * inviter name, org name, role, status, expiry, and whether an account
 * already exists for the invited email so the UI can branch between
 * "set password to join" and "sign in to join".
 *
 * Public is fine because the invitation id is the unguessable secret — same
 * threat model as the email link itself.
 */
invitations.get("/:id/preview", async (c) => {
  const id = c.req.param("id")

  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      inviterName: user.name,
      inviterEmail: user.email,
    })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .innerJoin(user, eq(invitation.inviterId, user.id))
    .where(eq(invitation.id, id))
    .limit(1)

  if (!row) {
    return c.json({ error: "not_found" }, 404)
  }

  // Surface a friendly explanation for terminal states. The client doesn't
  // need to do extra work to figure out why the invite isn't actionable.
  const now = new Date()
  if (row.status !== "pending") {
    return c.json({ error: "not_actionable", status: row.status }, 410)
  }
  if (row.expiresAt < now) {
    return c.json(
      { error: "expired", status: "expired", expiresAt: row.expiresAt.toISOString() },
      410
    )
  }

  // Does an account already exist for the invited email? Lets the UI pick
  // between an inline signup form and a redirect to /login?invitation=ID.
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, row.email.toLowerCase()))
    .limit(1)

  return c.json({
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    organization: {
      id: row.organizationId,
      name: row.organizationName,
      slug: row.organizationSlug,
    },
    inviter: {
      name: row.inviterName,
      email: row.inviterEmail,
    },
    hasAccount: !!existing,
  })
})

export { invitations as invitationRoutes }
