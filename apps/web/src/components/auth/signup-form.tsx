import { useState } from "react"
import type { FormEvent } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { signUp } from "@/lib/auth-client"

const MIN_PASSWORD = 8

export function SignupForm() {
  const navigate = useNavigate()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`)
      return
    }

    setIsSubmitting(true)
    const result = await signUp.email({ email, password, name })
    setIsSubmitting(false)

    if (result.error) {
      setError(
        result.error.message ??
          "We couldn't create your account. Try again in a moment."
      )
      return
    }

    toast.success("Account created. Welcome to trackit.")
    navigate("/", { replace: true })
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-6"
      aria-busy={isSubmitting}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Full name</FieldLabel>
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            autoFocus
            required
            placeholder="Ada Lovelace"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">Work email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@trackit.dev"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
          />
          <FieldDescription>
            Use a mix of letters, numbers, and symbols.
          </FieldDescription>
        </Field>
      </FieldGroup>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Sign-up failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  )
}
