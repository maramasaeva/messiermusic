/** Plays a plucked-string-ish reference tone using exactly-tuned partials. */
export function playReferenceTone(ctx: AudioContext, freq: number, seconds = 2.6): void {
  const now = ctx.currentTime + 0.02
  const master = ctx.createGain()
  master.gain.value = 0.35
  master.connect(ctx.destination)
  const partials = [1, 2, 3, 4, 5, 6]
  for (const h of partials) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq * h
    const amp = 0.5 / Math.pow(h, 1.1)
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(amp, now + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, now + seconds / (1 + 0.45 * (h - 1)))
    osc.connect(g).connect(master)
    osc.start(now)
    osc.stop(now + seconds + 0.1)
  }
}
