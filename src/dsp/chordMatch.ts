import { addToChroma } from './chroma'
import { CHORDS, type Chord } from '../music/chords'

export type Sensitivity = 'forgiving' | 'normal' | 'strict'

export interface MatchConfig {
  minScore: number
  /** Max allowed shortfall of any expected pitch class vs the template (0..1, normalised units). */
  maxDeficit: number
  /** Max allowed surplus of any unexpected pitch class. */
  maxExcess: number
  /** How close the target must be to the best-scoring competing chord. */
  margin: number
  holdMs: number
}

export const MATCH_CONFIG: Record<Sensitivity, MatchConfig> = {
  forgiving: { minScore: 0.74, maxDeficit: 0.34, maxExcess: 0.36, margin: 0.02, holdMs: 220 },
  normal: { minScore: 0.8, maxDeficit: 0.28, maxExcess: 0.3, margin: 0, holdMs: 320 },
  strict: { minScore: 0.87, maxDeficit: 0.22, maxExcess: 0.25, margin: 0, holdMs: 480 },
}

/** Relative strength of harmonics 1..6 in the template. */
const HARMONIC_WEIGHTS = [1, 0.85, 0.6, 0.4, 0.3, 0.2]

export function buildTemplate(chord: Chord): Float32Array {
  const vec = new Float32Array(12)
  for (const note of chord.notes) {
    for (let h = 1; h <= HARMONIC_WEIGHTS.length; h++) {
      const pitch = note + 12 * Math.log2(h)
      const pc = ((pitch % 12) + 12) % 12
      addToChroma(vec, pc, HARMONIC_WEIGHTS[h - 1])
    }
  }
  let norm = 0
  for (let i = 0; i < 12; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  for (let i = 0; i < 12; i++) vec[i] /= norm
  return vec
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < 12; i++) s += a[i] * b[i]
  return s
}

export interface Ranked {
  chord: Chord
  score: number
}

export interface CheckResult {
  ok: boolean
  score: number
  maxDeficit: number
  maxExcess: number
  bestOther: Ranked | null
}

export class ChordMatcher {
  private readonly entries: { chord: Chord; tpl: Float32Array }[]

  constructor(chords: Chord[] = CHORDS) {
    this.entries = chords.map((chord) => ({ chord, tpl: buildTemplate(chord) }))
  }

  templateFor(chord: Chord): Float32Array {
    return this.entries.find((e) => e.chord.id === chord.id)?.tpl ?? buildTemplate(chord)
  }

  rank(chroma: Float32Array): Ranked[] {
    return this.entries.map((e) => ({ chord: e.chord, score: dot(chroma, e.tpl) })).sort((a, b) => b.score - a.score)
  }

  check(target: Chord, chroma: Float32Array, cfg: MatchConfig): CheckResult {
    const tpl = this.templateFor(target)
    const score = dot(chroma, tpl)
    let maxDeficit = 0
    let maxExcess = 0
    for (let i = 0; i < 12; i++) {
      const d = score * tpl[i] - chroma[i]
      if (d > maxDeficit) maxDeficit = d
      if (-d > maxExcess) maxExcess = -d
    }
    let bestOther: Ranked | null = null
    for (const e of this.entries) {
      if (e.chord.pcMask === target.pcMask) continue
      const s = dot(chroma, e.tpl)
      if (!bestOther || s > bestOther.score) bestOther = { chord: e.chord, score: s }
    }
    const ok =
      score >= cfg.minScore &&
      maxDeficit <= cfg.maxDeficit &&
      maxExcess <= cfg.maxExcess &&
      (!bestOther || score >= bestOther.score - cfg.margin)
    return { ok, score, maxDeficit, maxExcess, bestOther }
  }
}

export const matcher = new ChordMatcher()
