import { engine } from '../audio/engine'
import { Metronome, type MetroBar } from '../audio/metronome'
import { matcher, MATCH_CONFIG, type Sensitivity } from '../dsp/chordMatch'
import type { Chord } from '../music/chords'
import type { Stroke, StrumPattern } from '../music/strum'
import { StrumJudge, type BarPlan, type BarResult } from './judge'

export interface SessionConfig {
  patterns: StrumPattern[]
  progression: Chord[] | null
  barsPerChord: number
  startBpm: number
  targetBpm: number
  bpmStep: number
  barsToPass: number
  /** Fraction of a bar's strums that may be missed/extra and still pass. */
  slack: number
  checkChords: boolean
  checkDirection: boolean
  autoSlow: boolean
  clickSubdivisions: boolean
  volume: number
  chordSensitivity: Sensitivity
  latency: () => number
}

export interface SessionView {
  phase: 'idle' | 'running' | 'done'
  patternIdx: number
  pattern: StrumPattern | null
  bpm: number
  streak: number
  barsToPass: number
  message: string
  tone: 'neutral' | 'good' | 'warn'
  lastResult: BarResult | null
  recent: BarResult[]
  cleared: string[]
}

type Listener = (v: SessionView) => void

export class StrumSession {
  readonly judge: StrumJudge
  view: SessionView
  readonly ctx: AudioContext
  private readonly cfg: SessionConfig
  private readonly metro: Metronome
  private listeners = new Set<Listener>()
  private plans = new Map<number, BarPlan>()
  private patternIdx = 0
  private bpm: number
  private version = 0
  private streak = 0
  private fails = 0
  private playIdx = 0
  private unsubs: (() => void)[] = []
  private poll: number | null = null
  private running = false

  constructor(ctx: AudioContext, cfg: SessionConfig) {
    this.ctx = ctx
    this.cfg = cfg
    this.bpm = Math.min(cfg.startBpm, cfg.targetBpm)
    this.metro = new Metronome(ctx)
    this.judge = new StrumJudge({ slack: cfg.slack, checkDirection: cfg.checkDirection, checkChord: cfg.checkChords })
    this.view = this.makeView({ message: 'Press start, count in, then strum along.' })
  }

  get pattern(): StrumPattern {
    return this.cfg.patterns[this.patternIdx]
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private makeView(patch: Partial<SessionView> = {}): SessionView {
    const prev: Partial<SessionView> = this.view ?? {}
    return {
      phase: this.running ? 'running' : (prev.phase ?? 'idle'),
      patternIdx: this.patternIdx,
      pattern: this.cfg.patterns[this.patternIdx] ?? null,
      bpm: this.bpm,
      streak: this.streak,
      barsToPass: this.cfg.barsToPass,
      message: prev.message ?? '',
      tone: prev.tone ?? 'neutral',
      lastResult: prev.lastResult ?? null,
      recent: prev.recent ?? [],
      cleared: prev.cleared ?? [],
      ...patch,
    }
  }

  private emit(patch: Partial<SessionView> = {}): void {
    this.view = this.makeView(patch)
    this.listeners.forEach((l) => l(this.view))
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.judge.reset()
    this.plans.clear()
    this.patternIdx = 0
    this.bpm = Math.min(this.cfg.startBpm, this.cfg.targetBpm)
    this.version++
    this.streak = 0
    this.fails = 0
    this.playIdx = 0
    this.emit({ phase: 'running', message: 'Count-in… get your hand moving.', tone: 'neutral', recent: [], lastResult: null, cleared: [] })

    this.unsubs.push(
      engine.onOnset((o) => {
        this.judge.addOnset(o.time - this.cfg.latency(), o.ratioDb)
      }),
      engine.onFrame((f) => {
        if (!this.cfg.checkChords || !f.chroma || !f.signal) return
        const chroma = f.chroma
        const mc = MATCH_CONFIG[this.cfg.chordSensitivity]
        this.judge.addChordFrame(f.time - this.cfg.latency(), (chord) => matcher.check(chord, chroma, mc).ok)
      }),
    )
    this.metro.onBar = (bar) => this.onBar(bar)
    this.metro.start({
      bpm: this.bpm,
      beats: this.pattern.beats,
      subdiv: this.pattern.subdiv,
      countInBars: 1,
      clickSubdivisions: this.cfg.clickSubdivisions,
      volume: this.cfg.volume,
    })
    this.poll = window.setInterval(() => this.finalize(), 80)
  }

  stop(): void {
    this.running = false
    this.metro.stop()
    this.unsubs.forEach((u) => u())
    this.unsubs = []
    if (this.poll !== null) window.clearInterval(this.poll)
    this.poll = null
    this.emit({ phase: this.view.phase === 'done' ? 'done' : 'idle' })
  }

  skipPattern(): void {
    if (!this.running) return
    this.advancePattern('Skipped.')
  }

  private chordFor(playIdx: number): Chord | null {
    const prog = this.cfg.progression
    if (!prog || prog.length === 0) return null
    return prog[Math.floor(playIdx / Math.max(1, this.cfg.barsPerChord)) % prog.length]
  }

  private onBar(bar: MetroBar): void {
    const pattern = this.pattern
    bar.bpm = this.bpm
    bar.beats = pattern.beats
    bar.subdiv = pattern.subdiv
    const stepDur = 60 / bar.bpm / bar.subdiv
    let plan: BarPlan
    if (bar.countIn) {
      plan = {
        index: bar.index,
        start: bar.start,
        stepDur,
        steps: Array<Stroke>(pattern.beats * pattern.subdiv).fill('-'),
        countIn: true,
        chord: this.chordFor(0),
        judged: false,
        version: this.version,
      }
    } else {
      plan = {
        index: bar.index,
        start: bar.start,
        stepDur,
        steps: pattern.steps,
        countIn: false,
        chord: this.chordFor(this.playIdx),
        judged: true,
        version: this.version,
      }
      this.playIdx++
    }
    this.plans.set(bar.index, plan)
    this.judge.addBar(plan)
  }

  /** Plan of the bar containing time `t` (or the next one if between bars). */
  planAt(t: number): { current: BarPlan | null; next: BarPlan | null } {
    let current: BarPlan | null = null
    let next: BarPlan | null = null
    for (const p of this.plans.values()) {
      const end = p.start + p.stepDur * p.steps.length
      if (t >= p.start && t < end) current = p
      if (p.start > t && (!next || p.start < next.start)) next = p
    }
    if (current) {
      for (const p of this.plans.values()) if (p.index === current.index + 1) next = p
    }
    return { current, next }
  }

  private finalize(): void {
    const results = this.judge.finalize(this.ctx.currentTime)
    for (const r of results) this.handle(r)
  }

  private handle(r: BarResult): void {
    const plan = this.plans.get(r.index)
    if (!plan || plan.countIn) return
    const recent = [...this.view.recent, r].slice(-8)
    if (r.version !== this.version) {
      this.emit({ recent, lastResult: r })
      return
    }
    if (r.pass) {
      this.streak++
      this.fails = 0
    } else {
      this.streak = 0
      this.fails++
    }
    let message = this.describe(r)
    let tone: SessionView['tone'] = r.pass ? 'good' : 'warn'

    if (this.streak >= this.cfg.barsToPass) {
      const p = this.pattern
      if (this.bpm < this.cfg.targetBpm) {
        this.bpm = Math.min(this.cfg.targetBpm, this.bpm + this.cfg.bpmStep)
        this.version++
        this.streak = 0
        message = `Locked in! Speeding up to ${this.bpm} BPM.`
        tone = 'good'
        this.emit({ recent, lastResult: r, message, tone })
      } else {
        this.advancePattern(`“${p.name}” cleared at ${this.bpm} BPM!`, recent, r)
      }
      return
    }
    if (this.cfg.autoSlow && this.fails >= 4 && this.bpm > 40) {
      this.bpm = Math.max(40, this.bpm - this.cfg.bpmStep)
      this.version++
      this.fails = 0
      this.streak = 0
      message = `That's tricky. Easing down to ${this.bpm} BPM.`
      tone = 'warn'
    }
    this.emit({ recent, lastResult: r, message, tone })
  }

  private advancePattern(note: string, recent = this.view.recent, last = this.view.lastResult): void {
    const cleared = [...this.view.cleared, this.pattern.id]
    this.version++
    this.streak = 0
    this.fails = 0
    if (this.patternIdx + 1 >= this.cfg.patterns.length) {
      this.metro.stop()
      this.running = false
      this.unsubs.forEach((u) => u())
      this.unsubs = []
      if (this.poll !== null) window.clearInterval(this.poll)
      this.poll = null
      this.emit({ phase: 'done', message: `${note} That was the last pattern. Nice work.`, tone: 'good', recent, lastResult: last, cleared })
      return
    }
    this.patternIdx++
    this.bpm = Math.min(this.cfg.startBpm, this.cfg.targetBpm)
    this.emit({
      message: `${note} Next: “${this.pattern.name}” at ${this.bpm} BPM.`,
      tone: 'good',
      recent,
      lastResult: last,
      cleared,
    })
  }

  private describe(r: BarResult): string {
    if (r.pass) {
      const bias = r.meanDeltaMs ?? 0
      if (Math.abs(bias) > 25) return `Bar cleared, but you're ${bias > 0 ? 'dragging' : 'rushing'} by ~${Math.round(Math.abs(bias))} ms.`
      return `Clean bar (${r.hits}/${r.expected}). ${this.streak < this.cfg.barsToPass ? `${this.cfg.barsToPass - this.streak} more in a row.` : ''}`
    }
    const bits: string[] = []
    if (r.chordOk === false) bits.push('chord was off')
    if (r.misses > 0) bits.push(`${r.misses} missed`)
    if (r.extras > 0) bits.push(`${r.extras} extra`)
    if (r.wrongDir > 0) bits.push(`${r.wrongDir} wrong direction`)
    return bits.length ? `Not quite: ${bits.join(', ')}.` : 'Not quite.'
  }
}
