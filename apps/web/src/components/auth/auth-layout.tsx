import { Link } from "react-router"
import {
  IconBolt,
  IconBuildingSkyscraper,
  IconCompass,
  IconHistory,
} from "@tabler/icons-react"

type AuthLayoutProps = {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}

const features = [
  {
    icon: IconBuildingSkyscraper,
    text: "Multi-tenant by default — isolated per organization",
  },
  {
    icon: IconBolt,
    text: "Sub-second WebSocket position streaming",
  },
  {
    icon: IconHistory,
    text: "Full route history on PostgreSQL + TimescaleDB",
  },
]

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* ---------------- Brand panel (desktop) ---------------- */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r bg-muted/40 p-10 lg:flex xl:p-12">
        {/* Subtle grid pattern, faded at the edges. */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage:
              "radial-gradient(ellipse 80% 80% at 50% 30%, black 30%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 80% at 50% 30%, black 30%, transparent 80%)",
          }}
        />
        {/* Soft top-right glow. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 size-[420px] rounded-full bg-foreground/5 blur-3xl"
        />

        <Link
          to="/"
          className="relative flex items-center gap-2.5 text-foreground/90 transition-opacity hover:opacity-80"
        >
          <span className="grid size-7 place-items-center bg-foreground text-background">
            <IconCompass className="size-4" />
          </span>
          <span className="text-sm font-medium tracking-tight">trackit</span>
        </Link>

        <div className="relative flex max-w-md flex-col gap-4">
          <h2 className="font-heading text-3xl leading-tight font-medium tracking-tight text-balance xl:text-4xl">
            Real-time location intelligence for teams.
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Track devices, vehicles, and assets across organizations with
            isolated tenancy, live position streaming, and full historical route
            playback.
          </p>
        </div>

        <ul className="relative flex flex-col gap-3 text-xs text-muted-foreground">
          {features.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5">
              <Icon className="size-3.5 shrink-0" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* ---------------- Form panel ---------------- */}
      <main className="relative flex flex-col">
        {/* Mobile-only top bar with the brand mark. */}
        <div className="flex items-center justify-between border-b px-6 py-4 lg:hidden">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center bg-foreground text-background">
              <IconCompass className="size-4" />
            </span>
            <span className="text-sm font-medium tracking-tight">trackit</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10 lg:py-10">
          <div className="flex w-full max-w-sm flex-col gap-8">
            <div className="flex flex-col gap-1.5">
              <h1 className="font-heading text-2xl leading-tight font-medium tracking-tight">
                {title}
              </h1>
              {subtitle ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {subtitle}
                </p>
              ) : null}
            </div>

            {children}

            {footer ? (
              <div className="text-xs text-muted-foreground">{footer}</div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  )
}
