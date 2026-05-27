import { Navigate, useLocation } from "react-router"

import { Spinner } from "@/components/ui/spinner"
import { useSession } from "@/lib/auth-client"

export function FullPageLoader() {
  return (
    <div className="grid min-h-svh place-items-center">
      <Spinner className="text-muted-foreground" />
    </div>
  )
}

/**
 * Gate for protected routes. Redirects to /login if the visitor has no
 * session, while preserving the originally-requested URL so we can bounce
 * back after sign-in.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()
  const location = useLocation()

  if (isPending) return <FullPageLoader />
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    )
  }
  return <>{children}</>
}

/**
 * Inverse gate. If the visitor is already signed in, send them home — no
 * sense in showing them /login or /signup.
 *
 * Exception: when an `?invitation=ID` query param is present, the user is
 * arriving from an invitation email and the page (login/signup) needs to
 * complete the accept-invitation flow. Don't redirect them; let the page
 * decide whether to show the form (different account) or auto-accept
 * (same account).
 */
export function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()
  const location = useLocation()

  if (isPending) return <FullPageLoader />

  const invitationId = new URLSearchParams(location.search).get("invitation")
  if (session && !invitationId) return <Navigate to="/" replace />
  return <>{children}</>
}
