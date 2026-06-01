/**
 * Tiny Web Audio synth for geofence event chimes. No external audio
 * files; everything is generated in-browser. Falls back to no-op if the
 * AudioContext is not available.
 *
 * Each event type has its own short envelope so the user can recognize
 * the type without looking at the screen.
 */

type EventType = "enter" | "exit" | "approach" | "dwell"

let ctx: AudioContext | null = null
let lastPlayedAt = 0 // simple coalescing: don't double-play within 80ms

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (ctx) return ctx
  // Some browsers prefix; cast for TS without using `any`.
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
    return ctx
  } catch {
    return null
  }
}

function playTone(
  freq: number,
  durationMs: number,
  startOffsetMs = 0,
  gainPeak = 0.18,
  type: OscillatorType = "sine"
): void {
  const audio = getCtx()
  if (!audio) return
  // Auto-resume suspended contexts (Chrome autoplay policy may suspend).
  if (audio.state === "suspended") void audio.resume()

  const startTime = audio.currentTime + startOffsetMs / 1000
  const stopTime = startTime + durationMs / 1000

  const osc = audio.createOscillator()
  osc.type = type
  osc.frequency.value = freq

  const gain = audio.createGain()
  // Quick attack, exponential decay — feels like a "ping" not a "buzz"
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, stopTime)

  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(startTime)
  osc.stop(stopTime + 0.02)
}

const CHIMES: Record<EventType, () => void> = {
  enter: () => {
    // Two-note rising arpeggio (warm, welcoming)
    playTone(523.25, 140, 0) // C5
    playTone(783.99, 200, 90) // G5
  },
  exit: () => {
    // Two-note falling
    playTone(659.25, 140, 0) // E5
    playTone(440.0, 200, 90) // A4
  },
  approach: () => {
    // Single soft ping
    playTone(587.33, 160, 0, 0.14, "triangle") // D5
  },
  dwell: () => {
    // Two slow taps — attention-getting but not alarming
    playTone(392.0, 220, 0, 0.16, "triangle") // G4
    playTone(392.0, 260, 260, 0.14, "triangle")
  },
}

export function playEventChime(type: EventType): void {
  const now = Date.now()
  if (now - lastPlayedAt < 80) return // coalesce rapid bursts
  lastPlayedAt = now
  CHIMES[type]?.()
}
