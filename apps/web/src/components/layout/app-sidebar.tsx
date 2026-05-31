import { useEffect, useState } from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router"
import { toast } from "sonner"
import {
  IconChevronRight,
  IconDeviceMobile,
  IconHome,
  IconLogout,
  IconMail,
  IconMap,
  IconPlayerStopFilled,
  IconSettings,
  IconShape,
  IconUsers,
} from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError } from "@/lib/api"
import {
  organization,
  signOut,
  useSession,
} from "@/lib/auth-client"
import { stopTracking } from "@/lib/device-tracker"
import { useActiveOrg } from "@/lib/use-active-org"
import { useDeviceTracker } from "@/lib/use-device-tracker"
import { cn } from "@/lib/utils"
import type { Role } from "@trackit/shared/permissions"

interface NavItemDef {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Visual hint only — not actually wired. Sells the platform feel. */
  kbd?: string
  /** Permission gate — currently used only for the Team link. */
  needsTeamMgmt?: boolean
  /** Match these path prefixes for active state, beyond the exact `to`. */
  matchPrefixes?: string[]
}

const PRIMARY_NAV: NavItemDef[] = [
  { to: "/", label: "Home", icon: IconHome, kbd: "g h" },
  { to: "/map", label: "Map", icon: IconMap, kbd: "g m" },
  {
    to: "/devices",
    label: "Devices",
    icon: IconDeviceMobile,
    kbd: "g d",
    matchPrefixes: ["/devices"],
  },
  {
    to: "/geofences",
    label: "Geofences",
    icon: IconShape,
    kbd: "g f",
    matchPrefixes: ["/geofences"],
  },
  {
    to: "/team",
    label: "Team",
    icon: IconUsers,
    kbd: "g t",
    needsTeamMgmt: true,
  },
]

/**
 * Compact compass mark for the brand. The needle does a tiny one-shot
 * rotation on first paint — small enough not to be cute, distinctive
 * enough to feel deliberate.
 */
function BrandMark({
  className,
  animate,
}: {
  className?: string
  animate?: boolean
}) {
  return (
    <span
      className={cn(
        "relative grid size-7 shrink-0 place-items-center bg-foreground text-background",
        className
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="size-4"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="8"
          cy="8"
          r="6.5"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.45"
        />
        <path
          d="M8 3.5 L9.5 8 L8 12.5 L6.5 8 Z"
          fill="currentColor"
          className="origin-center"
          style={
            animate
              ? {
                  animation:
                    "trackit-needle 700ms cubic-bezier(0.22, 1, 0.36, 1) 80ms 1 backwards",
                }
              : undefined
          }
        />
        <style>
          {`@keyframes trackit-needle {
              from { transform: rotate(-50deg); opacity: 0; }
              to { transform: rotate(0); opacity: 1; }
            }`}
        </style>
      </svg>
    </span>
  )
}

interface PendingCount {
  count: number
}

interface AppSidebarProps {
  /** "desktop" — sticky 60-wide column hidden below lg.
   *  "drawer"  — full-width inline content for the mobile menu drawer.
   */
  variant?: "desktop" | "drawer"
}

// Module-scoped so the entrance animation fires only on first mount per
// tab session — not on every in-app navigation (which remounts AppShell
// per-page).
let hasMounted = false

export function AppSidebar({ variant = "desktop" }: AppSidebarProps) {
  const isFirstMount = !hasMounted && variant === "desktop"
  if (isFirstMount) hasMounted = true
  const navigate = useNavigate()
  const location = useLocation()
  const { data: session } = useSession()
  const { activeOrg, isLoading: orgLoading } = useActiveOrg()
  const tracker = useDeviceTracker()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [pending, setPending] = useState<PendingCount>({ count: 0 })

  // Pending invitations dot. Refetch when path changes — covers the case
  // where the user just accepted/declined.
  useEffect(() => {
    if (!session) return
    let cancelled = false
    api
      .get<{ id: string }[]>("/invitations/pending")
      .then((rows) => {
        if (!cancelled) setPending({ count: rows.length })
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError) {
          // Soft-fail; the AppHeader banner handles real surfacing.
        }
      })
    return () => {
      cancelled = true
    }
  }, [session, location.pathname])

  const myMembership = activeOrg?.members?.find(
    (m) => m.userId === session?.user.id
  )
  const myRole = (myMembership?.role ?? "member") as Role
  const memberCount = activeOrg?.members?.length ?? 0
  const canManageTeam = activeOrg
    ? organization.checkRolePermission({
        permissions: { invitation: ["create"] },
        role: myRole,
      })
    : false

  const userName = session?.user.name ?? "there"
  const userEmail = session?.user.email
  const initials = (userName || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")

  async function onSignOut() {
    setIsSigningOut(true)
    stopTracking({ silent: true })
    await signOut({})
    setIsSigningOut(false)
    toast.success("Signed out.")
    navigate("/login", { replace: true })
  }

  const isTracking = tracker.status === "tracking"

  return (
    <aside
      data-mount={isFirstMount ? "cascade" : undefined}
      className={cn(
        "flex flex-col gap-4 bg-sidebar text-sidebar-foreground",
        variant === "desktop"
          ? "sticky top-0 hidden h-svh w-60 shrink-0 border-r lg:flex"
          : "h-full w-full"
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 pt-4">
        <BrandMark animate={isFirstMount} />
        <span className="font-mono text-sm font-medium tracking-tight">
          trackit
        </span>
      </div>

      {/* Org card */}
      <div className="px-3">
        <Link
          to="/team"
          className={cn(
            "group flex items-center gap-3 border bg-background/60 px-3 py-2 ring-1 ring-foreground/5 transition-colors",
            "hover:bg-accent/40"
          )}
        >
          {orgLoading ? (
            <Spinner className="size-3 text-muted-foreground" />
          ) : (
            <span className="grid size-6 shrink-0 place-items-center border bg-muted text-[10px] font-medium uppercase">
              {(activeOrg?.name ?? "?").slice(0, 1)}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
            {orgLoading ? (
              <>
                <span className="h-3 w-24 animate-pulse bg-muted" />
                <span className="mt-0.5 h-2.5 w-20 animate-pulse bg-muted/60" />
              </>
            ) : (
              <>
                <span className="truncate text-xs font-medium">
                  {activeOrg?.name ?? "—"}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {myRole} · {memberCount}{" "}
                  {memberCount === 1 ? "member" : "members"}
                </span>
              </>
            )}
          </div>
          <IconChevronRight
            className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </Link>
      </div>

      {/* Primary nav */}
      <SectionLabel>Navigate</SectionLabel>
      <nav className="-mt-2 flex flex-col gap-0.5 px-2">
        {PRIMARY_NAV.map((item) => {
          if (item.needsTeamMgmt && !canManageTeam) return null
          return <NavRow key={item.to} item={item} />
        })}
      </nav>

      {/* Status */}
      <SectionLabel>Status</SectionLabel>
      <div className="-mt-2 flex flex-col gap-1 px-2">
        {isTracking && tracker.activeDeviceId && tracker.activeDeviceName ? (
          <div className="flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            <Link
              to={`/devices/${tracker.activeDeviceId}`}
              className="flex-1 truncate text-[11px] font-medium text-emerald-700 hover:underline dark:text-emerald-300"
              title={`Tracking ${tracker.activeDeviceName}`}
            >
              {tracker.activeDeviceName}
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                stopTracking()
                toast("Tracking stopped.")
              }}
              aria-label="Stop tracking"
              className="-mr-1 h-5 px-1 text-emerald-900 hover:bg-emerald-500/10 hover:text-emerald-950 dark:text-emerald-100"
            >
              <IconPlayerStopFilled className="size-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/40" />
            No active tracker
          </div>
        )}
        {pending.count > 0 ? (
          <Link
            to="/team"
            className="flex items-center gap-2 border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 transition-colors hover:bg-amber-500/10"
          >
            <IconMail className="size-3.5 text-amber-700 dark:text-amber-300" />
            <span className="flex-1 text-[11px] font-medium text-amber-900 dark:text-amber-100">
              {pending.count} pending invitation
              {pending.count === 1 ? "" : "s"}
            </span>
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 px-1 py-0 font-mono text-[10px] text-amber-900 dark:text-amber-100"
            >
              {pending.count}
            </Badge>
          </Link>
        ) : null}
      </div>

      <div className="flex-1" />

      {/* User + footer actions */}
      <div className="flex flex-col gap-1.5 border-t px-3 py-3">
        <div className="flex items-center gap-2.5 px-1">
          <span className="grid size-7 shrink-0 place-items-center border bg-muted text-[10px] font-medium uppercase">
            {initials || "?"}
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-xs font-medium">{userName}</span>
            {userEmail ? (
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {userEmail}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            render={<Link to="/settings" />}
            variant="ghost"
            size="sm"
            className="flex-1 justify-start"
            disabled
            title="Coming soon"
          >
            <IconSettings data-icon="inline-start" />
            Settings
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSignOut}
            disabled={isSigningOut}
            aria-label="Sign out"
          >
            {isSigningOut ? (
              <Spinner />
            ) : (
              <IconLogout className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
    </aside>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </div>
  )
}

function NavRow({ item }: { item: NavItemDef }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) => {
        // Honor matchPrefixes — `/devices` should stay active on
        // `/devices/:id` and `/devices/:id/history`.
        const fallbackActive =
          item.matchPrefixes?.some((p) =>
            window.location.pathname.startsWith(p)
          ) ?? false
        const active = isActive || fallbackActive
        return cn(
          "group flex items-center gap-2.5 border-l-2 border-transparent px-3 py-1.5 text-xs transition-colors",
          active
            ? "border-l-foreground bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )
      }}
    >
      <Icon className="size-3.5" />
      <span className="flex-1">{item.label}</span>
      {item.kbd ? (
        <kbd
          className="hidden font-mono text-[10px] text-muted-foreground/70 group-hover:inline xl:inline"
          aria-hidden
        >
          {item.kbd}
        </kbd>
      ) : null}
    </NavLink>
  )
}
