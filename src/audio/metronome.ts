export interface MetroBar {
  index: number
  /** AudioContext time at which step 0 of this bar sounds. */
  start: number
  bpm: number
  beats: number
  subdiv: number
  stepDur: number
  countIn: boolean
}

export interface MetroConfig {
  bpm: number
  beats: number
  subdiv: number
  countInBars: number
  /** Soft ticks on the off-beats too. */
  clickSubdivisions: boolean
  volume: number
}

/**
 * Look-ahead WebAudio metronome. The owner decides each bar's tempo in `onBar`
 * (called just before the bar is scheduled), so tempo changes land exactly on bar lines.
 */
export class Metronome {
  private timer: number | null = null
  private nextStart = 0
  private barIndex = 0
  private cfg: MetroConfig | null = null
  /** Called right before each bar is scheduled; may mutate `bar.bpm`. */
  onBar: ((bar: MetroBar) => void) | null = null

  private readonly ctx: AudioContext

  constructor(ctx: AudioContext) {
    this.ctx = ctx
  }

  get running(): boolean {
    return this.timer !== null
  }

  start(cfg: MetroConfig, firstBarDelay = 0.15): void {
    this.stop()
    this.cfg = { ...cfg }
    this.barIndex = 0
    this.nextStart = this.ctx.currentTime + firstBarDelay
    this.tick()
    this.timer = window.setInterval(() => this.tick(), 25)
  }

  update(patch: Partial<MetroConfig>): void {
    if (this.cfg) this.cfg = { ...this.cfg, ...patch }
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
  }

  private tick(): void {
    const cfg = this.cfg
    if (!cfg) return
    while (this.nextStart < this.ctx.currentTime + 0.25) {
      const bar: MetroBar = {
        index: this.barIndex,
        start: this.nextStart,
        bpm: cfg.bpm,
        beats: cfg.beats,
        subdiv: cfg.subdiv,
        stepDur: 60 / cfg.bpm / cfg.subdiv,
        countIn: this.barIndex < cfg.countInBars,
      }
      this.onBar?.(bar)
      bar.stepDur = 60 / bar.bpm / bar.subdiv
      this.scheduleBar(bar, this.cfg ?? cfg)
      this.nextStart = bar.start + bar.stepDur * bar.beats * bar.subdiv
      this.barIndex++
    }
  }

  private scheduleBar(bar: MetroBar, cfg: MetroConfig): void {
    const steps = bar.beats * bar.subdiv
    for (let i = 0; i < steps; i++) {
      const t = bar.start + i * bar.stepDur
      const onBeat = i % bar.subdiv === 0
      if (onBeat) this.click(t, i === 0 ? 1500 : 1000, (i === 0 ? 0.55 : 0.38) * cfg.volume)
      else if (cfg.clickSubdivisions) this.click(t, 700, 0.12 * cfg.volume)
    }
  }

  click(t: number, freq: number, gain: number): void {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain * 0.5, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045)
    osc.connect(g).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.06)
  }
}
