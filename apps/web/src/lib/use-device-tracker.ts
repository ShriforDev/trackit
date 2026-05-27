import { useSyncExternalStore } from "react"

import {
  getDeviceTrackerState,
  subscribeDeviceTracker,
  type DeviceTrackerState,
} from "./device-tracker"

/**
 * Subscribe to the global device tracker. Renders are minimised — React
 * only re-renders when the snapshot reference actually changes (we mutate
 * via `state = { ...state, ...patch }` inside the singleton, so any change
 * is a fresh reference).
 *
 * Pass an optional `deviceId` to also get an `isThisDevice` boolean — useful
 * for the device-detail page to know whether the current page's device is
 * the one being tracked.
 */
export function useDeviceTracker(deviceId?: string): DeviceTrackerState & {
  isThisDevice: boolean
  isAnyTracking: boolean
} {
  const state = useSyncExternalStore(
    subscribeDeviceTracker,
    getDeviceTrackerState,
    getDeviceTrackerState
  )

  return {
    ...state,
    isThisDevice:
      !!deviceId && state.activeDeviceId === deviceId && state.status === "tracking",
    isAnyTracking: state.status === "tracking",
  }
}
