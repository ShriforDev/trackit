import {
  IconCompass,
  IconDeviceMobile,
  IconMapPin,
  IconShieldLock,
  IconTimeline,
} from "@tabler/icons-react"

import { AppFooter, AppHeader } from "@/components/layout/app-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useActiveOrganization, useSession } from "@/lib/auth-client"

const upcoming = [
  {
    icon: IconShieldLock,
    title: "Consent gate",
    description:
      "Explicit tracking consent required before any device can be registered.",
  },
  {
    icon: IconDeviceMobile,
    title: "Register your phone",
    description:
      "Browser-based PWA that streams its position to your organization in real time.",
  },
  {
    icon: IconMapPin,
    title: "Live fleet map",
    description:
      "Watch every device on a Leaflet + OpenStreetMap canvas with sub-second updates.",
  },
  {
    icon: IconTimeline,
    title: "Historical playback",
    description:
      "Scrub through the past day, week, or month with TimescaleDB-backed routes.",
  },
]

export function HomePage() {
  const { data: session } = useSession()
  const { data: activeOrg } = useActiveOrganization()

  const userName = session?.user.name ?? "there"
  const myMembership = activeOrg?.members?.find(
    (m) => m.userId === session?.user.id
  )
  const myRole = myMembership?.role ?? "member"

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-12">
        <section className="flex flex-col gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <IconCompass className="size-3.5" />
            Welcome
          </span>
          <h1 className="font-heading text-3xl leading-tight font-medium tracking-tight text-balance sm:text-4xl">
            Hi {userName.split(" ")[0]},{" "}
            {activeOrg?.name ?? "your organization"} is ready.
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            You&apos;re signed in as{" "}
            <span className="font-medium text-foreground">{myRole}</span> of{" "}
            <span className="font-medium text-foreground">
              {activeOrg?.name ?? "this organization"}
            </span>
            . The tracking experience comes online over the next few steps —
            here&apos;s what to expect.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {upcoming.map(({ icon: Icon, title, description }) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2.5">
                  <span className="grid size-7 place-items-center bg-muted text-foreground">
                    <Icon className="size-4" />
                  </span>
                  {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Coming soon
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <AppFooter />
    </div>
  )
}
