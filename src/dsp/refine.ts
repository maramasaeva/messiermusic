import { SpectrumAnalyzer } from './spectrum'

export const REFINE_WINDOW = 16384

/**
 * Sharpens a rough f0 estimate using a long-window spectrum.
 * Real strings are slightly inharmonic (partials sit sharp of h*f0), so the partials are fitted with
 *   (f_h / h)^2 = f0^2 * (1 + B h^2)
 * which recovers the true fundamental even when the mic barely picks it up.
 */
export class FundamentalRefiner {
  private readonly spec: SpectrumAnalyzer

  constructor(fs: number) {
    this.spec = new SpectrumAnalyzer(fs, REFINE_WINDOW, 2)
  }

  refine(samples: Float32Array, f0: number): number | null {
    this.spec.analyze(samples)
    const peaks = this.spec.peaks({ minFreq: 50, maxFreq: 3500, minProm: 14 })
    const found: { h: number; f: number; w: number }[] = []
    let B = 1.5e-4
    for (let h = 1; h <= 8; h++) {
      const expected = h * f0 * Math.sqrt(1 + B * h * h)
      let best: { f: number; prom: number } | null = null
      const tol = 35 // cents
      for (const p of peaks) {
        const c = Math.abs(1200 * Math.log2(p.freq / expected))
        if (c <= tol && (!best || p.prom > best.prom)) best = { f: p.freq, prom: p.prom }
      }
      if (best) found.push({ h, f: best.f, w: Math.min(best.prom, 40) })
    }
    if (found.length === 0) return null

    const fundamental = found.find((p) => p.h === 1)
    if (fundamental && fundamental.w >= 22) return fundamental.f
    if (found.length < 3) return fundamental ? fundamental.f : null

    // weighted linear regression of y = (f/h)^2 on x = h^2
    let sw = 0
    let sx = 0
    let sy = 0
    let sxx = 0
    let sxy = 0
    for (const p of found) {
      const x = p.h * p.h
      const y = (p.f / p.h) ** 2
      const w = p.w
      sw += w
      sx += w * x
      sy += w * y
      sxx += w * x * x
      sxy += w * x * y
    }
    const den = sw * sxx - sx * sx
    if (Math.abs(den) < 1e-9) return null
    const slope = (sw * sxy - sx * sy) / den
    const icpt = (sy - slope * sx) / sw
    if (icpt <= 0) return null
    B = slope / icpt
    if (B < 0 || B > 6e-4) {
      // implausible: fall back to fixed-B fit
      const Bc = Math.min(6e-4, Math.max(0, B))
      let acc = 0
      let wsum = 0
      for (const p of found) {
        acc += p.w * (p.f / (p.h * Math.sqrt(1 + Bc * p.h * p.h)))
        wsum += p.w
      }
      return acc / wsum
    }
    return Math.sqrt(icpt)
  }
}
