import type { Peak } from './spectrum'
import { DEFAULT_A4 } from '../music/notes'

/** Gaussian width (in semitones) used to assign a spectral peak to pitch classes. */
const SIGMA = 0.2

export interface ChromaResult {
  vec: Float32Array
  /** Sum of peak weights before normalisation: ~0 means "nothing musical". */
  strength: number
}

/**
 * A peak counts more when it stands out of the spectral envelope (prominence) AND when it is
 * among the loudest peaks of the frame, so quickly decaying upper partials stop polluting the chroma.
 */
function peakWeight(p: Peak, maxDb: number): number {
  const prom = Math.min(1.5, Math.max(0, (p.prom - 6) / 18))
  const amp = Math.min(1, Math.max(0, (p.db - maxDb + 30) / 30))
  const fw = 1 / (1 + (p.freq / 1500) ** 2)
  return prom * amp * fw
}

/** Add `weight` at fractional pitch-class position `pc` (0..12) using a narrow Gaussian. */
export function addToChroma(vec: Float32Array | number[], pc: number, weight: number): void {
  const base = Math.round(pc)
  const g: number[] = []
  let sum = 0
  for (let d = -1; d <= 1; d++) {
    const centre = base + d
    const x = pc - centre
    const v = Math.exp(-(x * x) / (2 * SIGMA * SIGMA))
    g.push(v)
    sum += v
  }
  if (sum < 1e-9) return
  for (let d = -1; d <= 1; d++) {
    const idx = (((base + d) % 12) + 12) % 12
    vec[idx] += (weight * g[d + 1]) / sum
  }
}

export function chromaFromPeaks(peaks: Peak[], a4 = DEFAULT_A4): ChromaResult {
  const vec = new Float32Array(12)
  let strength = 0
  let maxDb = -Infinity
  for (const p of peaks) if (p.db > maxDb) maxDb = p.db
  for (const p of peaks) {
    const w = peakWeight(p, maxDb)
    if (w <= 0) continue
    const midi = 69 + 12 * Math.log2(p.freq / a4)
    const pc = ((midi % 12) + 12) % 12
    addToChroma(vec, pc, w)
    strength += w
  }
  let norm = 0
  for (let i = 0; i < 12; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  if (norm > 1e-9) for (let i = 0; i < 12; i++) vec[i] /= norm
  return { vec, strength }
}
