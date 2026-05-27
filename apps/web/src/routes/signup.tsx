import { Link } from "react-router"

import { AuthLayout } from "@/components/auth/auth-layout"
import { SignupForm } from "@/components/auth/signup-form"

export function SignupPage() {
  return (
    <AuthLayout
      title="Create your account"
      subtitle="The first user becomes the owner of a brand-new organization."
      footer={
        <span>
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
          >
            Sign in
          </Link>
        </span>
      }
    >
      <SignupForm />
    </AuthLayout>
  )
}
