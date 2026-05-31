import { useCallback, useEffect, useMemo, useState } from "react"
import { Navigate } from "react-router"
import { toast } from "sonner"
import {
  IconAlertTriangle,
  IconClock,
  IconMail,
  IconUsers,
  IconX,
} from "@tabler/icons-react"

import { FullPageLoader } from "@/components/auth/auth-guard"
import { AppShell } from "@/components/layout/app-shell"
import { InviteMemberDialog } from "@/components/team/invite-member-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { organization, useSession } from "@/lib/auth-client"
import { useActiveOrg } from "@/lib/use-active-org"
import type { Role } from "@trackit/shared/permissions"

const roleVariants: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
}

interface PendingInvitation {
  id: string
  email: string
  role: string | null
  status: string
  expiresAt: Date
  createdAt?: Date
  inviterId: string
  organizationId: string
}

function formatRelativeTime(date: Date): string {
  const now = Date.now()
  const target = date.getTime()
  const diffMs = target - now
  const absMin = Math.abs(diffMs) / 60_000

  if (absMin < 60) {
    const m = Math.round(absMin)
    return diffMs >= 0 ? `in ${m}m` : `${m}m ago`
  }
  const absHr = absMin / 60
  if (absHr < 24) {
    const h = Math.round(absHr)
    return diffMs >= 0 ? `in ${h}h` : `${h}h ago`
  }
  const absDay = absHr / 24
  const d = Math.round(absDay)
  return diffMs >= 0 ? `in ${d}d` : `${d}d ago`
}

export function TeamPage() {
  const { data: session } = useSession()
  const {
    activeOrg,
    isLoading: orgLoading,
    refetch: refetchOrg,
  } = useActiveOrg()
  const [invitations, setInvitations] = useState<PendingInvitation[] | null>(
    null
  )
  const [invitationsError, setInvitationsError] = useState<string | null>(null)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)

  const myMembership = activeOrg?.members?.find(
    (m) => m.userId === session?.user.id
  )
  const myRole = (myMembership?.role ?? "member") as Role

  const canInvite = useMemo(() => {
    if (!activeOrg) return false
    return organization.checkRolePermission({
      permissions: { invitation: ["create"] },
      role: myRole,
    })
  }, [activeOrg, myRole])

  const loadInvitations = useCallback(async () => {
    setInvitationsError(null)
    const { data, error } = await organization.listInvitations()
    if (error) {
      setInvitationsError(
        error.message ?? "Couldn't load pending invitations."
      )
      setInvitations([])
      return
    }
    const pending = (data ?? []).filter(
      (inv) => inv.status === "pending"
    ) as unknown as PendingInvitation[]
    setInvitations(pending)
  }, [])

  useEffect(() => {
    if (canInvite) loadInvitations()
  }, [canInvite, loadInvitations])

  async function onCancelInvitation(id: string, email: string) {
    setPendingActionId(id)
    const { error } = await organization.cancelInvitation({ invitationId: id })
    setPendingActionId(null)
    if (error) {
      toast.error(error.message ?? "Couldn't cancel that invitation.")
      return
    }
    toast.success(`Cancelled invitation to ${email}.`)
    loadInvitations()
  }

  if (orgLoading) {
    return (
      <AppShell breadcrumbs={[{ label: "Team" }]}>
        <FullPageLoader />
      </AppShell>
    )
  }

  if (!canInvite) {
    return <Navigate to="/" replace />
  }

  const members = activeOrg?.members ?? []

  return (
    <AppShell breadcrumbs={[{ label: "Team" }]}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        {/* Page header */}
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <IconUsers className="size-3.5" />
              Team
            </span>
            <h1 className="font-heading text-3xl font-medium tracking-tight">
              {activeOrg?.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage who can access {activeOrg?.name}. Invitations are valid
              for 7 days.
            </p>
          </div>
          <InviteMemberDialog
            onInvited={() => {
              loadInvitations()
              refetchOrg()
            }}
          />
        </section>

        {/* Members */}
        <section className="flex flex-col gap-3">
          <header className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-medium">
              Members
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {members.length}
              </span>
            </h2>
          </header>
          <div className="border ring-1 ring-foreground/5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44%]">Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No members yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((m) => {
                    // useActiveOrganization returns members with a nested
                    // user object — we lean on it for the display name.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const userInfo = (m as any).user as
                      | { name?: string; email?: string; image?: string | null }
                      | undefined
                    const name =
                      userInfo?.name ??
                      (m.userId === session?.user.id
                        ? session?.user.name
                        : null) ??
                      "Unknown"
                    const email =
                      userInfo?.email ??
                      (m.userId === session?.user.id
                        ? session?.user.email
                        : null) ??
                      ""
                    const initials = (name || "?")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0]?.toUpperCase() ?? "")
                      .join("")
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <span className="grid size-7 place-items-center border bg-muted text-[10px] font-medium uppercase">
                              {initials || "?"}
                            </span>
                            <div className="flex flex-col leading-tight">
                              <span className="text-xs font-medium">
                                {name}
                                {m.userId === session?.user.id ? (
                                  <span className="ml-2 text-[10px] text-muted-foreground">
                                    (you)
                                  </span>
                                ) : null}
                              </span>
                              {email ? (
                                <span className="text-[10px] text-muted-foreground">
                                  {email}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={roleVariants[m.role] ?? "outline"}>
                            {m.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatRelativeTime(new Date(m.createdAt))}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Pending invitations */}
        <section className="flex flex-col gap-3">
          <header className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-medium">
              Pending invitations
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {invitations?.length ?? 0}
              </span>
            </h2>
          </header>

          {invitationsError ? (
            <div className="flex items-center gap-2 border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <IconAlertTriangle className="size-3.5" />
              {invitationsError}
            </div>
          ) : null}

          <div className="border ring-1 ring-foreground/5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44%]">Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations === null ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : invitations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No pending invitations.
                    </TableCell>
                  </TableRow>
                ) : (
                  invitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-7 place-items-center border bg-muted">
                            <IconMail className="size-3.5 text-muted-foreground" />
                          </span>
                          <span className="text-xs">{inv.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {inv.role ? (
                          <Badge
                            variant={roleVariants[inv.role] ?? "outline"}
                          >
                            {inv.role}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <IconClock className="size-3" />
                          {formatRelativeTime(new Date(inv.expiresAt))}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pendingActionId === inv.id}
                          onClick={() => onCancelInvitation(inv.id, inv.email)}
                          aria-label={`Cancel invitation for ${inv.email}`}
                        >
                          <IconX />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </AppShell>
  )
}
