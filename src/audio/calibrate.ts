import { engine } from './engine'
import { Metronome } from './metronome'

/**
 * Plays clicks through the speakers and measures how late the microphone reports them.
 * The result is output latency + input latency (+ a few ms of air), i.e. exactly the offset
 * between "a click is heard" and "an onset is reported".
 */
export async function measureLatency(): Promise<{ ms: number } | { error: string }> {
  if (!engine.running) return { error: 'Turn the microphone on first.' }
  const ctx = engine.ensureContext()
  const metro = new Metronome(ctx)
  const t0 = ctx.currentTime + 0.8
  const scheduled: number[] = []
  for (let i = 0; i < 8; i++) {
    const t = t0 + i * 0.55
    scheduled.push(t)
    metro.click(t, 1800, 2.2)
  }
  const heard: number[] = []
  const off = engine.onOnset((o) => heard.push(o.time))
  await new Promise((r) => setTimeout(r, (0.8 + 8 * 0.55 + 0.8) * 1000))
  off()
  const deltas: number[] = []
  for (const t of scheduled) {
    const h = heard.find((x) => x >= t - 0.02 && x < t + 0.45)
    if (h !== undefined) deltas.push(h - t)
  }
  if (deltas.length < 4) {
    return { error: 'Could not hear the clicks. Turn the speakers up (not headphones) and try in a quiet room.' }
  }
  deltas.sort((a, b) => a - b)
  const median = deltas[deltas.length >> 1]
  return { ms: Math.round(median * 1000) }
}
