import { Hono } from "hono"

/**
 * Public, unauthenticated endpoints for the mobile shell.
 *
 *   GET /api/mobile/version          → latest release metadata (JSON)
 *   GET /api/mobile/android/latest.apk → 302 to the latest signed APK
 *
 * These are hit before the user signs in (APK download from the landing
 * page) and from a cold-launched app that hasn't restored its session
 * yet (in-app update check). Auth-gating them would create a chicken-
 * and-egg problem.
 *
 * The single source of truth is the {@link MOBILE_RELEASE} constant
 * below. Each shipped release bumps this in code; CI tags + GitHub
 * Releases contain the same version string. Two layers:
 *
 *   - `versionCode` — strictly-increasing integer. Used by the in-app
 *     update banner to compare against the running build's
 *     versionCode (read at runtime via @capacitor/app).
 *   - `versionName` — human-readable semver. Shown in update prompts
 *     and changelog UI.
 *
 * `minSupportedVersionCode` lets us hard-cut older builds when an API
 * contract changes incompatibly. Used sparingly — locking out paying
 * users is worse than carrying compat code for a few releases.
 *
 * The download URL is a stable shape:
 *   https://github.com/<owner>/<repo>/releases/download/<tag>/<filename>
 * which GitHub serves over HTTPS with good CDN reach.
 */

// -----------------------------------------------------------------------------
// Release metadata (the single source of truth)
// -----------------------------------------------------------------------------

interface MobileRelease {
  versionCode: number
  versionName: string
  /** Inclusive lower bound — clients below this are forced to update. */
  minSupportedVersionCode: number
  /** ISO-8601 release timestamp. */
  releasedAt: string
  /** Short, plain-text changelog. Shown in the update banner. */
  changelog: string
  /** Filename of the APK asset on the GitHub Release. */
  apkFileName: string
  /** Size in bytes — purely informational, displayed in the update prompt. */
  apkSizeBytes: number | null
}

/**
 * Bump versionCode + versionName here on every release that ships an
 * APK. Keep in sync with `apps/mobile/android/app/build.gradle`.
 *
 * Convention:
 *   - versionCode increments by 1 every release
 *   - versionName follows semver
 *   - minSupportedVersionCode only bumps when an old build literally
 *     cannot work with the current API
 */
const MOBILE_RELEASE: MobileRelease = {
  versionCode: 1,
  versionName: "0.1.0",
  minSupportedVersionCode: 1,
  releasedAt: "2026-06-01T00:00:00Z",
  changelog: "Initial release.",
  apkFileName: "trackit-0.1.0.apk",
  apkSizeBytes: null,
}

const GITHUB_OWNER = "ShriforDev"
const GITHUB_REPO = "trackit"

function downloadUrlFor(release: MobileRelease): string {
  const tag = `v${release.versionName}`
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}/${release.apkFileName}`
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

const mobile = new Hono()

/**
 * GET /api/mobile/version
 *
 * Returns the current release metadata. Cache-friendly so the in-app
 * update check can hit it cheaply.
 */
mobile.get("/version", (c) => {
  c.header("Cache-Control", "public, max-age=60")
  return c.json({
    android: {
      versionCode: MOBILE_RELEASE.versionCode,
      versionName: MOBILE_RELEASE.versionName,
      minSupportedVersionCode: MOBILE_RELEASE.minSupportedVersionCode,
      releasedAt: MOBILE_RELEASE.releasedAt,
      changelog: MOBILE_RELEASE.changelog,
      downloadUrl: downloadUrlFor(MOBILE_RELEASE),
      apkSizeBytes: MOBILE_RELEASE.apkSizeBytes,
    },
  })
})

/**
 * GET /api/mobile/android/latest.apk
 *
 * 302 redirect to the latest signed APK on GitHub Releases. Lets us
 * publish a stable, branded URL on the landing page that survives
 * version bumps — the redirect target moves with each release, the
 * link in the page never changes.
 *
 * Browsers honour the redirect transparently; the user sees a normal
 * download dialog from the trackit domain.
 */
mobile.get("/android/latest.apk", (c) => {
  return c.redirect(downloadUrlFor(MOBILE_RELEASE), 302)
})

export { mobile as mobileRoutes }
