import type { AnalysisFrame } from './core'
import { DEFAULT_A4, STANDARD_TUNING, midiToFreq } from '../music/notes'

export const IN_TUNE_CENTS = 3

export interface TunerReading {
  freq: number
  /** Deviation from the nearest open string, in cents (+ = sharp). */
  cents: number
  /** Index into STANDARD_TUNING (0 = low E ... 5 = high e). */
  string: number
  targetFreq: number
  /** True when the last few readings agree within ~1.5 cents. */
  stable: boolean
  inTune: boolean
  /** Milliseconds the string has continuously been in tune and stable. */
  inTuneMs: number
  refined: boolean
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y)
  return s[s.length >> 1]
}

/** Map a detected frequency to the nearest open string (allowing the usual octave-up detector error). */
export function nearestString(freq: number, a4 = DEFAULT_A4): { string: number; cents: number; target: number } {
  let best = { string: 0, cents: 1e9, target: 0 }
  for (let s = 0; s < STANDARD_TUNING.length; s++) {
    const base = midiToFreq(STANDARD_TUNING[s], a4)
    for (const k of [1, 2]) {
      const target = base * k
      const cents = 1200 * Math.log2(freq / target)
      if (Math.abs(cents) < Math.abs(best.cents)) best = { string: s, cents, target: base }
    }
  }
  return best
}

export class TunerLogic {
  a4 = DEFAULT_A4
  private history: number[] = []
  private misses = 0
  private currentString = -1
  private candidate = -1
  private candidateCount = 0
  private inTuneSince: number | null = null
  private last: TunerReading | null = null

  reset(): void {
    this.history = []
    this.misses = 0
    this.currentString = -1
    this.candidate = -1
    this.candidateCount = 0
    this.inTuneSince = null
    this.last = null
  }

  update(frame: AnalysisFrame): TunerReading | null {
    const p = frame.pitch
    if (!frame.signal || !p || p.clarity < 0.82) {
      this.misses++
      if (this.misses > 8) this.reset()
      return this.last
    }
    this.misses = 0

    const n = nearestString(p.freq, this.a4)
    if (this.currentString < 0) {
      this.currentString = n.string
    } else if (n.string !== this.currentString) {
      if (n.string === this.candidate) this.candidateCount++
      else {
        this.candidate = n.string
        this.candidateCount = 1
      }
      if (this.candidateCount >= 3) {
        this.currentString = n.string
        this.history = []
        this.inTuneSince = null
      } else return this.last
    } else {
      this.candidate = -1
      this.candidateCount = 0
    }

    this.history.push(n.cents)
    if (this.history.length > 5) this.history.shift()
    const cents = median(this.history)
    const spread = Math.max(...this.history) - Math.min(...this.history)
    const stable = this.history.length >= 4 && spread < 1.5
    const inTune = stable && Math.abs(cents) <= IN_TUNE_CENTS
    if (inTune) {
      if (this.inTuneSince === null) this.inTuneSince = frame.time
    } else this.inTuneSince = null

    this.last = {
      freq: p.freq,
      cents,
      string: this.currentString,
      targetFreq: n.target,
      stable,
      inTune,
      inTuneMs: this.inTuneSince === null ? 0 : (frame.time - this.inTuneSince) * 1000,
      refined: !!p.refined,
    }
    return this.last
  }
}
