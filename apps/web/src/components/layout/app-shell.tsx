import * as React from "react"

import { cn } from "@/lib/utils"

import { AppSidebar } from "./app-sidebar"
import { AppTopbar } from "./app-topbar"
import { type BreadcrumbItem } from "./breadcrumbs"
import { MobileUpdateBanner } from "./mobile-update-banner"
import { PendingInvitationBanner } from "./pending-invitation-banner"
import { TrackingResumePrompt } from "./tracking-resume-prompt"

interface AppShellProps {
  children: React.ReactNode
  /** Breadcrumb trail rendered in the topbar. */
  breadcrumbs?: BreadcrumbItem[]
  /**
   * When true, removes the default padding around <main> so the page can
   * fill the viewport edge-to-edge (Map page uses this).
   */
  flush?: boolean
  /** Extra class on the <main> element. */
  className?: string
}

/**
 * The top-level chrome for every authenticated page. Provides:
 *   - Sticky sidebar (desktop ≥ lg) with brand, org, primary nav, status
 *   - Mobile drawer with the same content (toggled by topbar hamburger)
 *   - Slim topbar with breadcrumbs, theme toggle, tracking pill
 *   - Pending-invitation banner + tracking-resume banner stacked below
 *   - <main> outlet that fills the rest of the viewport
 *
 * Auth pages (login/signup/consent/invitations/) intentionally do NOT
 * use this shell — they continue to use AuthLayout for a focused
 * full-page form treatment.
 */
export function AppShell({
  children,
  breadcrumbs,
  flush,
  className,
}: AppShellProps) {
  return (
    <div className="relative flex min-h-svh bg-background text-foreground">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar breadcrumbs={breadcrumbs} />
        <MobileUpdateBanner />
        <PendingInvitationBanner />
        <TrackingResumePrompt />
        <main
          className={cn(
            "flex flex-1 flex-col",
            flush ? "" : "px-6 py-6 lg:px-8 lg:py-8",
            className
          )}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
