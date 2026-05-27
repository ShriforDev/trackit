import { Navigate, useLocation } from "react-router"

import { TRACKING_CONSENT_VERSION } from "@trackit/shared/consent"

import { useSession } from "@/lib/auth-client"

import { FullPageLoader } from "./auth-guard"

interface RequireConsentProps {
  children: React.ReactNode
}

/**
 * Wraps any tracking-related route. Must sit *inside* RequireAuth — it
 * assumes the session has loaded. Bounces the user to /consent if:
 *   • they've never accepted, or
 *   • the consent version they accepted is older than the current one.
 *
 * The original location is preserved via state.from so /consent can return
 * the user to where they were trying to go.
 */
export function RequireConsent({ children }: RequireConsentProps) {
  const { data: session, isPending } = useSession()
  const location = useLocation()

  if (isPending) return <FullPageLoader />
  if (!session) return null // RequireAuth above us is handling redirect

  // Better Auth additionalFields are returned on session.user. The Date type
  // round-trips as a string over the wire, so accept either.
  const user = session.user as typeof session.user & {
    trackingConsentAt?: Date | string | null
    trackingConsentVersion?: string | null
  }

  const hasAccepted =
    !!user.trackingConsentAt &&
    user.trackingConsentVersion === TRACKING_CONSENT_VERSION

  if (!hasAccepted) {
    return <Navigate to="/consent" replace state={{ from: location }} />
  }

  return <>{children}</>
}
