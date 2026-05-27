import { createAuthClient } from "better-auth/react"
import {
  inferAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins"

import { userAdditionalFields } from "@trackit/shared/auth-fields"
import { ac, roles } from "@trackit/shared/permissions"

// Same-origin by default. The Vite dev server proxies /api/auth/* (and
// every other backend path) to the API, so the browser sees a single
// origin for both pages and API calls — no CORS, cookies just work.
//
// In production, set VITE_API_URL to the API's full origin if it lives
// on a different host than the web app.
const baseURL = import.meta.env.VITE_API_URL || undefined

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    // Tells the client about user.additionalFields so updateUser({...})
    // accepts trackingConsentAt / trackingConsentVersion at the type level.
    inferAdditionalFields({
      user: userAdditionalFields,
    }),
    organizationClient({
      ac,
      roles,
    }),
  ],
  // Browser cookie auth is enabled by default; the server sets the session
  // cookie on sign-up / sign-in and Better Auth reads it back automatically.
})

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  organization,
  useActiveOrganization,
  useListOrganizations,
} = authClient

export type Session = typeof authClient.$Infer.Session
