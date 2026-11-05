import { FFT, hann } from './fft'

export interface Peak {
  freq: number
  /** Absolute level of the peak (dB, arbitrary reference). */
  db: number
  /** Height above the local spectral envelope, in dB. */
  prom: number
}

export interface PeakOptions {
  minFreq: number
  maxFreq: number
  /** Minimum prominence in dB. */
  minProm: number
}

const DEFAULT_PEAKS: PeakOptions = { minFreq: 70, maxFreq: 3000, minProm: 9 }

/**
 * Windowed, zero-padded magnitude spectrum with envelope-relative peak picking.
 * Prominence (dB over the local geometric-mean envelope) makes everything downstream
 * independent of mic gain and of how loud each harmonic is.
 */
export class SpectrumAnalyzer {
  readonly fs: number
  readonly windowSize: number
  readonly fftSize: number
  readonly binHz: number
  private readonly fft: FFT
  private readonly win: Float64Array
  private readonly re: Float64Array
  private readonly im: Float64Array
  private readonly db: Float32Array
  private readonly prefix: Float64Array
  private readonly envHalfWidth: number

  constructor(fs: number, windowSize = 8192, pad = 2) {
    this.fs = fs
    this.windowSize = windowSize
    this.fftSize = windowSize * pad
    this.binHz = fs / this.fftSize
    this.fft = new FFT(this.fftSize)
    this.win = hann(windowSize)
    this.re = new Float64Array(this.fftSize)
    this.im = new Float64Array(this.fftSize)
    this.db = new Float32Array(this.fftSize / 2)
    this.prefix = new Float64Array(this.fftSize / 2 + 1)
    this.envHalfWidth = Math.round(110 / this.binHz)
  }

  /** Compute dB spectrum from the last `windowSize` samples. */
  analyze(samples: Float32Array): Float32Array {
    const { windowSize: N, re, im, win, db } = this
    const off = samples.length - N
    for (let i = 0; i < N; i++) re[i] = samples[off + i] * win[i]
    re.fill(0, N)
    im.fill(0)
    this.fft.forward(re, im)
    const half = db.length
    for (let k = 0; k < half; k++) {
      db[k] = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-18)
    }
    return db
  }

  peaks(opts: Partial<PeakOptions> = {}): Peak[] {
    const o = { ...DEFAULT_PEAKS, ...opts }
    const { db, prefix, binHz } = this
    const half = db.length
    prefix[0] = 0
    for (let k = 0; k < half; k++) prefix[k + 1] = prefix[k] + db[k]
    const lo = Math.max(3, Math.floor(o.minFreq / binHz))
    const hi = Math.min(half - 4, Math.ceil(o.maxFreq / binHz))
    const out: Peak[] = []
    const guard = 3 * (this.fftSize / this.windowSize)
    const hw = this.envHalfWidth
    for (let k = lo; k <= hi; k++) {
      const v = db[k]
      if (v < db[k - 1] || v <= db[k + 1]) continue
      // must dominate its neighbourhood (suppresses window side-lobes)
      let isMax = true
      for (let j = 2; j <= guard && isMax; j++) {
        if (db[k - j] > v || db[k + j] > v) isMax = false
      }
      if (!isMax) continue
      const a = Math.max(0, k - hw)
      const b = Math.min(half, k + hw + 1)
      const env = (prefix[b] - prefix[a]) / (b - a)
      const prom = v - env
      if (prom < o.minProm) continue
      const l = db[k - 1]
      const r = db[k + 1]
      const denom = l - 2 * v + r
      const delta = denom < -1e-9 ? (0.5 * (l - r)) / denom : 0
      out.push({ freq: (k + delta) * binHz, prom, db: v })
    }
    return out
  }
}
