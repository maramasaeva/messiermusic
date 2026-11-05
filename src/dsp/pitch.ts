import { FFT } from './fft'
import { nextPow2 } from '../music/notes'

export interface PitchResult {
  freq: number
  clarity: number
  /** True when the long-window spectral refinement was applied. */
  refined?: boolean
}

/**
 * McLeod Pitch Method (normalised square difference function via FFT) with a
 * multi-period refinement step: once the fundamental period is known, the
 * correlation peaks at 2T, 3T, ... are located and the period is re-estimated
 * from the farthest one, which divides the sub-sample interpolation error by
 * the number of periods spanned.
 */
export class PitchDetector {
  private readonly fs: number
  private readonly W: number
  private readonly fft: FFT
  private readonly re: Float64Array
  private readonly im: Float64Array
  private readonly x: Float64Array
  private readonly nsdf: Float64Array

  constructor(fs: number, windowSize = 4096) {
    this.fs = fs
    this.W = windowSize
    const P = nextPow2(windowSize * 2)
    this.fft = new FFT(P)
    this.re = new Float64Array(P)
    this.im = new Float64Array(P)
    this.x = new Float64Array(windowSize)
    this.nsdf = new Float64Array(windowSize / 2)
  }

  get windowSize(): number {
    return this.W
  }

  detect(samples: Float32Array, minFreq = 60, maxFreq = 1000, k = 0.9): PitchResult | null {
    const { W, x, re, im, nsdf, fs } = this
    if (samples.length < W) return null
    const off = samples.length - W
    let energy = 0
    for (let i = 0; i < W; i++) {
      const v = samples[off + i]
      x[i] = v
      re[i] = v
      energy += v * v
    }
    if (energy < 1e-9) return null
    re.fill(0, W)
    im.fill(0)
    this.fft.forward(re, im)
    for (let i = 0; i < re.length; i++) {
      re[i] = re[i] * re[i] + im[i] * im[i]
      im[i] = 0
    }
    this.fft.inverse(re, im)

    const maxLag = nsdf.length - 2
    let m = 2 * energy
    nsdf[0] = 1
    for (let tau = 1; tau <= maxLag + 1; tau++) {
      m -= x[tau - 1] * x[tau - 1] + x[W - tau] * x[W - tau]
      nsdf[tau] = m > 1e-12 ? (2 * re[tau]) / m : 0
    }

    const minLag = Math.max(2, Math.floor(fs / maxFreq))
    const searchMax = Math.min(maxLag, Math.floor(fs / minFreq))

    // Key maxima: highest peak between each positive-going and negative-going zero crossing.
    const maxima: number[] = []
    let pos = 1
    while (pos < searchMax && nsdf[pos] > 0) pos++
    while (pos < searchMax && nsdf[pos] <= 0) pos++
    let cur = 0
    while (pos < searchMax) {
      if (nsdf[pos] > nsdf[pos - 1] && nsdf[pos] >= nsdf[pos + 1]) {
        if (cur === 0 || nsdf[pos] > nsdf[cur]) cur = pos
      }
      pos++
      if (pos < searchMax && nsdf[pos] <= 0) {
        if (cur > 0 && cur >= minLag) maxima.push(cur)
        cur = 0
        while (pos < searchMax && nsdf[pos] <= 0) pos++
      }
    }
    if (cur > 0 && cur >= minLag) maxima.push(cur)
    if (maxima.length === 0) return null

    let highest = 0
    for (const i of maxima) if (nsdf[i] > highest) highest = nsdf[i]
    if (highest < 0.5) return null
    let pick = maxima[0]
    for (const i of maxima) {
      if (nsdf[i] >= k * highest) {
        pick = i
        break
      }
    }

    const first = this.parabolic(pick)
    let tau = first.x
    const clarity = first.y

    // Multi-period refinement.
    const lagLimit = maxLag - 2
    for (let mult = 2; mult * tau < lagLimit; mult++) {
      const target = Math.round(mult * tau)
      let best = -1
      let bestV = -Infinity
      for (let i = target - 2; i <= target + 2; i++) {
        if (i < 2 || i > maxLag) continue
        if (nsdf[i] > bestV && nsdf[i] >= nsdf[i - 1] && nsdf[i] >= nsdf[i + 1]) {
          best = i
          bestV = nsdf[i]
        }
      }
      if (best < 0 || bestV < 0.7 * clarity) break
      const p = this.parabolic(best)
      tau = p.x / mult
    }

    if (!(tau > 0)) return null
    return { freq: fs / tau, clarity: Math.min(1, clarity) }
  }

  private parabolic(i: number): { x: number; y: number } {
    const a = this.nsdf[i - 1]
    const b = this.nsdf[i]
    const c = this.nsdf[i + 1]
    const denom = a - 2 * b + c
    if (denom >= -1e-12) return { x: i, y: b }
    const delta = (0.5 * (a - c)) / denom
    return { x: i + delta, y: b - 0.25 * (a - c) * delta }
  }
}
