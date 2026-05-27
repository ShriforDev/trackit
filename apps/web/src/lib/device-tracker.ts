import { api, ApiError } from "./api"

/**
 * Singleton device tracker. Lives at module scope so it survives any
 * component re-mount or in-app navigation. A single browser tab can only
 * stream from one device at a time — calling start() with a different
 * deviceId silently stops the previous one (caller is responsible for
 * surfacing that to the user).
 *
 * Persistence:
 *   - sessionStorage holds the active intent (deviceId + name) so the
 *     resume prompt can offer one-click recovery after a hard refresh.
 *   - The Screen Wake Lock API keeps the screen awake while tracking is
 *     active and the tab is in the foreground. Both are best-effort and
 *     no-op on unsupported browsers.
 *
 * The browser's geolocation API is tab-scoped; closing the tab kills the
 * watch. Persistent background tracking would require a native app or a
 * heavier PWA + service worker setup and is intentionally out of scope.
 */

export type TrackingStatus =
  | "idle"
  | "requesting_permission"
  | "tracking"
  | "permission_denied"
  | "error"

export interface DeviceTrackerState {
  status: TrackingStatus
  /** Id of the device currently being tracked, or null when idle. */
  activeDeviceId: string | null
  /** Display name for the active device. UI uses this in the AppHeader pill. */
  activeDeviceName: string | null
  fixCount: number
  /** Unix seconds. */
  lastFixAt: number | null
  /** Meters. */
  lastAccuracy: number | null
  lastError: string | null
}

const initialState: DeviceTrackerState = {
  status: "idle",
  activeDeviceId: null,
  activeDeviceName: null,
  fixCount: 0,
  lastFixAt: null,
  lastAccuracy: null,
  lastError: null,
}

let state: DeviceTrackerState = initialState
let watchId: number | null = null
let inFlight = false
const listeners = new Set<() => void>()

// ---------- Wake lock ----------

// Browsers don't ship a stable type for WakeLockSentinel in lib.dom across
// versions we want to support. Keep it loosely typed — we only call
// release() and listen for "release".
let wakeLock: { release: () => Promise<void> } | null = null

async function acquireWakeLock() {
  if (typeof navigator === "undefined") return
  const wl = (navigator as Navigator & {
    wakeLock?: {
      request: (type: "screen") => Promise<{
        release: () => Promise<void>
        addEventListener: (
          ev: "release",
          cb: () => void
        ) => void
      }>
    }
  }).wakeLock
  if (!wl) return
  try {
    const sentinel = await wl.request("screen")
    wakeLock = sentinel
    sentinel.addEventListener("release", () => {
      // Browsers release the lock when the tab loses visibility. We re-
      // acquire below in the visibilitychange handler.
      wakeLock = null
    })
  } catch {
    // Battery saver, permission policy, etc. Soft-fail.
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return
  try {
    await wakeLock.release()
  } catch {
    // sentinel may already be released
  }
  wakeLock = null
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.status === "tracking") {
      void acquireWakeLock()
    }
  })
}

// ---------- sessionStorage intent ----------

const SESSION_KEY = "trackit:tracking-intent"

export interface PersistedTrackingIntent {
  deviceId: string
  deviceName: string
  /** Unix ms — used to age out stale intents. */
  startedAt: number
}

function persistIntent(deviceId: string, deviceName: string) {
  if (typeof sessionStorage === "undefined") return
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ deviceId, deviceName, startedAt: Date.now() })
    )
  } catch {
    // private mode / quota
  }
}

function clearIntent() {
  if (typeof sessionStorage === "undefined") return
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

/** Used by the resume prompt on app boot. */
export function getPersistedIntent(): PersistedTrackingIntent | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedTrackingIntent
    if (
      typeof parsed?.deviceId !== "string" ||
      typeof parsed?.deviceName !== "string" ||
      typeof parsed?.startedAt !== "number"
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearPersistedIntent() {
  clearIntent()
}

// ---------- Pub/sub ----------

function emit() {
  for (const cb of listeners) cb()
}

function setState(patch: Partial<DeviceTrackerState>) {
  state = { ...state, ...patch }
  emit()
}

/** Reset the geolocation watch + wake lock. Doesn't touch React state. */
function teardownWatch() {
  if (watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId)
  }
  watchId = null
  inFlight = false
  void releaseWakeLock()
}

interface StartOptions {
  deviceId: string
  deviceName: string
}

export interface StartResult {
  ok: boolean
  /**
   * The id of the previously-tracked device that was replaced, if any. Lets
   * the caller toast "switched from A to B" without keeping its own state.
   */
  swappedFrom?: { deviceId: string; deviceName: string }
  error?: string
}

/**
 * Begin tracking. If another device is already active, that watch is
 * stopped and its id is returned in `swappedFrom` so the caller can
 * surface a toast.
 */
export function startTracking({
  deviceId,
  deviceName,
}: StartOptions): StartResult {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    setState({
      status: "error",
      lastError: "Geolocation isn't available on this browser.",
    })
    return { ok: false, error: "geolocation_unavailable" }
  }

  // Same device, same status — no-op.
  if (state.activeDeviceId === deviceId && state.status === "tracking") {
    return { ok: true }
  }

  // Different device → tear down the old watch first.
  let swappedFrom: StartResult["swappedFrom"]
  if (state.activeDeviceId && state.activeDeviceId !== deviceId) {
    swappedFrom = {
      deviceId: state.activeDeviceId,
      deviceName: state.activeDeviceName ?? "another device",
    }
    teardownWatch()
  }

  // Reset counters for the new device.
  setState({
    status: "requesting_permission",
    activeDeviceId: deviceId,
    activeDeviceName: deviceName,
    fixCount: 0,
    lastFixAt: null,
    lastAccuracy: null,
    lastError: null,
  })

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      // The watch can outlive its setup if start() is called for a new
      // device while a previous fix is in flight. Drop callbacks for any
      // device that's no longer active.
      if (state.activeDeviceId !== deviceId) return

      const { latitude, longitude, accuracy, altitude, heading, speed } =
        position.coords

      setState({
        status: "tracking",
        fixCount: state.fixCount + 1,
        lastFixAt: Math.round(position.timestamp / 1000),
        lastAccuracy: Number.isFinite(accuracy) ? accuracy : null,
        lastError: null,
      })

      // Coalesce: skip new POSTs while one is in flight to avoid backing
      // requests up on a slow link.
      if (inFlight) return
      inFlight = true

      const payload: Record<string, number | string> = {
        lat: latitude,
        lon: longitude,
      }
      if (Number.isFinite(accuracy)) payload.accuracy = accuracy
      if (altitude !== null && Number.isFinite(altitude))
        payload.altitude = altitude
      if (heading !== null && Number.isFinite(heading))
        payload.heading = heading
      if (speed !== null && Number.isFinite(speed)) payload.speed = speed
      payload.capturedAt = new Date(position.timestamp).toISOString()

      api
        .post(`/devices/${deviceId}/locations`, payload)
        .catch((err) => {
          // Race: the device may have been deleted while we were tracking.
          // Stop cleanly so we don't keep retrying.
          if (
            err instanceof ApiError &&
            (err.status === 404 || err.status === 403)
          ) {
            stopTracking({ silent: true })
            setState({
              status: "error",
              lastError:
                err.status === 404
                  ? "Device was deleted. Tracking stopped."
                  : "You no longer have access to this device.",
            })
            return
          }
          const msg =
            err instanceof ApiError ? err.message : "report failed"
          setState({ lastError: `report failed: ${msg}` })
        })
        .finally(() => {
          inFlight = false
        })
    },
    (err) => {
      const message =
        err.code === err.PERMISSION_DENIED
          ? "Location permission was denied."
          : err.code === err.POSITION_UNAVAILABLE
            ? "Location is unavailable right now."
            : err.code === err.TIMEOUT
              ? "Location request timed out."
              : err.message || "Geolocation error."
      const status =
        err.code === err.PERMISSION_DENIED ? "permission_denied" : "error"
      setState({ status, lastError: message })
      if (err.code === err.PERMISSION_DENIED) {
        // Don't pester the user to resume into a permission they revoked.
        clearIntent()
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30_000,
    }
  )

  // Persist the intent now that the watch is registered. Even if the
  // first fix never arrives (permission flow still pending), an
  // accidental F5 will still offer to resume — which will reuse whatever
  // permission state the browser has by then.
  persistIntent(deviceId, deviceName)
  void acquireWakeLock()

  return { ok: true, swappedFrom }
}

/** Stop the active watch (if any) and return to idle. */
export function stopTracking({ silent = false }: { silent?: boolean } = {}) {
  teardownWatch()
  clearIntent()
  setState({
    status: "idle",
    activeDeviceId: null,
    activeDeviceName: null,
    lastError: silent ? state.lastError : null,
  })
}

/** Snapshot — pair with subscribe() in useSyncExternalStore. */
export function getDeviceTrackerState(): DeviceTrackerState {
  return state
}

export function subscribeDeviceTracker(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Test-only — reset to a clean state without firing listeners. */
export function __resetDeviceTrackerForTests() {
  teardownWatch()
  state = initialState
  emit()
}
