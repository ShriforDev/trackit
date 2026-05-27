import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"
import {
  IconArrowLeft,
  IconCheck,
  IconDeviceMobile,
  IconRouter,
} from "@tabler/icons-react"

import { AppFooter, AppHeader } from "@/components/layout/app-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError } from "@/lib/api"
import { useSession } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

import {
  createDeviceInputSchema,
  DEVICE_COLORS,
  type Device,
  type DeviceColorId,
  type DeviceKind,
  type DeviceMetadata,
} from "@trackit/shared/devices"

/**
 * Best-effort browser detection from userAgent. We only branch on the
 * common engine names — anything we can't classify falls through as the
 * raw UA string in the metadata for later inspection.
 */
function detectBrowser(ua: string): string | undefined {
  if (/Edg\//.test(ua)) return "Edge"
  if (/Firefox\//.test(ua)) return "Firefox"
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Chrome"
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari"
  return undefined
}

function detectOS(ua: string): string | undefined {
  if (/Windows NT 10/.test(ua)) return "Windows 10/11"
  if (/Windows NT/.test(ua)) return "Windows"
  if (/Mac OS X/.test(ua)) return "macOS"
  if (/Android/.test(ua)) return "Android"
  if (/(iPhone|iPad|iPod)/.test(ua)) return "iOS"
  if (/Linux/.test(ua)) return "Linux"
  return undefined
}

function captureMetadata(): DeviceMetadata {
  if (typeof window === "undefined") return {}
  const ua = navigator.userAgent
  return {
    userAgent: ua,
    os: detectOS(ua),
    browser: detectBrowser(ua),
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      dpr: window.devicePixelRatio,
    },
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    registeredAt: new Date().toISOString(),
  }
}

const KIND_OPTIONS: Array<{
  id: DeviceKind
  icon: typeof IconDeviceMobile
  label: string
  description: string
  available: boolean
}> = [
  {
    id: "phone",
    icon: IconDeviceMobile,
    label: "Phone",
    description: "Browser-based — streams location from this device.",
    available: true,
  },
  {
    id: "iot",
    icon: IconRouter,
    label: "IoT tracker",
    description: "Hardware module with its own auth token. Coming soon.",
    available: false,
  },
]

export function DeviceNewPage() {
  const navigate = useNavigate()
  const { data: session } = useSession()

  const defaultName = useMemo(
    () => `${session?.user.name?.split(" ")[0] ?? "My"}'s phone`,
    [session?.user.name]
  )

  const [name, setName] = useState(defaultName)
  const [kind, setKind] = useState<DeviceKind>("phone")
  const [color, setColor] = useState<DeviceColorId>(DEVICE_COLORS[0].id)
  const [metadata, setMetadata] = useState<DeviceMetadata>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  // Once at mount: snapshot browser context. Stored in state so the user
  // sees what's about to be persisted.
  useEffect(() => {
    setMetadata(captureMetadata())
  }, [])

  // Keep the default name in sync if the session loads after first paint.
  useEffect(() => {
    if (session?.user.name) {
      setName((current) =>
        current === "My's phone" || current === ""
          ? `${session.user.name?.split(" ")[0] ?? "My"}'s phone`
          : current
      )
    }
  }, [session?.user.name])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(null)

    const parsed = createDeviceInputSchema.safeParse({
      name,
      kind,
      color,
      metadata,
    })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Check the form.")
      return
    }

    setIsSubmitting(true)
    try {
      const created = await api.post<Device>("/devices", parsed.data)
      toast.success(`Registered "${created.name}".`)
      navigate("/devices", { replace: true })
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Couldn't register device."
      setFieldError(message)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
        <div className="flex flex-col gap-2">
          <Button
            render={<Link to="/devices" />}
            variant="ghost"
            size="sm"
            className="-ml-2 w-fit"
          >
            <IconArrowLeft data-icon="inline-start" />
            Back to devices
          </Button>
          <h1 className="font-heading text-2xl font-medium leading-tight tracking-tight">
            Register a device
          </h1>
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Give the device a name your team will recognise, pick a marker
            colour for the live map, and we&apos;ll capture the browser
            context automatically.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="grid gap-6 lg:grid-cols-[1fr_320px]"
        >
          <div className="flex flex-col gap-6 border bg-background p-6 ring-1 ring-foreground/5">
            {/* Name */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="device-name"
                className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Name
              </label>
              <Input
                id="device-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                autoFocus
                disabled={isSubmitting}
                placeholder="My phone"
              />
              <p className="text-[11px] text-muted-foreground">
                Up to 80 characters. Visible to everyone in the org.
              </p>
            </div>

            {/* Kind */}
            <fieldset
              className="flex flex-col gap-2"
              disabled={isSubmitting}
            >
              <legend className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Kind
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {KIND_OPTIONS.map(
                  ({ id, icon: Icon, label, description, available }) => {
                    const checked = kind === id
                    return (
                      <label
                        key={id}
                        className={cn(
                          "group/option flex cursor-pointer items-start gap-3 border bg-background p-3 transition-colors",
                          checked
                            ? "border-foreground bg-accent/40 ring-1 ring-foreground/20"
                            : "hover:bg-accent/20",
                          !available &&
                            "cursor-not-allowed opacity-60 hover:bg-background"
                        )}
                      >
                        <input
                          type="radio"
                          name="kind"
                          value={id}
                          checked={checked}
                          disabled={!available}
                          onChange={() => setKind(id)}
                          className="sr-only"
                        />
                        <span className="grid size-8 shrink-0 place-items-center border bg-background">
                          <Icon className="size-4" />
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-2 text-xs font-medium">
                            {label}
                            {!available ? (
                              <Badge variant="outline" className="font-normal">
                                soon
                              </Badge>
                            ) : null}
                          </span>
                          <span className="text-[11px] leading-relaxed text-muted-foreground">
                            {description}
                          </span>
                        </div>
                      </label>
                    )
                  }
                )}
              </div>
            </fieldset>

            {/* Color */}
            <fieldset
              className="flex flex-col gap-2"
              disabled={isSubmitting}
            >
              <legend className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Marker color
              </legend>
              <div className="flex flex-wrap gap-2">
                {DEVICE_COLORS.map((opt) => {
                  const checked = color === opt.id
                  return (
                    <label
                      key={opt.id}
                      className={cn(
                        "group/swatch relative flex size-9 cursor-pointer items-center justify-center border transition-transform",
                        checked
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                          : "hover:scale-105"
                      )}
                      style={{ backgroundColor: opt.hex }}
                      title={opt.label}
                    >
                      <input
                        type="radio"
                        name="color"
                        value={opt.id}
                        checked={checked}
                        onChange={() => setColor(opt.id)}
                        className="sr-only"
                        aria-label={opt.label}
                      />
                      {checked ? (
                        <IconCheck className="size-4 text-background drop-shadow-sm" />
                      ) : null}
                    </label>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Used as the marker dot color on the live map.
              </p>
            </fieldset>

            {fieldError ? (
              <div className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {fieldError}
              </div>
            ) : null}

            <div className="flex items-center gap-2 pt-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                Register device
              </Button>
              <Button
                type="button"
                render={<Link to="/devices" />}
                variant="ghost"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </div>

          {/* Captured metadata preview */}
          <aside className="flex h-fit flex-col gap-3 border bg-muted/20 p-5 ring-1 ring-foreground/5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Captured automatically
            </span>
            <p className="text-xs leading-relaxed text-muted-foreground">
              We snapshot the following from your browser at registration
              time. None of this changes after the device is created.
            </p>
            <dl className="flex flex-col divide-y divide-border border-y text-[11px]">
              <MetaRow label="OS" value={metadata.os} />
              <MetaRow label="Browser" value={metadata.browser} />
              <MetaRow
                label="Screen"
                value={
                  metadata.screen
                    ? `${metadata.screen.width}×${metadata.screen.height}${
                        metadata.screen.dpr
                          ? ` @${metadata.screen.dpr}x`
                          : ""
                      }`
                    : undefined
                }
              />
              <MetaRow label="Language" value={metadata.language} />
              <MetaRow label="Timezone" value={metadata.timezone} />
            </dl>
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">
                Raw user agent
              </summary>
              <p className="mt-2 break-all font-mono text-[10px] leading-relaxed">
                {metadata.userAgent ?? "—"}
              </p>
            </details>
          </aside>
        </form>
      </main>

      <AppFooter />
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-2 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className="line-clamp-1 font-medium"
        title={value}
      >
        {value ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  )
}
