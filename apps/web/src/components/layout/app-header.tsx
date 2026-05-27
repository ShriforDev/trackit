import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"
import {
  IconBuilding,
  IconCompass,
  IconDeviceMobile,
  IconLogout,
  IconMap,
  IconUsers,
} from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import {
  organization,
  signOut,
  useActiveOrganization,
  useSession,
} from "@/lib/auth-client"
import { stopTracking } from "@/lib/device-tracker"
import type { Role } from "@trackit/shared/permissions"

import { PendingInvitationBanner } from "./pending-invitation-banner"
import { TrackingPill } from "./tracking-pill"
import { TrackingResumePrompt } from "./tracking-resume-prompt"

const roleVariants: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
}

/**
 * App header used on every authenticated page. Surfaces the active
 * organization, the user's role, and gates the Team link by the
 * `invitation:create` permission.
 */
export function AppHeader() {
  const navigate = useNavigate()
  const { data: session } = useSession()
  const { data: activeOrg, isPending: orgPending } = useActiveOrganization()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function onSignOut() {
    setIsSigningOut(true)
    // Don't leave a geolocation watch firing into a 401 after signout.
    stopTracking({ silent: true })
    await signOut({})
    setIsSigningOut(false)
    toast.success("Signed out.")
    navigate("/login", { replace: true })
  }

  const userName = session?.user.name ?? "there"
  const userEmail = session?.user.email
  const initials = (userName || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

  const myMembership = activeOrg?.members?.find(
    (m) => m.userId === session?.user.id
  )
  const myRole = (myMembership?.role ?? "member") as Role

  // checkRolePermission is sync against our static role definitions — perfect
  // for view-time gating without round-tripping to the server.
  const canManageTeam = activeOrg
    ? organization.checkRolePermission({
        permissions: { invitation: ["create"] },
        role: myRole,
      })
    : false

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b bg-background/80 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <span className="grid size-7 place-items-center bg-foreground text-background">
            <IconCompass className="size-4" />
          </span>
          <span className="text-sm font-medium tracking-tight">trackit</span>
        </Link>

        {orgPending ? (
          <div className="hidden items-center gap-2 pl-3 sm:flex">
            <Separator orientation="vertical" className="h-5" />
            <Spinner className="size-3 text-muted-foreground" />
          </div>
        ) : activeOrg ? (
          <div className="hidden items-center gap-2.5 pl-3 sm:flex">
            <Separator orientation="vertical" className="h-5" />
            <IconBuilding className="size-3.5 text-muted-foreground" />
            <span
              className="max-w-[16ch] truncate text-xs font-medium"
              title={activeOrg.name}
            >
              {activeOrg.name}
            </span>
            <Badge variant={roleVariants[myRole] ?? "outline"}>{myRole}</Badge>
          </div>
        ) : null}

        {canManageTeam ? (
          <nav className="hidden items-center gap-1 pl-2 sm:flex">
            <Separator orientation="vertical" className="h-5" />
            <Button
              render={<Link to="/map" />}
              variant="ghost"
              size="sm"
              className="ml-1"
            >
              <IconMap data-icon="inline-start" />
              Map
            </Button>
            <Button
              render={<Link to="/devices" />}
              variant="ghost"
              size="sm"
            >
              <IconDeviceMobile data-icon="inline-start" />
              Devices
            </Button>
            <Button
              render={<Link to="/team" />}
              variant="ghost"
              size="sm"
            >
              <IconUsers data-icon="inline-start" />
              Team
            </Button>
          </nav>
        ) : (
          <nav className="hidden items-center gap-1 pl-2 sm:flex">
            <Separator orientation="vertical" className="h-5" />
            <Button
              render={<Link to="/map" />}
              variant="ghost"
              size="sm"
              className="ml-1"
            >
              <IconMap data-icon="inline-start" />
              Map
            </Button>
            <Button
              render={<Link to="/devices" />}
              variant="ghost"
              size="sm"
            >
              <IconDeviceMobile data-icon="inline-start" />
              Devices
            </Button>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-3">
        <TrackingPill />
        <div className="hidden items-center gap-2.5 sm:flex">
          <span className="grid size-7 place-items-center border bg-muted text-xs font-medium uppercase">
            {initials || "?"}
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-medium">{userName}</span>
            {userEmail ? (
              <span className="text-[10px] text-muted-foreground">
                {userEmail}
              </span>
            ) : null}
          </div>
        </div>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onSignOut}
          disabled={isSigningOut}
        >
          {isSigningOut ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <IconLogout data-icon="inline-start" />
          )}
          Sign out
        </Button>
      </div>
    </header>
    <PendingInvitationBanner />
    <TrackingResumePrompt />
    </>
  )
}

export function AppFooter() {
  return (
    <footer className="border-t px-6 py-4 text-[11px] text-muted-foreground">
      trackit · multi-tenant device tracking · press{" "}
      <kbd className="rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
        d
      </kbd>{" "}
      to toggle theme
    </footer>
  )
}
