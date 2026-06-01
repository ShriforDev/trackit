import { Link } from "react-router"
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBatteryCharging,
  IconBrandAndroid,
  IconBrandApple,
  IconCompass,
  IconDownload,
  IconShieldCheck,
} from "@tabler/icons-react"

/**
 * Public install-help page. Covers the sideload flow on Android (the
 * "allow installs from unknown sources" prompt is the #1 user-facing
 * friction point), plus a brief manufacturer-battery-optimization
 * note since aggressive killers like MIUI / OneUI / EMUI silently
 * stop the foreground service if not whitelisted.
 *
 * iOS section is intentionally short — "not yet, here's what to do
 * when it ships."
 */
export function InstallPage() {
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

      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-12">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            How to install
          </p>
          <h1 className="font-heading text-3xl font-medium tracking-tight">
            Get the trackit app on your phone.
          </h1>
          <p className="text-xs text-muted-foreground">
            Trackit ships its Android app directly from this site as a
            signed APK. The web version always works in any browser.
          </p>
        </div>

        {/* Android — the main story */}
        <section className="flex flex-col gap-5 border bg-background px-6 py-6 ring-1 ring-foreground/5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center border bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <IconBrandAndroid className="size-5" />
            </span>
            <div className="flex flex-col">
              <h2 className="text-sm font-medium">Android</h2>
              <p className="text-[11px] text-muted-foreground">
                Direct download — no Play Store account needed.
              </p>
            </div>
          </div>

          <ol className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
            <Step n={1} title="Download the APK">
              <p>
                On your Android phone, tap the{" "}
                <a
                  href="/api/mobile/android/latest.apk"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Download for Android
                </a>{" "}
                button (also available on the sign-in page). The browser
                will download <code className="rounded bg-muted px-1 py-0.5 text-[11px]">trackit.apk</code>.
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                Chrome may flag the file as &quot;might be harmful&quot;
                because we don&apos;t go through the Play Store. Tap{" "}
                <strong className="text-foreground">Keep / Download anyway</strong>.
              </p>
            </Step>

            <Step n={2} title="Allow installs from this source">
              <p>
                Open the file from your downloads. Android will ask for
                permission to install from this source — tap{" "}
                <strong className="text-foreground">Settings</strong>, then
                toggle on{" "}
                <strong className="text-foreground">
                  Allow from this source
                </strong>{" "}
                and go back. You only need to do this once for whichever
                browser or app you used to download.
              </p>
            </Step>

            <Step n={3} title="Install + open">
              <p>
                Tap <strong className="text-foreground">Install</strong>, then{" "}
                <strong className="text-foreground">Open</strong>. Sign in
                with your trackit account — same credentials as the web app.
              </p>
            </Step>

            <Step n={4} title="Grant permissions">
              <p>
                When you tap <strong className="text-foreground">Start tracking</strong>{" "}
                on a device, Android will ask for location and notification
                permissions:
              </p>
              <ul className="ml-4 flex list-disc flex-col gap-1 text-[12px]">
                <li>
                  <strong className="text-foreground">Location</strong> →
                  choose <em>Allow all the time</em>. Anything less and
                  tracking won&apos;t survive backgrounding.
                </li>
                <li>
                  <strong className="text-foreground">Notifications</strong>{" "}
                  → allow. The persistent notification is what keeps the
                  tracking service alive.
                </li>
              </ul>
            </Step>
          </ol>
        </section>

        {/* Battery optimization */}
        <section className="flex flex-col gap-4 border bg-amber-500/5 px-6 py-6 ring-1 ring-amber-500/20">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <IconBatteryCharging className="size-5" />
            </span>
            <div className="flex flex-col">
              <h2 className="text-sm font-medium">If tracking stops in the background</h2>
              <p className="text-[11px] text-muted-foreground">
                Some Android skins kill apps aggressively. One-time tweak
                fixes it.
              </p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            On stock Android, foreground services are usually safe. On
            aggressive skins (MIUI / Xiaomi, EMUI / Honor / Huawei,
            OneUI / Samsung, OxygenOS / OnePlus), the OS may quietly
            kill trackit when you switch apps even though we run a
            foreground service.
          </p>

          <p className="text-sm leading-relaxed text-muted-foreground">
            The fix is the same idea on every manufacturer, but the menu
            path differs:
          </p>

          <ul className="ml-4 flex list-disc flex-col gap-2 text-[13px] text-muted-foreground">
            <li>
              <strong className="text-foreground">Stock Android / Pixel</strong>:
              Settings → Apps → trackit → Battery → Unrestricted
            </li>
            <li>
              <strong className="text-foreground">Samsung One UI</strong>:
              Settings → Battery and device care → Battery → Background
              usage limits → Never sleeping apps → add trackit
            </li>
            <li>
              <strong className="text-foreground">Xiaomi MIUI / HyperOS</strong>:
              Settings → Apps → trackit → Battery saver → No restrictions.
              Plus: long-press trackit in recent apps, tap the lock icon.
            </li>
            <li>
              <strong className="text-foreground">OnePlus / Oppo / Realme</strong>:
              Settings → Battery → Background app management → trackit →
              Allow background activity
            </li>
            <li>
              <strong className="text-foreground">Honor / Huawei EMUI</strong>:
              Settings → Apps → trackit → Battery → Launch → set to
              Manage manually, then enable all three
            </li>
          </ul>
        </section>

        {/* Trust */}
        <section className="flex items-start gap-3 border bg-background px-6 py-5 ring-1 ring-foreground/5">
          <IconShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
            <p>
              The APK is signed with our own release key and built by
              GitHub Actions on every tagged release. The binary attached
              to the GitHub Release is exactly what the download link
              serves.
            </p>
            <p>
              Trackit only requests location, notifications, and
              foreground-service permissions. We never request access
              to contacts, photos, microphone, camera, or files on your
              device.
            </p>
          </div>
        </section>

        {/* iOS — short */}
        <section className="flex flex-col gap-3 border border-dashed bg-background px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center border bg-muted text-muted-foreground">
              <IconBrandApple className="size-5" />
            </span>
            <div className="flex flex-col">
              <h2 className="text-sm font-medium">iOS — coming soon</h2>
              <p className="text-[11px] text-muted-foreground">
                Apple requires app store distribution for any meaningful
                install path.
              </p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We&apos;re working on TestFlight + App Store distribution.
            Until then, iPhone users can use the web version at{" "}
            <Link
              to="/login"
              className="font-medium text-foreground underline underline-offset-4"
            >
              trackit.itsshri.space
            </Link>
            . Background tracking is limited on iOS Safari, so for
            persistent tracking from a phone, Android is the better
            option today.
          </p>
        </section>

        {/* Trouble */}
        <section className="flex items-start gap-3 border border-destructive/40 bg-destructive/5 px-6 py-5">
          <IconAlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">Stuck somewhere?</strong>{" "}
              Email{" "}
              <a
                href="mailto:shriyam.guptasg1@gmail.com"
                className="font-medium text-foreground underline underline-offset-4"
              >
                shriyam.guptasg1@gmail.com
              </a>{" "}
              with your phone model and the step you&apos;re stuck on.
              We usually reply same-day.
            </p>
          </div>
        </section>

        <div className="border-t pt-6 text-[11px] text-muted-foreground">
          <Link to="/login" className="hover:text-foreground">
            <IconDownload className="mr-1 inline size-3" />
            Back to sign in
          </Link>
        </div>
      </main>
    </div>
  )
}

function Step({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-6 shrink-0 place-items-center border bg-muted font-mono text-[11px] font-medium">
        {n}
      </span>
      <div className="flex flex-col gap-1.5">
        <strong className="text-foreground">{title}</strong>
        {children}
      </div>
    </li>
  )
}
