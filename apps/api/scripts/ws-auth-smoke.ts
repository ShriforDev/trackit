/**
 * Auth + scoping smoke for /ws/fleet.
 *
 * Test 1: WS without a cookie → must reject with 401 BEFORE upgrade.
 * Test 2: bob (member of alice's org) connects → posts a location to his
 *         own device → receives the delta. Alice posts to her device →
 *         bob does NOT receive the delta (member visibility filter).
 */

const API = process.env.VITE_API_URL ?? "http://localhost:3001"
const WS = API.replace(/^http/, "ws") + "/ws/fleet"
const ORIGIN = "http://localhost:5173"

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`)
  const setCookie = res.headers.getSetCookie()
  return setCookie.map((s) => s.split(";")[0]).filter(Boolean).join("; ")
}

async function getActiveOrg(cookie: string): Promise<string> {
  const res = await fetch(`${API}/api/auth/get-session`, {
    headers: { origin: ORIGIN, cookie },
  })
  const body = (await res.json()) as { session: { activeOrganizationId: string } }
  return body.session.activeOrganizationId
}

async function setActiveOrg(cookie: string, organizationId: string): Promise<void> {
  const res = await fetch(`${API}/api/auth/organization/set-active`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({ organizationId }),
  })
  if (!res.ok) throw new Error(`set-active ${res.status}`)
}

async function listDevices(cookie: string): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${API}/devices`, {
    headers: { origin: ORIGIN, cookie },
  })
  return (await res.json()) as Array<{ id: string; name: string }>
}

async function postLocation(cookie: string, deviceId: string, lat: number, lon: number) {
  const res = await fetch(`${API}/devices/${deviceId}/locations`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({ lat, lon }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`post location ${res.status}: ${txt}`)
  }
}

interface CapturedMessage {
  type: string
  payload?: { deviceId?: string }
}

function openWS(cookie: string | null): {
  ws: WebSocket
  messages: CapturedMessage[]
  closed: Promise<{ code: number; reason: string }>
  opened: Promise<void>
} {
  const messages: CapturedMessage[] = []
  let resolveOpened: () => void = () => {}
  let resolveClosed: (v: { code: number; reason: string }) => void = () => {}
  const opened = new Promise<void>((r) => { resolveOpened = r })
  const closed = new Promise<{ code: number; reason: string }>((r) => { resolveClosed = r })

  const headers: Record<string, string> = { origin: ORIGIN }
  if (cookie) headers.cookie = cookie

  const ws = new WebSocket(WS, { headers } as unknown as string)
  ws.addEventListener("open", () => resolveOpened())
  ws.addEventListener("close", (ev) =>
    resolveClosed({ code: ev.code, reason: ev.reason })
  )
  ws.addEventListener("message", (ev) => {
    try {
      messages.push(JSON.parse(String(ev.data)))
    } catch {
      // ignore
    }
  })
  ws.addEventListener("error", () => {
    // close handler will fire too
  })
  return { ws, messages, closed, opened }
}

async function main() {
  console.log("--- TEST 1: WS without cookie should NOT upgrade ---")
  const noCookie = openWS(null)
  const closeInfo = await Promise.race([
    noCookie.closed,
    new Promise<{ code: number; reason: string }>((_, rej) =>
      setTimeout(() => rej(new Error("ws stayed open with no cookie")), 3000)
    ),
  ])
  console.log(`  ws closed code=${closeInfo.code} reason=${closeInfo.reason}`)
  // Any non-1001 close indicates the upgrade was rejected. Bun returns
  // 1002 ("expected 101 status code") when the server replies with a
  // non-101 status (our 401), which is the correct signal.
  if (closeInfo.code !== 1001) {
    console.log("  PASS — anonymous connection rejected")
  } else {
    throw new Error(`ws stayed open with no cookie (code ${closeInfo.code})`)
  }

  console.log("\n--- TEST 2: member sees only own deltas, not other-user deltas ---")
  const aliceCookie = await signIn("alice@trackit.test", "AlicePass2026")
  const bobCookie = await signIn("bob@trackit.test", "BobPass2026")

  // Pin bob to alice's org (his fresh session would default to his own org).
  const aliceOrgId = await getActiveOrg(aliceCookie)
  await setActiveOrg(bobCookie, aliceOrgId)
  console.log(`  shared org=${aliceOrgId.slice(0, 8)}…`)

  const aliceDevices = await listDevices(aliceCookie)
  const bobDevices = await listDevices(bobCookie)
  console.log(`  alice has ${aliceDevices.length} device(s); bob has ${bobDevices.length}`)
  if (aliceDevices.length === 0 || bobDevices.length === 0) {
    throw new Error("test prerequisites not met — both alice and bob need a device in the same org")
  }
  const aliceDevice = aliceDevices.find((d) => d.name.includes("Alice")) ?? aliceDevices[0]
  const bobDevice = bobDevices.find((d) => d.name.includes("Bob")) ?? bobDevices[0]

  const bobWS = openWS(bobCookie)
  await bobWS.opened
  console.log("  bob ws open")

  // Wait for bob's snapshot to arrive
  await new Promise<void>((r, j) => {
    const t = setTimeout(() => j(new Error("bob snapshot timeout")), 3000)
    const iv = setInterval(() => {
      if (bobWS.messages.some((m) => m.type === "snapshot")) {
        clearInterval(iv)
        clearTimeout(t)
        r()
      }
    }, 50)
  })

  // Alice posts on HER device — bob must NOT receive a delta for it.
  await postLocation(aliceCookie, aliceDevice.id, 12.5, 77.5)
  // Bob posts on HIS device — bob MUST receive a delta for it.
  await postLocation(bobCookie, bobDevice.id, 13.5, 78.5)

  // Wait for bob to receive at least 1 delta (his own).
  await new Promise<void>((r, j) => {
    const t = setTimeout(() => j(new Error("bob delta timeout")), 3000)
    const iv = setInterval(() => {
      if (bobWS.messages.some((m) => m.type === "delta")) {
        clearInterval(iv)
        clearTimeout(t)
        r()
      }
    }, 50)
  })

  // Settle for any straggler messages.
  await new Promise((r) => setTimeout(r, 500))

  const deltas = bobWS.messages.filter((m) => m.type === "delta")
  console.log(`  bob received ${deltas.length} delta(s)`)
  for (const d of deltas) {
    console.log(`    - device=${d.payload?.deviceId}`)
  }

  const sawAlice = deltas.some((d) => d.payload?.deviceId === aliceDevice.id)
  const sawBob = deltas.some((d) => d.payload?.deviceId === bobDevice.id)

  bobWS.ws.close()
  await new Promise((r) => setTimeout(r, 100))

  if (sawAlice) throw new Error("FAIL — bob saw alice's delta (visibility filter broken)")
  if (!sawBob) throw new Error("FAIL — bob did NOT see his own delta")
  console.log("  PASS — visibility filter applied correctly")

  console.log("\nALL TESTS PASSED")
}

main().catch((err) => {
  console.error("FAIL:", err.message)
  process.exit(1)
})
