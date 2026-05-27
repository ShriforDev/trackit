import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Link, Navigate, useNavigate, useParams } from "react-router"
import { toast } from "sonner"
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCompass,
  IconShieldLock,
  IconUserPlus,
} from "@tabler/icons-react"

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
import { organization, signUp, useSession } from "@/lib/auth-client"

const MIN_PASSWORD = 8

interface InvitationPreview {
  id: string
  email: string
  role: string | null
  status: "pending"
  expiresAt: string
  organization: { id: string; name: string; slug: string }
  inviter: { name: string; email: string }
  hasAccount: boolean
}

interface PreviewError {
  status: "expired" | "accepted" | "rejected" | "cancelled" | "not_found"
  message: string
}

const roleVariants: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
}

export function InvitationPage() {
  const { invitationId } = useParams<{ invitationId: string }>()
  const navigate = useNavigate()
  const { data: session, isPending: sessionPending, refetch } = useSession()

  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [previewError, setPreviewError] = useState<PreviewError | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const autoAcceptStartedRef = useRef(false)

  useEffect(() => {
    if (!invitationId) {
      setPreviewError({
        status: "not_found",
        message: "Missing invitation id.",
      })
      setIsLoading(false)
      return
    }

    let cancelled = false
    api
      .get<InvitationPreview>(`/invitations/${invitationId}/preview`)
      .then((data) => {
        if (cancelled) return
        setPreview(data)
        setIsLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError) {
          if (err.status === 404) {
            setPreviewError({
              status: "not_found",
              message:
                "This invitation link doesn't match anything we have on file.",
            })
          } else if (err.status === 410) {
            const body = err.body as { status?: string }
            const s = (body?.status ?? "expired") as PreviewError["status"]
            setPreviewError({
              status: s,
              message: explanationFor(s),
            })
          } else {
            setPreviewError({
              status: "not_found",
              message:
                err.message ?? "We couldn't load this invitation right now.",
            })
          }
        } else {
          setPreviewError({
            status: "not_found",
            message: "We couldn't load this invitation right now.",
          })
        }
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [invitationId])

  // Branch C: signed in with the matching email → silent auto-accept.
  useEffect(() => {
    if (!preview || !invitationId) return
    if (sessionPending) return
    if (!session) return
    if (
      session.user.email.toLowerCase() !== preview.email.toLowerCase()
    ) {
      return
    }
    if (autoAcceptStartedRef.current) return
    autoAcceptStartedRef.current = true

    void (async () => {
      const { error } = await organization.acceptInvitation({ invitationId })
      if (error) {
        toast.error(error.message ?? "Couldn't accept the invitation.")
        // Reset so the user can try again or land on the manual UI.
        autoAcceptStartedRef.current = false
        return
      }
      await organization.setActive({
        organizationId: preview.organization.id,
      })
      await refetch()
      toast.success(`Joined ${preview.organization.name}.`)
      navigate("/devices", { replace: true })
    })()
  }, [
    preview,
    session,
    sessionPending,
    invitationId,
    navigate,
    refetch,
  ])

  if (isLoading || sessionPending) {
    return <FocusShell><Spinner /></FocusShell>
  }

  if (previewError) {
    return (
      <ErrorView
        status={previewError.status}
        message={previewError.message}
        signedIn={!!session}
      />
    )
  }

  if (!preview) {
    return (
      <ErrorView
        status="not_found"
        message="We couldn't load this invitation right now."
        signedIn={!!session}
      />
    )
  }

  // Branch C is in flight (auto-accepting) — show a quiet spinner so the
  // user doesn't see the form for a split second before redirect.
  if (
    session &&
    session.user.email.toLowerCase() === preview.email.toLowerCase()
  ) {
    return (
      <FocusShell>
        <div className="flex flex-col items-center gap-3 text-center">
          <Spinner />
          <span className="text-xs text-muted-foreground">
            Joining {preview.organization.name}…
          </span>
        </div>
      </FocusShell>
    )
  }

  // Branch A2: account exists for this email — bounce to /login with the
  // invitation in the query string. The /login form will lock the email
  // and run acceptInvitation post-signin.
  if (preview.hasAccount) {
    return (
      <Navigate
        to={`/login?invitation=${encodeURIComponent(preview.id)}`}
        replace
      />
    )
  }

  // Branch A1: brand new account — render the inline signup form below.
  return <SignupBranch preview={preview} onJoined={() => refetch()} />
}

// ---------- Branch A1 — inline signup ----------

function SignupBranch({
  preview,
  onJoined,
}: {
  preview: InvitationPreview
  onJoined: () => Promise<unknown>
}) {
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    if (password.length < MIN_PASSWORD) {
      setErrorMessage(`Password must be at least ${MIN_PASSWORD} characters.`)
      return
    }

    setIsSubmitting(true)

    // 1. Create the account. Better Auth auto-signs-in on signup.
    const signUpRes = await signUp.email({
      email: preview.email,
      password,
      name: name.trim() || preview.email.split("@")[0],
    })

    if (signUpRes.error) {
      // If the account got created out of band between preview and submit,
      // bounce to /login?invitation=ID so they can sign in instead.
      if (signUpRes.error.status === 422 || signUpRes.error.status === 409) {
        navigate(`/login?invitation=${encodeURIComponent(preview.id)}`, {
          replace: true,
        })
        return
      }
      setErrorMessage(
        signUpRes.error.message ??
          "We couldn't create your account. Try again in a moment."
      )
      setIsSubmitting(false)
      return
    }

    // 2. Accept the invitation now that we have a session.
    const acceptRes = await organization.acceptInvitation({
      invitationId: preview.id,
    })
    if (acceptRes.error) {
      // The account was created and they're signed in — but the invite
      // failed (maybe expired between preview and submit). Don't block
      // them, just take them to the app.
      toast.warning(
        acceptRes.error.message ??
          "We couldn't accept the invitation just now."
      )
      await onJoined()
      navigate("/devices", { replace: true })
      return
    }

    // 3. Switch active org to the just-joined one.
    await organization.setActive({
      organizationId: preview.organization.id,
    })
    await onJoined()

    toast.success(`Welcome to ${preview.organization.name}.`)
    navigate("/devices", { replace: true })
  }

  return (
    <FocusShell wide>
      <BrandHeader />
      <div className="flex flex-col gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <IconUserPlus className="size-3.5" />
          Invitation
        </span>
        <h1 className="font-heading text-2xl font-medium leading-tight tracking-tight text-balance">
          Join {preview.organization.name} on trackit
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">
            {preview.inviter.name}
          </span>{" "}
          invited you as{" "}
          <Badge variant={roleVariants[preview.role ?? "member"] ?? "outline"}>
            {preview.role ?? "member"}
          </Badge>
          . Set a password to create your account and join.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-5"
        aria-busy={isSubmitting}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="invite-email">Email</FieldLabel>
            <Input
              id="invite-email"
              type="email"
              value={preview.email}
              readOnly
              disabled
              aria-readonly
            />
            <FieldDescription>
              The invitation is bound to this address — it can&apos;t be
              changed.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="invite-name">Full name</FieldLabel>
            <Input
              id="invite-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              autoFocus
              required
              placeholder="Ada Lovelace"
              disabled={isSubmitting}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="invite-password">Password</FieldLabel>
            <Input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD}
              placeholder={`At least ${MIN_PASSWORD} characters`}
              disabled={isSubmitting}
            />
            <FieldDescription>
              Use a mix of letters, numbers, and symbols.
            </FieldDescription>
          </Field>
        </FieldGroup>

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t join</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          {isSubmitting
            ? "Creating your account…"
            : `Join ${preview.organization.name}`}
        </Button>
      </form>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Already have an account?{" "}
        <Link
          to={`/login?invitation=${encodeURIComponent(preview.id)}`}
          className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
        >
          Sign in to join
        </Link>
        .
      </p>
    </FocusShell>
  )
}

// ---------- Error view ----------

function ErrorView({
  status,
  message,
  signedIn,
}: {
  status: PreviewError["status"]
  message: string
  signedIn: boolean
}) {
  return (
    <FocusShell>
      <BrandHeader />
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="grid size-10 place-items-center border bg-muted text-muted-foreground">
          <IconAlertTriangle className="size-5" />
        </span>
        <h1 className="font-heading text-xl font-medium leading-tight tracking-tight">
          Invitation unavailable
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
        <Badge variant="outline" className="mt-1 capitalize">
          {status.replace(/_/g, " ")}
        </Badge>
      </div>
      <div className="flex justify-center">
        {signedIn ? (
          <Button render={<Link to="/devices" />} size="sm">
            Back to devices
            <IconArrowRight data-icon="inline-end" />
          </Button>
        ) : (
          <Button render={<Link to="/login" />} size="sm">
            Sign in
            <IconArrowRight data-icon="inline-end" />
          </Button>
        )}
      </div>
    </FocusShell>
  )
}

function explanationFor(
  status: "expired" | "accepted" | "rejected" | "cancelled" | "not_found"
): string {
  switch (status) {
    case "expired":
      return "This invitation has expired. Ask the inviter to send a new one."
    case "accepted":
      return "This invitation has already been accepted. You're good to go."
    case "rejected":
      return "This invitation was declined. Reach out to the inviter if that was a mistake."
    case "cancelled":
      return "This invitation was cancelled by the inviter."
    case "not_found":
    default:
      return "This invitation link doesn't match anything we have on file."
  }
}

// ---------- Layout shells ----------

function FocusShell({
  children,
  wide,
}: {
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-10">
      <div
        className={`w-full ${wide ? "max-w-md" : "max-w-sm"} border bg-background ring-1 ring-foreground/10`}
      >
        <div className="flex flex-col gap-6 px-6 py-7">{children}</div>
      </div>
    </div>
  )
}

function BrandHeader() {
  return (
    <div className="flex items-center justify-between -mx-6 -mt-7 border-b px-6 py-3">
      <div className="flex items-center gap-2.5">
        <span className="grid size-7 place-items-center bg-foreground text-background">
          <IconCompass className="size-4" />
        </span>
        <span className="text-sm font-medium tracking-tight">trackit</span>
      </div>
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <IconShieldLock className="size-3" />
        Invite-only
      </span>
    </div>
  )
}
