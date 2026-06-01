import { Link } from "react-router"
import { IconArrowLeft, IconCompass } from "@tabler/icons-react"

/**
 * Public, unauthenticated privacy policy. Linked from the auth layout
 * footer and from store-distribution metadata.
 *
 * Plain language by design — covers what data we collect, why, how
 * long we keep it, and how to request deletion. Not legal advice and
 * deliberately not lawyer-style.
 */
export function PrivacyPage() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center bg-foreground text-background">
              <IconCompass className="size-4" />
            </span>
            <span className="text-sm font-medium tracking-tight">trackit</span>
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <IconArrowLeft className="size-3.5" />
            Back to sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Privacy policy
          </p>
          <h1 className="font-heading text-3xl font-medium tracking-tight">
            What trackit collects, and why.
          </h1>
          <p className="text-xs text-muted-foreground">Last updated: 2026-06-01</p>
        </div>

        <Section title="The short version">
          <p>
            Trackit is a location-tracking tool for organisations. To do its
            job it has to know where your registered devices are. We collect
            the location data you choose to share, store it on infrastructure
            we control, and never sell it or share it with anyone outside
            your organisation. You can stop tracking at any time and delete
            your account on request.
          </p>
        </Section>

        <Section title="What we collect">
          <p>
            <strong className="font-medium text-foreground">
              Account information.
            </strong>{" "}
            Your name, email address, and password (stored hashed). The
            organisation you belong to, your role within it, and any
            invitations sent to or from you.
          </p>
          <p>
            <strong className="font-medium text-foreground">
              Device metadata.
            </strong>{" "}
            For each device you register, we store the device name, color,
            kind (phone / vehicle / asset), the operating system and browser
            captured at registration, screen resolution, language, and
            timezone. This is descriptive metadata about the device, not
            anything from inside the device.
          </p>
          <p>
            <strong className="font-medium text-foreground">
              Location data.
            </strong>{" "}
            Each location fix you choose to share — a latitude, longitude,
            timestamp, accuracy estimate, and where available altitude,
            heading, speed, and battery percentage. Location is only
            collected while you have explicitly started tracking on a device
            you own. Closing the browser tab or stopping tracking ends the
            collection.
          </p>
          <p>
            <strong className="font-medium text-foreground">
              Geofence events.
            </strong>{" "}
            When a tracked device crosses a geofence boundary set up by your
            organisation, we record an event with the timestamp, device id,
            geofence id, and the position at which the crossing happened.
          </p>
        </Section>

        <Section title="What we don't collect">
          <p>
            We don&apos;t collect any data not directly tied to a feature you
            actively use. We do not run analytics or advertising trackers in
            the app. We do not access contacts, photos, microphone, camera,
            or files on your phone. We do not collect location when you
            haven&apos;t explicitly started tracking a device.
          </p>
        </Section>

        <Section title="Why we collect it">
          <p>
            Location data and geofence events are the product. Without them,
            trackit can&apos;t show you live positions, route history, or
            entry / exit alerts.
          </p>
          <p>
            Account information is used to authenticate you and decide which
            organisation&apos;s data you can see. Device metadata helps you
            distinguish your devices on the dashboard.
          </p>
        </Section>

        <Section title="Who can see your data">
          <p>
            <strong className="font-medium text-foreground">You.</strong>{" "}
            Always.
          </p>
          <p>
            <strong className="font-medium text-foreground">
              Admins and members of your organisation,
            </strong>{" "}
            as configured by your org&apos;s admin. A member sees devices they
            own plus devices explicitly shared with them. An admin or owner
            sees all devices in the organisation.
          </p>
          <p>
            <strong className="font-medium text-foreground">
              Nobody outside your organisation.
            </strong>{" "}
            We do not share, sell, or rent your data. We do not pass it to
            advertisers, brokers, or government entities except where
            required by enforceable law (and even then, only the minimum
            required and only after pushing back).
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            <strong className="font-medium text-foreground">
              Live positions
            </strong>{" "}
            expire from the realtime store about five minutes after the last
            fix.
          </p>
          <p>
            <strong className="font-medium text-foreground">
              Historical route data
            </strong>{" "}
            is kept indefinitely while your account is active so you can
            replay old trips. You can delete a device, which clears that
            device&apos;s history.
          </p>
          <p>
            <strong className="font-medium text-foreground">
              Account information
            </strong>{" "}
            is kept while your account is active, and deleted within 30 days
            of you closing it.
          </p>
        </Section>

        <Section title="Your controls">
          <p>
            You can stop tracking a device any time from its detail page.
            You can delete a device, which removes its history. You can
            leave an organisation, which revokes your access to its data.
            You can request full deletion of your account and personal
            information by emailing the address below.
          </p>
        </Section>

        <Section title="Security">
          <p>
            All data in transit is encrypted with HTTPS and WSS. Passwords
            are stored as bcrypt hashes — never in plain text. Database and
            realtime stores live in private networks not reachable from the
            public internet. Sessions use secure, http-only cookies.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Trackit is not intended for use by anyone under 16. We do not
            knowingly collect data from children. If you believe a child has
            registered an account, contact us and we&apos;ll remove it.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            For data deletion, account questions, or any privacy concern,
            email{" "}
            <a
              href="mailto:shriyam.guptasg1@gmail.com"
              className="font-medium underline underline-offset-4 hover:text-foreground"
            >
              shriyam.guptasg1@gmail.com
            </a>
            . We aim to reply within seven days.
          </p>
        </Section>

        <div className="border-t pt-6 text-[11px] text-muted-foreground">
          This policy may change as the product evolves. Significant
          changes will be highlighted in-app before they take effect.
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}
