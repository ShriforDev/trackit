import { createBrowserRouter, Navigate } from "react-router"

import { RedirectIfAuth, RequireAuth } from "@/components/auth/auth-guard"
import { RequireConsent } from "@/components/auth/require-consent"
import { ConsentPage } from "@/routes/consent"
import { DeviceDetailPage } from "@/routes/device-detail"
import { DeviceHistoryPage } from "@/routes/device-history"
import { DeviceNewPage } from "@/routes/device-new"
import { DevicesPage } from "@/routes/devices"
import { InvitationPage } from "@/routes/invitation"
import { LoginPage } from "@/routes/login"
import { MapPage } from "@/routes/map"
import { SignupPage } from "@/routes/signup"
import { TeamPage } from "@/routes/team"

export const router = createBrowserRouter([
  {
    // Default landing for an authenticated, consented user is the device list.
    // RequireConsent gates first so the redirect only fires after consent.
    path: "/",
    element: (
      <RequireAuth>
        <RequireConsent>
          <Navigate to="/devices" replace />
        </RequireConsent>
      </RequireAuth>
    ),
  },
  {
    path: "/map",
    element: (
      <RequireAuth>
        <RequireConsent>
          <MapPage />
        </RequireConsent>
      </RequireAuth>
    ),
  },
  {
    path: "/devices",
    element: (
      <RequireAuth>
        <RequireConsent>
          <DevicesPage />
        </RequireConsent>
      </RequireAuth>
    ),
  },
  {
    path: "/devices/new",
    element: (
      <RequireAuth>
        <RequireConsent>
          <DeviceNewPage />
        </RequireConsent>
      </RequireAuth>
    ),
  },
  {
    path: "/devices/:id",
    element: (
      <RequireAuth>
        <RequireConsent>
          <DeviceDetailPage />
        </RequireConsent>
      </RequireAuth>
    ),
  },
  {
    path: "/devices/:id/history",
    element: (
      <RequireAuth>
        <RequireConsent>
          <DeviceHistoryPage />
        </RequireConsent>
      </RequireAuth>
    ),
  },
  {
    path: "/team",
    element: (
      <RequireAuth>
        <TeamPage />
      </RequireAuth>
    ),
  },
  {
    path: "/invitations/:invitationId",
    // Public on purpose — the page itself handles the three branches:
    // signup form, login redirect, or silent auto-accept based on session.
    element: <InvitationPage />,
  },
  {
    // Auth-required but consent-not-required: this IS the consent screen.
    path: "/consent",
    element: (
      <RequireAuth>
        <ConsentPage />
      </RequireAuth>
    ),
  },
  {
    path: "/login",
    element: (
      <RedirectIfAuth>
        <LoginPage />
      </RedirectIfAuth>
    ),
  },
  {
    path: "/signup",
    element: (
      <RedirectIfAuth>
        <SignupPage />
      </RedirectIfAuth>
    ),
  },
  // Catch-all: bounce unknown URLs to /.
  { path: "*", element: <Navigate to="/" replace /> },
])
