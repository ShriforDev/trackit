import { useEffect, useState } from "react"

/**
 * Photon search hook (https://photon.komoot.io). OSM-based geocoder,
 * free for interactive autocomplete, no API key.
 *
 * - 300ms debounce
 * - skips queries < 3 chars
 * - cancels in-flight requests via AbortController
 * - degrades silently on network/parse errors
 */

const PHOTON_ENDPOINT = "https://photon.komoot.io/api"
const DEBOUNCE_MS = 300
const MIN_QUERY_LEN = 3
const RESULT_LIMIT = 6

export interface PhotonResult {
  id: string
  name: string
  description: string
  type: string
  lat: number
  lon: number
  /** [west, north, east, south] when present, else null. */
  bbox: [number, number, number, number] | null
}

interface PhotonFeature {
  geometry: { type: "Point"; coordinates: [number, number] }
  properties: {
    osm_id?: number
    osm_type?: string
    name?: string
    country?: string
    state?: string
    county?: string
    city?: string
    postcode?: string
    type?: string
    street?: string
    housenumber?: string
    extent?: [number, number, number, number]
  }
}

interface PhotonResponse {
  features?: PhotonFeature[]
}

function describeFeature(p: PhotonFeature["properties"]): string {
  const parts = [p.street, p.city, p.county, p.state, p.country].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  )
  const seen = new Set<string>()
  const unique: string[] = []
  for (const part of parts) {
    if (seen.has(part)) continue
    seen.add(part)
    unique.push(part)
  }
  return unique.join(", ")
}

function normalize(feature: PhotonFeature, idx: number): PhotonResult {
  const [lon, lat] = feature.geometry.coordinates
  const p = feature.properties
  const idBase =
    p.osm_type && p.osm_id ? `${p.osm_type}-${p.osm_id}` : `idx-${idx}`
  return {
    id: idBase,
    name: p.name ?? p.street ?? p.city ?? "Unknown",
    description: describeFeature(p),
    type: p.type ?? "place",
    lat,
    lon,
    bbox: p.extent ?? null,
  }
}

interface UsePhotonSearchState {
  results: PhotonResult[]
  isSearching: boolean
  error: string | null
}

export function usePhotonSearch(query: string): UsePhotonSearchState {
  const [state, setState] = useState<UsePhotonSearchState>({
    results: [],
    isSearching: false,
    error: null,
  })

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LEN) {
      setState({ results: [], isSearching: false, error: null })
      return
    }

    const ctrl = new AbortController()
    const debounceId = setTimeout(() => {
      setState((s) => ({ ...s, isSearching: true, error: null }))
      const url = `${PHOTON_ENDPOINT}/?q=${encodeURIComponent(
        trimmed
      )}&limit=${RESULT_LIMIT}&lang=en`

      fetch(url, { signal: ctrl.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Search failed (${res.status})`)
          return res.json() as Promise<PhotonResponse>
        })
        .then((data) => {
          const features = data.features ?? []
          setState({
            results: features.map(normalize),
            isSearching: false,
            error: null,
          })
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return
          setState({
            results: [],
            isSearching: false,
            error: err instanceof Error ? err.message : "Search failed.",
          })
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(debounceId)
      ctrl.abort()
    }
  }, [query])

  return state
}

/** Heuristic zoom level when Photon doesn't supply a bbox. */
export function zoomForResultType(type: string): number {
  switch (type) {
    case "country": return 5
    case "state":
    case "region": return 7
    case "county": return 9
    case "city": return 12
    case "town":
    case "district": return 13
    case "village":
    case "suburb":
    case "neighbourhood": return 14
    case "street":
    case "locality": return 16
    case "house":
    case "building":
    case "amenity": return 18
    default: return 14
  }
}
