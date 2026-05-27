import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"
import { IconBuilding } from "@tabler/icons-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError } from "@/lib/api"
import { organization, signIn, useSession } from "@/lib/auth-client"

interface InvitationPreview {
  id: string
  email: string
  role: string | null
  organization: { id: string; name: string }
  inviter: { name: string; email: string }
}

type LocationState = { from?: string } | null

const roleVariants: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
}

export function LoginForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { refetch } = useSession()

  const invitationId = searchParams.get("invitation")
  const redirectTo = (location.state as LocationState)?.from ?? "/"

  const [invitation, setInvitation] = useState<InvitationPreview | null>(null)
  const [invitationError, setInvitationError] = useState<string | null>(null)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch the invitation preview once if ?invitation= is present so we can
  // lock the email field and message the user about which org they're
  // joining.
  useEffect(() => {
    if (!invitationId) return
    let cancelled = false
    api
      .get<InvitationPreview>(`/invitations/${invitationId}/preview`)
      .then((data) => {
        if (cancelled) return
        setInvitation(data)
        setEmail(data.email)
      })
      .catch((err) => {
        if (cancelled) return
        const msg =
          err instanceof ApiError
            ? err.status === 410
              ? "This invitation isn't valid anymore."
              : err.message
            : "Couldn't load the invitation."
        setInvitationError(msg)
      })
    return () => {
      cancelled = true
    }
  }, [invitationId])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const result = await signIn.email({ email, password })
    if (result.error) {
      setError(
        result.error.message ??
          "We couldn't sign you in. Check your details and try again."
      )
      setIsSubmitting(false)
      return
    }

    // Invitation flow: accept the invite + set-active to that org, then
    // land on /devices. Skip the redirectTo state.
    if (invitationId && invitation) {
      const acceptRes = await organization.acceptInvitation({ invitationId })
      if (acceptRes.error) {
        // Account is signed in; just warn and continue.
        toast.warning(
          acceptRes.error.message ??
            "You're signed in, but the invitation couldn't be accepted just now."
        )
      } else {
        await organization.setActive({
          organizationId: invitation.organization.id,
        })
        toast.success(`Joined ${invitation.organization.name}.`)
      }
      await refetch()
      navigate("/devices", { replace: true })
      return
    }

    toast.success("Welcome back.")
    await refetch()
    navigate(redirectTo, { replace: true })
  }

  const lockEmail = !!invitation
  const inInvitationFlow = !!invitationId

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-6"
      aria-busy={isSubmitting}
    >
      {inInvitationFlow ? (
        invitation ? (
          <div className="flex items-start gap-2.5 border bg-muted/40 px-3 py-2.5 text-xs">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center bg-foreground text-background">
              <IconBuilding className="size-3.5" />
            </span>
            <div className="flex flex-col gap-1 leading-relaxed">
              <span>
                <span className="font-medium">
                  {invitation.inviter.name}
                </span>{" "}
                invited you to{" "}
                <span className="font-medium">
                  {invitation.organization.name}
                </span>{" "}
                as{" "}
                <Badge
                  variant={
                    roleVariants[invitation.role ?? "member"] ?? "outline"
                  }
                  className="ml-0.5"
                >
                  {invitation.role ?? "member"}
                </Badge>
                .
              </span>
              <span className="text-[11px] text-muted-foreground">
                Sign in to accept and join the workspace.
              </span>
            </div>
          </div>
        ) : invitationError ? (
          <Alert variant="destructive">
            <AlertTitle>Invitation unavailable</AlertTitle>
            <AlertDescription>{invitationError}</AlertDescription>
          </Alert>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            Loading invitation…
          </div>
        )
      ) : null}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus={!lockEmail}
            required
            placeholder="you@trackit.dev"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting || lockEmail}
            readOnly={lockEmail}
          />
          {lockEmail ? (
            <FieldDescription>
              The invitation is bound to this address.
            </FieldDescription>
          ) : null}
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
            autoFocus={lockEmail}
          />
          {!inInvitationFlow ? (
            <FieldDescription>
              Forgot your password?{" "}
              <a
                href="#"
                aria-disabled
                className="cursor-not-allowed opacity-50"
              >
                Reset (coming soon)
              </a>
            </FieldDescription>
          ) : null}
        </Field>
      </FieldGroup>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting || (inInvitationFlow && !invitation)}
      >
        {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
        {isSubmitting
          ? inInvitationFlow
            ? "Joining…"
            : "Signing in…"
          : inInvitationFlow && invitation
            ? `Sign in & join ${invitation.organization.name}`
            : "Sign in"}
      </Button>
    </form>
  )
}
