import { useEffect, useMemo, useRef, useState } from "react"
import {
  IconBuilding,
  IconCircleCheck,
  IconCurrentLocation,
  IconDeviceMobile,
  IconLoader2,
  IconMap,
  IconMapPin,
  IconSearch,
  IconWorld,
  IconX,
} from "@tabler/icons-react"
import L from "leaflet"

import { Spinner } from "@/components/ui/spinner"
import { useFleet } from "@/lib/use-fleet"
import {
  usePhotonSearch,
  zoomForResultType,
  type PhotonResult,
} from "@/lib/use-photon-search"
import { cn } from "@/lib/utils"

import { DEVICE_COLORS } from "@trackit/shared"

interface MapNavControlsProps {
  map: L.Map
}

/**
 * Floating control rail layered on top of a leaflet map. Three jobs:
 *
 *  1. Address / place search via Photon (free OSM geocoder).
 *  2. "Locate me" — fly to the user's current GPS position.
 *  3. "Jump to device" — fly to any of this org's tracked devices,
 *     using the live fleet snapshot.
 *
 * All three operate on the leaflet `Map` instance passed in via prop.
 * The component itself is unaware of geofence-editor specifics, so
 * it can be reused on the upcoming /geofences/:id/edit-shape page
 * and on /map without modification.
 */
export function MapNavControls({ map }: MapNavControlsProps) {
  return (
    <>
      {/* Top-center: search bar + dropdown */}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-[500] flex justify-center px-4">
        <SearchBar map={map} />
      </div>

      {/* Top-right of map: locate + device jump chips */}
      <div className="pointer-events-none absolute right-4 top-4 z-[450] flex flex-col items-end gap-2">
        <LocateMeButton map={map} />
        <JumpToDeviceMenu map={map} />
      </div>
    </>
  )
}

// ---- Search bar -----------------------------------------------------------

function SearchBar({ map }: { map: L.Map }) {
  const [query, setQuery] = useState("")
  const [activeIdx, setActiveIdx] = useState(0)
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { results, isSearching, error } = usePhotonSearch(query)

  const showDropdown =
    isFocused && (query.trim().length >= 3 || isSearching || error !== null)

  // Reset highlight when results refresh
  useEffect(() => {
    setActiveIdx(0)
  }, [results])

  // Click-outside closes the dropdown
  useEffect(() => {
    if (!isFocused) return
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setIsFocused(false)
      }
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [isFocused])

  function flyToResult(r: PhotonResult) {
    if (r.bbox) {
      const [west, north, east, south] = r.bbox
      map.flyToBounds(
        L.latLngBounds([south, west], [north, east]),
        { padding: [40, 40], maxZoom: 17, duration: 0.6 }
      )
    } else {
      map.flyTo([r.lat, r.lon], zoomForResultType(r.type), {
        duration: 0.6,
      })
    }
    setQuery("")
    setIsFocused(false)
    inputRef.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIdx((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const r = results[activeIdx]
      if (r) flyToResult(r)
    } else if (e.key === "Escape") {
      setIsFocused(false)
      inputRef.current?.blur()
    }
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-auto w-full max-w-sm"
    >
      <div
        className={cn(
          "flex items-center gap-2 border bg-background/95 px-3 py-2 backdrop-blur transition-shadow",
          isFocused
            ? "ring-2 ring-foreground/30"
            : "ring-1 ring-foreground/10"
        )}
      >
        <IconSearch className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={onKeyDown}
          placeholder="Search a place or address…"
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          aria-label="Search a place or address"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
        />
        {isSearching ? (
          <IconLoader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("")
              inputRef.current?.focus()
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <IconX className="size-3.5" />
          </button>
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground">
            ⌘K
          </span>
        )}
      </div>

      {showDropdown ? (
        <div
          className="mt-1.5 max-h-80 overflow-y-auto border bg-background ring-1 ring-foreground/10"
          role="listbox"
        >
          {error ? (
            <div className="px-3 py-3 text-[11px] text-destructive">
              {error}
            </div>
          ) : results.length === 0 && !isSearching ? (
            <div className="px-3 py-3 text-[11px] text-muted-foreground">
              No matches. Try a different query.
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => flyToResult(r)}
                onMouseEnter={() => setActiveIdx(i)}
                role="option"
                aria-selected={i === activeIdx}
                className={cn(
                  "flex w-full items-start gap-2.5 border-b px-3 py-2 text-left text-xs transition-colors last:border-b-0",
                  i === activeIdx ? "bg-muted/60" : "hover:bg-muted/40"
                )}
              >
                <ResultIcon type={r.type} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium leading-tight">
                    {r.name}
                  </span>
                  {r.description ? (
                    <span className="truncate text-[10px] leading-tight text-muted-foreground">
                      {r.description}
                    </span>
                  ) : null}
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  {r.type}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function ResultIcon({ type }: { type: string }) {
  if (type === "country" || type === "state" || type === "region") {
    return <IconWorld className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
  }
  if (type === "house" || type === "building" || type === "amenity") {
    return <IconBuilding className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
  }
  if (type === "city" || type === "town" || type === "village") {
    return <IconMap className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
  }
  return <IconMapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
}

// ---- Locate me -----------------------------------------------------------

function LocateMeButton({ map }: { map: L.Map }) {
  const [state, setState] = useState<"idle" | "locating" | "ok" | "error">(
    "idle"
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function locate() {
    if (!navigator.geolocation) {
      setState("error")
      setErrorMsg("Geolocation is not available in this browser.")
      return
    }
    setState("locating")
    setErrorMsg(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        map.flyTo([latitude, longitude], 16, { duration: 0.6 })
        setState("ok")
        setTimeout(() => setState("idle"), 2_000)
      },
      (err) => {
        setState("error")
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied."
            : err.code === err.POSITION_UNAVAILABLE
              ? "Couldn't determine your location."
              : err.code === err.TIMEOUT
                ? "Locating timed out."
                : "Couldn't locate."
        setErrorMsg(msg)
        setTimeout(() => setState("idle"), 3_000)
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 }
    )
  }

  return (
    <button
      type="button"
      onClick={locate}
      disabled={state === "locating"}
      title={errorMsg ?? "Center map on my location"}
      className={cn(
        "pointer-events-auto flex items-center gap-1.5 border bg-background/95 px-2.5 py-1.5 text-[11px] backdrop-blur transition-colors ring-1",
        state === "error"
          ? "ring-destructive/40 text-destructive"
          : state === "ok"
            ? "ring-emerald-500/40 text-emerald-600 dark:text-emerald-400"
            : "ring-foreground/10 hover:bg-background"
      )}
      aria-label="Center map on my location"
    >
      {state === "locating" ? (
        <Spinner className="size-3" />
      ) : state === "ok" ? (
        <IconCircleCheck className="size-3.5" />
      ) : (
        <IconCurrentLocation className="size-3.5" />
      )}
      <span className="font-medium">
        {state === "locating"
          ? "Locating…"
          : state === "ok"
            ? "Centered"
            : state === "error"
              ? "Try again"
              : "Locate me"}
      </span>
    </button>
  )
}

// ---- Jump to device ------------------------------------------------------

function deviceColorHex(id: string | undefined): string {
  if (!id) return "#737373"
  return DEVICE_COLORS.find((c) => c.id === id)?.hex ?? "#737373"
}

function formatAge(capturedAtUnix?: number): string {
  if (!capturedAtUnix) return "—"
  const diff = Math.max(0, Math.round(Date.now() / 1000 - capturedAtUnix))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86_400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86_400)}d ago`
}

function JumpToDeviceMenu({ map }: { map: L.Map }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { positions, status } = useFleet()

  const devices = useMemo(() => {
    return Array.from(positions.values()).sort((a, b) =>
      a.deviceName.localeCompare(b.deviceName)
    )
  }, [positions])

  // Click-outside closes
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [open])

  function jumpTo(lat: number, lon: number) {
    map.flyTo([lat, lon], 16, { duration: 0.6 })
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 border bg-background/95 px-2.5 py-1.5 text-[11px] ring-1 ring-foreground/10 backdrop-blur transition-colors hover:bg-background",
          open && "ring-foreground/30"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <IconDeviceMobile className="size-3.5" />
        <span className="font-medium">Jump to device</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {devices.length}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] w-72 border bg-background ring-1 ring-foreground/10">
          <div className="border-b px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Active devices
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {status === "connecting" && devices.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-muted-foreground">
                <Spinner className="size-3" />
                Connecting to fleet…
              </div>
            ) : devices.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-muted-foreground">
                No active positions yet.
              </div>
            ) : (
              devices.map((d) => (
                <button
                  key={d.deviceId}
                  type="button"
                  onClick={() => jumpTo(d.lat, d.lon)}
                  className="flex w-full items-center gap-2.5 border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/40"
                >
                  <span
                    aria-hidden
                    className="size-3 shrink-0 ring-1 ring-foreground/15"
                    style={{ backgroundColor: deviceColorHex(d.deviceColor) }}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-xs font-medium leading-tight">
                      {d.deviceName}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {formatAge(d.capturedAtUnix)} · {d.lat.toFixed(4)},{" "}
                      {d.lon.toFixed(4)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
