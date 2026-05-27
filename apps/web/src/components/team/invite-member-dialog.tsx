import { useState } from "react"
import { toast } from "sonner"
import { IconUserPlus } from "@tabler/icons-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { organization } from "@/lib/auth-client"

type InviteRole = "member" | "admin"

interface InviteMemberDialogProps {
  /** Called after a successful invite so the parent can refetch. */
  onInvited: () => void
}

export function InviteMemberDialog({ onInvited }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<InviteRole>("member")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function reset() {
    setEmail("")
    setRole("member")
    setErrorMessage(null)
    setIsSubmitting(false)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    const { error } = await organization.inviteMember({
      email: email.trim(),
      role,
    })

    setIsSubmitting(false)

    if (error) {
      setErrorMessage(
        error.message ?? "Couldn't send the invitation. Try again."
      )
      return
    }

    toast.success(`Invitation sent to ${email.trim()}.`)
    setOpen(false)
    reset()
    onInvited()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm">
            <IconUserPlus data-icon="inline-start" />
            Invite member
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            They&apos;ll get a link to join your organization. The link is
            valid for 7 days.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="invite-email">Email</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                autoComplete="off"
                autoFocus
                required
                disabled={isSubmitting}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="invite-role">Role</FieldLabel>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as InviteRole)}
              >
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">
                    <span className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium">Member</span>
                      <span className="text-[10px] text-muted-foreground">
                        Manages their own devices
                      </span>
                    </span>
                  </SelectItem>
                  <SelectItem value="admin">
                    <span className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium">Admin</span>
                      <span className="text-[10px] text-muted-foreground">
                        Full access except deleting the org
                      </span>
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                You can change a member&apos;s role later.
              </FieldDescription>
            </Field>

            {errorMessage ? (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>

          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" type="button" disabled={isSubmitting}>
                  Cancel
                </Button>
              }
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconUserPlus data-icon="inline-start" />
              )}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
