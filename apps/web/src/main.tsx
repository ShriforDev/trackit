import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router"

import "./index.css"
import { GeofenceNotificationBridge } from "@/components/geofences/notification-bridge"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { FleetStreamProvider } from "@/lib/fleet-stream"
import { router } from "@/router"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <FleetStreamProvider>
        <RouterProvider router={router} />
        <GeofenceNotificationBridge />
        <Toaster position="top-right" richColors closeButton />
      </FleetStreamProvider>
    </ThemeProvider>
  </StrictMode>
)
