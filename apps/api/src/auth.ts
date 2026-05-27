import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { organization } from "better-auth/plugins/organization"
import { sql } from "drizzle-orm"

import { ac, roles } from "@trackit/shared/permissions"
import { userAdditionalFields } from "@trackit/shared/auth-fields"

import { db } from "./db/client"
import { sendMail } from "./mail/client"
import { renderInvitationEmail } from "./mail/templates"

/**
 * Build a URL-friendly slug from arbitrary input. The org plugin enforces
 * uniqueness on slug, so we tack on a short random suffix to avoid collisions
 * for users with similar emails (alice@a.dev and alice@b.dev).
 */
function generateSlug(seed: string): string {
  const base =
    seed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "org"
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${base}-${suffix}`
}

// Better Auth picks up BETTER_AUTH_SECRET and BETTER_AUTH_URL from process.env
// automatically — no need to repeat them here.
export const auth = betterAuth({
  appName: "trackit",
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  user: {
    additionalFields: userAdditionalFields,
  },
  trustedOrigins: [process.env.WEB_ORIGIN ?? "http://localhost:5173"],
  plugins: [
    organization({
      ac,
      roles,
      creatorRole: "owner",
      // 7 days — slightly longer than the 48h default so demoing the flow
      // across a workweek doesn't expire pending invites.
      invitationExpiresIn: 60 * 60 * 24 * 7,
      // Cancel any pending invite for the same email when a new one is sent.
      // Saves the inviter from the "I sent two, which one is live?" trap.
      cancelPendingInvitationsOnReInvite: true,
      // We auto-verify emails in dev (see databaseHooks.user.create.before
      // below) so this flag is mostly a safety net — flip it on once we add
      // real email verification with a transactional provider.
      requireEmailVerificationOnInvitation: false,
      sendInvitationEmail: async (data) => {
        const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173"
        const url = `${webOrigin}/invitations/${data.id}`
        const inviterName = data.inviter.user.name ?? data.inviter.user.email
        const role = String(data.role)

        // Always log the invite locally so the URL is recoverable from server
        // logs even if email delivery fails.
        console.log(
          `[invite] ${inviterName} invited ${data.email} to "${data.organization.name}" as ${role}\n         ${url}`
        )

        const { subject, text, html } = renderInvitationEmail({
          inviterName,
          organizationName: data.organization.name,
          role,
          url,
          expiresIn: "7 days",
        })

        await sendMail({
          to: data.email,
          subject,
          text,
          html,
        })
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Dev convenience: auto-verify emails since we don't run a real
          // mail server locally. Without this, the org plugin blocks
          // invitation accept/fetch with EMAIL_VERIFICATION_REQUIRED_*.
          // When we wire in a transactional email provider, drop this hook.
          return {
            data: {
              ...user,
              emailVerified: true,
            },
          }
        },
        after: async (user) => {
          // First-time signup → create a personal organization with the new
          // user as owner. session.create.before (below) will then promote
          // that org to the active org for the brand-new session.
          const orgName = `${user.name}'s Organization`
          const slugSeed = user.email.split("@")[0] ?? user.name
          await auth.api.createOrganization({
            body: {
              name: orgName,
              slug: generateSlug(slugSeed),
              userId: user.id,
              keepCurrentActiveOrganization: false,
            },
          })
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          // Pin the user's first (oldest) org membership to the new session
          // so /api/auth/get-session returns activeOrganizationId without an
          // extra round-trip from the client.
          //
          // Note: during signup-with-autoSignIn, the member row is not yet
          // visible to this hook's transaction context — `before` will see
          // <none> and the `after` hook below patches the session row.
          const rows = (await db.execute(
            sql`SELECT organization_id FROM "member" WHERE user_id = ${session.userId} ORDER BY created_at ASC LIMIT 1`
          )) as unknown as Array<{ organization_id: string }>

          const activeOrganizationId = rows[0]?.organization_id

          return {
            data: {
              ...session,
              activeOrganizationId,
            },
          }
        },
        after: async (session) => {
          // Belt-and-suspenders for the autoSignIn-after-signup path: when
          // `before` couldn't see the member row yet, we patch the session
          // row directly here, after the new member is fully visible.
          if (session.activeOrganizationId) return
          const rows = (await db.execute(
            sql`SELECT organization_id FROM "member" WHERE user_id = ${session.userId} ORDER BY created_at ASC LIMIT 1`
          )) as unknown as Array<{ organization_id: string }>

          const orgId = rows[0]?.organization_id
          if (!orgId) return

          await db.execute(
            sql`UPDATE "session" SET active_organization_id = ${orgId} WHERE id = ${session.id}`
          )
        },
      },
    },
  },
})

// Inferred types — use these wherever we deal with the session in our own code.
export type Auth = typeof auth
export type Session = typeof auth.$Infer.Session
