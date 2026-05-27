import { useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { toast } from "sonner"
import {
  IconCompass,
  IconDeviceMobile,
  IconLogout,
  IconMapPin,
  IconShieldLock,
  IconUsersGroup,
} from "@tabler/icons-react"

import { TRACKING_CONSENT_VERSION } from "@trackit/shared/consent"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { authClient, signOut, useSession } from "@/lib/auth-client"

interface ConsentBullet {
  icon: typeof IconShieldLock
  title: string
  body: string
}

const bullets: ConsentBullet[] = [
  {
    icon: IconMapPin,
    title: "Live location",
    body: "While a device is actively tracking, we record latitude, longitude and accuracy — plus altitude, heading and speed when the device reports them.",
  },
  {
    icon: IconDeviceMobile,
    title: "Device context",
    body: "When you register a device, we capture the user agent, OS, browser, screen size, language and timezone so the device list stays meaningful.",
  },
  {
    icon: IconUsersGroup,
    title: "Visibility",
    body: "Owners and admins of your organization can see every device. Members see only their own and devices explicitly shared with them.",
  },
  {
    icon: IconShieldLock,
    title: "Your control",
    body: "You can pause tracking globally, pause any single device, archive a device, or leave the organization at any time.",
  },
]

export function ConsentPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: session, refetch } = useSession()
  const [isAccepting, setIsAccepting] = useState(false)
  const [isDeclining, setIsDeclining] = useState(false)

  const fromState = location.state as { from?: { pathname?: string } } | null
  const intendedPath = fromState?.from?.pathname ?? "/"

  async function onAccept() {
    setIsAccepting(true)
    const { error } = await authClient.updateUser({
      trackingConsentAt: new Date(),
      trackingConsentVersion: TRACKING_CONSENT_VERSION,
    })
    if (error) {
      setIsAccepting(false)
      toast.error(error.message ?? "Couldn't save your choice. Try again.")
      return
    }
    // Refresh session so the guard sees the new consent immediately.
    await refetch()
    toast.success("Tracking consent saved.")
    navigate(intendedPath === "/consent" ? "/" : intendedPath, {
      replace: true,
    })
  }

  async function onDecline() {
    setIsDeclining(true)
    await signOut({})
    setIsDeclining(false)
    toast("Signed out. You can come back any time.")
    navigate("/login", { replace: true })
  }

  const userEmail = session?.user.email
  const isWorking = isAccepting || isDeclining

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-lg border bg-background ring-1 ring-foreground/10">
        {/* Brand strip */}
        <div className="flex items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center bg-foreground text-background">
              <IconCompass className="size-4" />
            </span>
            <span className="text-sm font-medium tracking-tight">trackit</span>
          </div>
          {userEmail ? (
            <span className="text-[10px] text-muted-foreground">
              {userEmail}
            </span>
          ) : null}
        </div>

        {/* Body */}
        <div className="flex flex-col gap-6 px-6 py-7">
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-fit items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <IconShieldLock className="size-3.5" />
              Tracking consent · {TRACKING_CONSENT_VERSION}
            </span>
            <h1 className="font-heading text-2xl font-medium leading-tight tracking-tight text-balance">
              Before you start tracking devices
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              trackit is a location-tracking product. We need your explicit
              consent before any device on your account streams its position.
              Here&apos;s exactly what that means.
            </p>
          </div>

          <ul className="flex flex-col gap-4">
            {bullets.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center border bg-muted text-foreground">
                  <Icon className="size-3.5" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium">{title}</span>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Your acceptance is recorded against version{" "}
            <span className="font-medium text-foreground">
              {TRACKING_CONSENT_VERSION}
            </span>
            . If we materially change what trackit collects, we&apos;ll bring
            you back here to re-accept.
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              onClick={onDecline}
              disabled={isWorking}
              size="default"
            >
              {isDeclining ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconLogout data-icon="inline-start" />
              )}
              Decline and sign out
            </Button>
            <Button onClick={onAccept} disabled={isWorking} size="default">
              {isAccepting ? <Spinner data-icon="inline-start" /> : null}
              I understand — start using trackit
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
