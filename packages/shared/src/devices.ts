import { z } from "zod"

/**
 * Device kinds. Start with phone (browser-based, the primary surface in
 * Phase 2). `iot` is reserved for Phase 3+ when we add hardware trackers
 * with their own auth tokens.
 */
export const DEVICE_KINDS = ["phone", "iot"] as const
export type DeviceKind = (typeof DEVICE_KINDS)[number]

/**
 * Marker color presets — picked once at registration and used as the device
 * dot color on the live map. 8 swatches keeps the picker compact while
 * giving teams enough room to colour-code by person/role/zone.
 */
export const DEVICE_COLORS = [
  { id: "slate", hex: "#475569", label: "Slate" },
  { id: "rose", hex: "#e11d48", label: "Rose" },
  { id: "amber", hex: "#d97706", label: "Amber" },
  { id: "emerald", hex: "#059669", label: "Emerald" },
  { id: "sky", hex: "#0284c7", label: "Sky" },
  { id: "violet", hex: "#7c3aed", label: "Violet" },
  { id: "fuchsia", hex: "#c026d3", label: "Fuchsia" },
  { id: "neutral", hex: "#0a0a0a", label: "Black" },
] as const

export type DeviceColorId = (typeof DEVICE_COLORS)[number]["id"]

export const DEVICE_COLOR_IDS = DEVICE_COLORS.map(
  (c) => c.id
) as readonly DeviceColorId[]

export function getDeviceColor(id: DeviceColorId): (typeof DEVICE_COLORS)[number] {
  const found = DEVICE_COLORS.find((c) => c.id === id)
  if (!found) throw new Error(`Unknown device color: ${id}`)
  return found
}

/**
 * Free-form per-device context captured at registration. Optional everywhere
 * because the user might revoke browser permissions or register from a
 * minimal client. We persist it as JSONB so we can extend without migrations.
 */
export interface DeviceMetadata {
  userAgent?: string
  os?: string
  browser?: string
  screen?: { width: number; height: number; dpr?: number }
  language?: string
  timezone?: string
  registeredAt?: string
}

export interface Device {
  id: string
  organizationId: string
  ownerUserId: string
  name: string
  kind: DeviceKind
  color: DeviceColorId
  metadata: DeviceMetadata
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

// ---------- zod schemas ----------

export const deviceKindSchema = z.enum(DEVICE_KINDS)
export const deviceColorIdSchema = z.enum(
  // z.enum needs a non-empty string-tuple; cast via spread so TS preserves
  // the literal union.
  DEVICE_COLOR_IDS as unknown as [DeviceColorId, ...DeviceColorId[]]
)

const screenSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  dpr: z.number().positive().optional(),
})

export const deviceMetadataSchema = z
  .object({
    userAgent: z.string().max(512).optional(),
    os: z.string().max(64).optional(),
    browser: z.string().max(64).optional(),
    screen: screenSchema.optional(),
    language: z.string().max(32).optional(),
    timezone: z.string().max(64).optional(),
    registeredAt: z.string().datetime().optional(),
  })
  .strict()

export const createDeviceInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  kind: deviceKindSchema.default("phone"),
  color: deviceColorIdSchema,
  metadata: deviceMetadataSchema.optional(),
})

export type CreateDeviceInput = z.infer<typeof createDeviceInputSchema>
