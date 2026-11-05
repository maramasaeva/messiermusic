import type { Chord } from '../music/chords'
import type { Stroke } from '../music/strum'

export interface BarPlan {
  index: number
  start: number
  stepDur: number
  steps: Stroke[]
  countIn: boolean
  chord: Chord | null
  /** Bars carrying an older configuration are shown but not judged. */
  judged: boolean
  version: number
}

export type StepState = 'rest' | 'pending' | 'hit' | 'miss' | 'wrongdir'

export interface StepResult {
  state: StepState
  deltaMs: number | null
}

export interface BarResult {
  index: number
  version: number
  expected: number
  hits: number
  misses: number
  extras: number
  wrongDir: number
  meanDeltaMs: number | null
  meanAbsDeltaMs: number | null
  chordOk: boolean | null
  pass: boolean
  steps: StepResult[]
}

export interface JudgeConfig {
  /** Misses / extras allowed per bar = floor(expected * fraction + 0.3). */
  slack: number
  checkDirection: boolean
  checkChord: boolean
}

interface BarState {
  plan: BarPlan
  steps: StepResult[]
  extras: number
  firstHit: number | null
  chordChecks: boolean[]
  dir: ('D' | 'U' | null)[]
  finalized: boolean
}

export function hitWindow(stepDur: number): number {
  return Math.min(0.14, Math.max(0.055, stepDur * 0.42))
}

export class StrumJudge {
  cfg: JudgeConfig
  private bars = new Map<number, BarState>()
  private stats = { D: { n: 0, mean: 0 }, U: { n: 0, mean: 0 } }

  constructor(cfg: JudgeConfig) {
    this.cfg = cfg
  }

  reset(): void {
    this.bars.clear()
    this.stats = { D: { n: 0, mean: 0 }, U: { n: 0, mean: 0 } }
  }

  addBar(plan: BarPlan): void {
    this.bars.set(plan.index, {
      plan,
      steps: plan.steps.map((s) => ({ state: s === '-' || plan.countIn ? 'rest' : 'pending', deltaMs: null })),
      extras: 0,
      firstHit: null,
      chordChecks: [],
      dir: plan.steps.map(() => null),
      finalized: false,
    })
  }

  getBar(index: number): BarState | undefined {
    return this.bars.get(index)
  }

  /** Time-corrected onset. Returns what it was matched against, for UI flashes. */
  addOnset(time: number, ratioDb: number): { bar: number; step: number | null; deltaMs: number | null } | null {
    let best: { b: BarState; i: number; d: number } | null = null
    for (const b of this.bars.values()) {
      if (b.finalized || b.plan.countIn) continue
      const { start, stepDur, steps } = b.plan
      const hw = hitWindow(stepDur)
      for (let i = 0; i < steps.length; i++) {
        if (steps[i] === '-') continue
        const d = time - (start + i * stepDur)
        if (Math.abs(d) <= hw && (!best || Math.abs(d) < Math.abs(best.d))) best = { b, i, d }
      }
    }
    if (!best) {
      // inside a judged bar but not near any expected strum -> extra
      for (const b of this.bars.values()) {
        if (b.finalized || b.plan.countIn || !b.plan.judged) continue
        const { start, stepDur, steps } = b.plan
        if (time >= start && time < start + stepDur * steps.length) {
          // ignore onsets that are echoes of an already matched hit
          const near = b.steps.some((s, i) => s.state !== 'rest' && s.state !== 'pending' && Math.abs(time - (start + i * stepDur)) < hitWindow(stepDur) * 1.6)
          if (!near) b.extras++
          return { bar: b.plan.index, step: null, deltaMs: null }
        }
      }
      return null
    }
    const { b, i, d } = best
    const step = b.steps[i]
    if (step.state === 'hit' || step.state === 'wrongdir') return { bar: b.plan.index, step: i, deltaMs: d * 1000 } // duplicate
    step.deltaMs = d * 1000
    const want = b.plan.steps[i] as 'D' | 'U'
    let dirOk = true
    if (this.cfg.checkDirection) dirOk = this.classify(want, ratioDb)
    step.state = dirOk ? 'hit' : 'wrongdir'
    b.dir[i] = want
    if (b.firstHit === null) b.firstHit = time
    return { bar: b.plan.index, step: i, deltaMs: d * 1000 }
  }

  /** Learns the typical bass/treble ratio of down vs up strokes from the player's own hits. */
  private classify(want: 'D' | 'U', ratio: number): boolean {
    const s = this.stats
    const other = want === 'D' ? 'U' : 'D'
    const ok = s.D.n < 3 || s.U.n < 3 ? true : Math.abs(ratio - s[want].mean) <= Math.abs(ratio - s[other].mean)
    // only learn from hits that are consistent (or while bootstrapping)
    if (ok) {
      const st = s[want]
      st.n++
      st.mean += (ratio - st.mean) / Math.min(st.n, 12)
    }
    return ok
  }

  /** Feed an analysis frame; each bar with a target chord checks it ~0.2-0.6 s after its first strum. */
  addChordFrame(frameTime: number, test: (chord: Chord) => boolean): void {
    for (const b of this.bars.values()) {
      if (b.finalized || !b.plan.chord || b.firstHit === null) continue
      const dt = frameTime - b.firstHit
      if (dt >= 0.2 && dt <= 0.6) b.chordChecks.push(test(b.plan.chord))
    }
  }

  /** Finalise bars that have fully ended (plus grace) and return their results. */
  finalize(now: number): BarResult[] {
    const out: BarResult[] = []
    for (const b of this.bars.values()) {
      if (b.finalized) continue
      const end = b.plan.start + b.plan.stepDur * b.plan.steps.length
      if (now < end + 0.4) continue
      b.finalized = true
      out.push(this.result(b))
    }
    // drop old state
    for (const [k, b] of this.bars) if (b.finalized && b.plan.start < now - 20) this.bars.delete(k)
    return out.sort((a, c) => a.index - c.index)
  }

  private result(b: BarState): BarResult {
    const expected = b.plan.steps.filter((s) => s !== '-').length
    let hits = 0
    let wrongDir = 0
    const deltas: number[] = []
    b.steps.forEach((s, i) => {
      if (b.plan.steps[i] === '-' || b.plan.countIn) return
      if (s.state === 'hit') {
        hits++
        deltas.push(s.deltaMs ?? 0)
      } else if (s.state === 'wrongdir') {
        wrongDir++
        deltas.push(s.deltaMs ?? 0)
      } else {
        s.state = 'miss'
      }
    })
    const misses = expected - hits - wrongDir
    const slack = Math.floor(expected * this.cfg.slack + 0.3)
    const chordOk = b.plan.chord && this.cfg.checkChord ? b.chordChecks.length >= 2 && b.chordChecks.filter(Boolean).length / b.chordChecks.length >= 0.5 : null
    const pass =
      !b.plan.countIn &&
      misses + wrongDir <= slack &&
      b.extras <= slack &&
      (chordOk === null || chordOk) &&
      expected > 0
    const mean = deltas.length ? deltas.reduce((x, y) => x + y, 0) / deltas.length : null
    const meanAbs = deltas.length ? deltas.reduce((x, y) => x + Math.abs(y), 0) / deltas.length : null
    return {
      index: b.plan.index,
      version: b.plan.version,
      expected,
      hits,
      misses,
      extras: b.extras,
      wrongDir,
      meanDeltaMs: mean,
      meanAbsDeltaMs: meanAbs,
      chordOk,
      pass,
      steps: b.steps.map((s) => ({ ...s })),
    }
  }
}
