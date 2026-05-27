/**
 * Manual WS smoke test for /ws/fleet. Signs in, opens a WS, captures
 * messages for a window, then triggers a location POST and asserts the
 * delta arrives.
 *
 * Run with: bun run scripts/ws-smoke.ts
 *
 * Expects the API to be running on :3001 with the test data already
 * seeded (alice@trackit.test password AlicePass2026 owning a phone).
 */

const API = process.env.VITE_API_URL ?? "http://localhost:3001"
const WS = API.replace(/^http/, "ws") + "/ws/fleet"
const ORIGIN = "http://localhost:5173"

interface SignInResult {
  cookie: string
  userId: string
}

async function signIn(email: string, password: string): Promise<SignInResult> {
  const res = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
    },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`)
  const setCookie = res.headers.getSetCookie()
  // Take the first set-cookie, which is the session cookie. We pass the
  // raw "name=value" pair back as the Cookie header on subsequent requests.
  const cookie = setCookie
    .map((s) => s.split(";")[0])
    .filter(Boolean)
    .join("; ")
  const body = (await res.json()) as { user: { id: string } }
  return { cookie, userId: body.user.id }
}

async function postLocation(
  cookie: string,
  deviceId: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${API}/devices/${deviceId}/locations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      cookie,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`POST /devices/${deviceId}/locations -> ${res.status} ${text}`)
  }
}

async function listDevices(cookie: string): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${API}/devices`, {
    headers: { origin: ORIGIN, cookie },
  })
  if (!res.ok) throw new Error(`list devices ${res.status}`)
  return (await res.json()) as Array<{ id: string; name: string }>
}

async function main() {
  console.log("→ sign in alice")
  const { cookie, userId } = await signIn("alice@trackit.test", "AlicePass2026")
  console.log(`  user.id=${userId}`)

  const devices = await listDevices(cookie)
  if (devices.length === 0) {
    throw new Error("alice has no devices — run the Step 12 smoke first")
  }
  const device = devices[0]
  console.log(`→ device ${device.name} (${device.id})`)

  console.log(`→ opening WS ${WS}`)
  const messages: Array<{ type: string; payload?: unknown }> = []
  let opened = false

  const ws = new WebSocket(WS, {
    headers: { cookie, origin: ORIGIN },
  } as unknown as string)

  ws.addEventListener("open", () => {
    opened = true
    console.log("  ws open")
  })
  ws.addEventListener("message", (ev) => {
    const data = JSON.parse(String(ev.data))
    messages.push(data)
    const summary =
      data.type === "snapshot"
        ? `count=${(data.payload as unknown[]).length}`
        : data.type === "delta"
        ? `device=${(data.payload as { deviceId: string }).deviceId} lat=${
            (data.payload as { lat: number }).lat
          } lon=${(data.payload as { lon: number }).lon}`
        : ""
    console.log(`  ws ← ${data.type}  ${summary}`)
  })
  ws.addEventListener("close", (ev) => {
    console.log(`  ws closed code=${ev.code} reason=${ev.reason}`)
  })
  ws.addEventListener("error", (ev) => {
    console.log(`  ws error`, ev)
  })

  // Wait for open + snapshot.
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out waiting for snapshot")), 5000)
    const iv = setInterval(() => {
      if (opened && messages.some((m) => m.type === "snapshot")) {
        clearInterval(iv)
        clearTimeout(t)
        resolve()
      }
    }, 50)
  })
  console.log("→ snapshot received")

  console.log("→ posting 2 locations …")
  await postLocation(cookie, device.id, { lat: 12.99, lon: 77.6, accuracy: 9, battery: 90 })
  await new Promise((r) => setTimeout(r, 100))
  await postLocation(cookie, device.id, { lat: 13.0, lon: 77.61, accuracy: 8, battery: 89 })

  // Wait for both deltas.
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out waiting for deltas")), 5000)
    const iv = setInterval(() => {
      const deltaCount = messages.filter((m) => m.type === "delta").length
      if (deltaCount >= 2) {
        clearInterval(iv)
        clearTimeout(t)
        resolve()
      }
    }, 50)
  })
  console.log("→ both deltas received")

  ws.close()
  await new Promise((r) => setTimeout(r, 100))

  const summary = {
    snapshot: messages.filter((m) => m.type === "snapshot").length,
    delta: messages.filter((m) => m.type === "delta").length,
  }
  console.log(`PASS — snapshot=${summary.snapshot}  delta=${summary.delta}`)
}

main().catch((err) => {
  console.error("FAIL:", err.message)
  process.exit(1)
})
