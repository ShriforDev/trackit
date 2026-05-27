import { Link, useSearchParams } from "react-router"

import { AuthLayout } from "@/components/auth/auth-layout"
import { LoginForm } from "@/components/auth/login-form"

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const invitationId = searchParams.get("invitation")

  return (
    <AuthLayout
      title={invitationId ? "Sign in to accept your invitation" : "Welcome back"}
      subtitle={
        invitationId
          ? "Use your existing trackit account to join the workspace you were invited to."
          : "Sign in to continue tracking your fleet."
      }
      footer={
        invitationId ? (
          <span>
            Don&apos;t have an account yet?{" "}
            <Link
              to={`/invitations/${invitationId}`}
              className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
            >
              Set a password to join
            </Link>
          </span>
        ) : (
          <span>
            Don&apos;t have an account?{" "}
            <Link
              to="/signup"
              className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
            >
              Create one
            </Link>
          </span>
        )
      }
    >
      <LoginForm />
    </AuthLayout>
  )
}
