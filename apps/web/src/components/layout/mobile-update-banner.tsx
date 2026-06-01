import { useEffect, useState } from "react"
import {
  IconAlertTriangle,
  IconArrowDown,
  IconX,
} from "@tabler/icons-react"

import { App as CapacitorApp } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Soft + hard in-app update banner.
 *
 * Renders nothing on web — only mounts on the native shell. On a real
 * phone:
 *
 *  - Polls `/api/mobile/version` (every 30 min, on mount, and after
 *    app resume).
 *  - Compares the API's `versionCode` to the running APK's
 *    `Capacitor.getInfo().build`.
 *  - If running >= latest: nothing rendered.
 *  - If running < latest but >= minSupported: soft banner appears
 *    above the page content with "Update" + "Dismiss". Dismissal is
 *    persisted in localStorage and only resets when the API
 *    advertises a newer version than the dismissed one.
 *  - If running < minSupported: full-screen blocking modal — user
 *    cannot dismiss, must update to continue. Sparingly used, only
 *    when an API contract makes the old build literally broken.
 *
 * The "Update" button opens the download URL in the OS browser, which
 * triggers Android's APK install flow. We deliberately don't try to
 * auto-install in-app — that would require sensitive permissions and
 * a more complex updater plugin.
 */

interface MobileVersionInfo {
  android: {
    versionCode: number
    versionName: string
    minSupportedVersionCode: number
    releasedAt: string
    changelog: string
    downloadUrl: string
    apkSizeBytes: number | null
  }
}

const POLL_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const DISMISSED_KEY = "trackit:update-dismissed-versionCode"

export function MobileUpdateBanner() {
  const [latest, setLatest] = useState<MobileVersionInfo["android"] | null>(
    null
  )
  const [runningVersionCode, setRunningVersionCode] = useState<number | null>(
    null
  )
  const [dismissed, setDismissed] = useState<number | null>(() => {
    if (typeof localStorage === "undefined") return null
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  })

  // Read the running build's versionCode once on mount. Only meaningful
  // on native — on web, getInfo throws and we leave it null.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    CapacitorApp.getInfo()
      .then((info) => {
        if (cancelled) return
        const code = Number(info.build)
        setRunningVersionCode(Number.isFinite(code) ? code : null)
      })
      .catch(() => {
        // Older Capacitor versions sometimes throw on getInfo. Soft fail
        // — without a running versionCode we just don't render the banner.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Poll the version endpoint. Refetch on app resume too — the listener
  // in fleet-stream already triggers a soft refresh on resume; this
  // listener is independent so the two systems can evolve separately.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false

    async function fetchLatest() {
      try {
        const res = await fetch("/api/mobile/version", {
          credentials: "include",
        })
        if (!res.ok) return
        const json = (await res.json()) as MobileVersionInfo
        if (cancelled) return
        setLatest(json.android)
      } catch {
        // Offline or transient — silent. We'll retry on next poll / resume.
      }
    }

    void fetchLatest()
    const interval = window.setInterval(() => void fetchLatest(), POLL_INTERVAL_MS)

    let cleanup: (() => void) | null = null
    void CapacitorApp.addListener("appStateChange", (state) => {
      if (state.isActive) void fetchLatest()
    }).then((handle) => {
      if (cancelled) {
        void handle.remove()
        return
      }
      cleanup = () => void handle.remove()
    })

    return () => {
      cancelled = true
      window.clearInterval(interval)
      cleanup?.()
    }
  }, [])

  // Below decision logic — only meaningful when both numbers are known.
  if (!Capacitor.isNativePlatform()) return null
  if (latest === null || runningVersionCode === null) return null
  if (runningVersionCode >= latest.versionCode) return null

  const isForced = runningVersionCode < latest.minSupportedVersionCode
  const isDismissed = !isForced && dismissed === latest.versionCode

  function onUpdate() {
    if (!latest) return
    // window.open with default _blank makes Android's WebView route the
    // request to the system browser, which handles the .apk download +
    // install flow automatically.
    window.open(latest.downloadUrl, "_blank")
  }

  function onDismiss() {
    if (!latest) return
    localStorage.setItem(DISMISSED_KEY, String(latest.versionCode))
    setDismissed(latest.versionCode)
  }

  if (isForced) {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mobile-update-required-title"
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/95 px-6 backdrop-blur"
      >
        <div className="flex w-full max-w-sm flex-col gap-4 border bg-background px-6 py-6 ring-1 ring-foreground/10">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center border bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <IconAlertTriangle className="size-5" />
            </span>
            <h2
              id="mobile-update-required-title"
              className="text-sm font-medium"
            >
              Update required
            </h2>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            This version of trackit is no longer supported. Update to continue
            using the app.
          </p>
          <div className="flex flex-col gap-2 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between font-mono">
              <span>You have</span>
              <span className="text-foreground">
                build {runningVersionCode}
              </span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span>Latest</span>
              <span className="text-foreground">
                {latest.versionName} (build {latest.versionCode})
              </span>
            </div>
          </div>
          <Button onClick={onUpdate} size="sm" className="w-full">
            <IconArrowDown data-icon="inline-start" />
            Download update
          </Button>
        </div>
      </div>
    )
  }

  if (isDismissed) return null

  return (
    <div
      className={cn(
        "border-b border-amber-500/40 bg-amber-500/10 px-4 py-2",
        "flex items-center gap-3 text-xs"
      )}
    >
      <span className="grid size-6 shrink-0 place-items-center border border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <IconArrowDown className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">
          Update available — {latest.versionName}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {latest.changelog}
        </span>
      </div>
      <Button
        onClick={onUpdate}
        size="sm"
        variant="outline"
        className="border-amber-500/40 hover:bg-amber-500/15"
      >
        Update
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss update banner"
        className="grid size-6 shrink-0 place-items-center text-muted-foreground transition-colors hover:text-foreground"
      >
        <IconX className="size-3.5" />
      </button>
    </div>
  )
}
