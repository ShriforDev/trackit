import type { CapacitorConfig } from "@capacitor/cli"

/**
 * Capacitor configuration for the trackit native shell.
 *
 * Strategy:
 * - The shell loads the deployed web UI from `https://trackit.itsshri.space`.
 *   This means UI updates ship with the web deploy — no OTA infrastructure
 *   needed for v1, no APK rebuild for design tweaks.
 * - `webDir` points to the local web build only as a fallback for offline /
 *   first-run scenarios. The shell prefers the live `server.url`.
 * - Native plugins (background geolocation, push, etc.) talk through
 *   Capacitor's bridge — they don't care where the webview points.
 *
 * Why `https` scheme on Android: keeps cookies, secure storage, and
 * service workers behaving the same as on the live site. The default
 * `http://localhost` scheme breaks subtle things.
 *
 * Why `webDir` is ../web/dist: the wrapper bundles the latest web build
 * as an offline fallback. The CI build pipeline runs `bun run build:web`
 * before `bunx cap sync` so this is always up to date.
 */
const config: CapacitorConfig = {
  appId: "space.itsshri.trackit",
  appName: "trackit",
  webDir: "../web/dist",
  server: {
    url: "https://trackit.itsshri.space",
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    backgroundColor: "#FFFFFF",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#FFFFFF",
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#FFFFFF",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
}

export default config
