import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { IconCheck, IconMailOpened, IconX } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError } from "@/lib/api"
import { organization, useSession } from "@/lib/auth-client"

interface PendingInvitation {
  id: string
  role: string | null
  status: "pending"
  expiresAt: string
  organization: { id: string; name: string; slug: string }
  inviter: { name: string; email: string }
}

const roleVariants: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
}

/**
 * Surfaces invitations addressed to the signed-in user that they haven't
 * acted on yet. Renders inline (not modal) so a returning user who never
 * opened the email still gets pulled into the workspace they were invited
 * to without surprises.
 */
export function PendingInvitationBanner() {
  const { data: session, refetch: refetchSession } = useSession()
  const [invitations, setInvitations] = useState<PendingInvitation[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    try {
      const rows = await api.get<PendingInvitation[]>("/invitations/pending")
      setInvitations(rows)
    } catch (err) {
      // Soft-fail — we don't want to break the page if this endpoint hiccups.
      if (err instanceof ApiError) {
        console.warn("[invitations/pending] error", err.status, err.message)
      }
      setInvitations([])
    }
  }, [session])

  useEffect(() => {
    void load()
  }, [load])

  if (!session || !invitations || invitations.length === 0) return null

  async function onAccept(inv: PendingInvitation) {
    setBusyId(inv.id)
    const { error } = await organization.acceptInvitation({
      invitationId: inv.id,
    })
    if (error) {
      toast.error(error.message ?? "Couldn't accept the invitation.")
      setBusyId(null)
      return
    }
    await organization.setActive({ organizationId: inv.organization.id })
    await refetchSession()
    setInvitations((prev) =>
      prev ? prev.filter((i) => i.id !== inv.id) : prev
    )
    setBusyId(null)
    toast.success(`Joined ${inv.organization.name}.`)
  }

  async function onDecline(inv: PendingInvitation) {
    setBusyId(inv.id)
    const { error } = await organization.rejectInvitation({
      invitationId: inv.id,
    })
    if (error) {
      toast.error(error.message ?? "Couldn't decline the invitation.")
      setBusyId(null)
      return
    }
    setInvitations((prev) =>
      prev ? prev.filter((i) => i.id !== inv.id) : prev
    )
    setBusyId(null)
    toast("Invitation declined.")
  }

  return (
    <div className="sticky top-[3.25rem] z-10 flex flex-col border-b bg-amber-50 dark:bg-amber-950/30">
      {invitations.map((inv) => {
        const isBusy = busyId === inv.id
        return (
          <div
            key={inv.id}
            className="flex flex-wrap items-center justify-between gap-2 border-amber-200/60 px-6 py-2.5 text-xs dark:border-amber-900/40"
          >
            <div className="flex items-center gap-2.5">
              <span className="grid size-6 place-items-center border border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-200">
                <IconMailOpened className="size-3.5" />
              </span>
              <span className="text-amber-950 dark:text-amber-100">
                <span className="font-medium">{inv.inviter.name}</span> invited
                you to{" "}
                <span className="font-medium">{inv.organization.name}</span> as{" "}
                <Badge
                  variant={roleVariants[inv.role ?? "member"] ?? "outline"}
                  className="border-amber-300 dark:border-amber-700/60"
                >
                  {inv.role ?? "member"}
                </Badge>
                .
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDecline(inv)}
                disabled={isBusy}
                className="border-amber-300 bg-transparent hover:bg-amber-100/60 dark:border-amber-700/60 dark:hover:bg-amber-900/30"
              >
                {isBusy ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <IconX data-icon="inline-start" />
                )}
                Decline
              </Button>
              <Button
                size="sm"
                onClick={() => onAccept(inv)}
                disabled={isBusy}
                className="bg-amber-900 text-amber-50 hover:bg-amber-950 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
              >
                {isBusy ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <IconCheck data-icon="inline-start" />
                )}
                Accept
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
