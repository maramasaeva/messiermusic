import { FFT, hann } from './fft'

export interface OnsetEvent {
  /** Context time (seconds) of the detected onset. */
  time: number
  /** Absolute sample frame of the detected onset. */
  frame: number
  /** Flux relative to the adaptive threshold (>= 1). */
  strength: number
}

export const ONSET_HOP = 256
const N = 512

/**
 * Spectral-flux onset detector (half-wave rectified, log-compressed magnitude differences)
 * with adaptive median thresholding and peak picking.
 */
export class OnsetDetector {
  private readonly fs: number
  private readonly fft = new FFT(N)
  private readonly win = hann(N)
  private readonly re = new Float64Array(N)
  private readonly im = new Float64Array(N)
  private readonly buf = new Float64Array(N)
  private prevLog = new Float64Array(N / 2)
  private curLog = new Float64Array(N / 2)
  private readonly history = new Float64Array(64)
  private histPos = 0
  private f2 = 0
  private recent: number[] = []
  private f1 = 0
  private frame1 = 0
  private lastOnsetFrame = -1e12
  private lastOnsetFlux = 0
  private minFlux: number
  private refractory: number
  private readonly binLo = 2
  private readonly binHi: number

  constructor(fs: number, opts: { minFlux?: number; refractoryMs?: number } = {}) {
    this.fs = fs
    this.minFlux = opts.minFlux ?? 7
    this.refractory = Math.round(((opts.refractoryMs ?? 70) / 1000) * fs)
    this.binHi = Math.min(N / 2 - 1, Math.round(9000 / (fs / N)))
  }

  setMinFlux(v: number): void {
    this.minFlux = v
  }

  reset(): void {
    this.prevLog.fill(0)
    this.history.fill(0)
    this.f1 = this.f2 = 0
    this.recent = []
    this.lastOnsetFrame = -1e12
  }

  /** Feed exactly ONSET_HOP samples starting at absolute frame `startFrame`. */
  push(block: Float32Array, startFrame: number): OnsetEvent | null {
    const { buf, re, im, win } = this
    buf.copyWithin(0, ONSET_HOP)
    let energy = 0
    for (let i = 0; i < ONSET_HOP; i++) {
      const v = block[i]
      buf[ONSET_HOP + i] = v
      energy += v * v
    }
    for (let i = 0; i < N; i++) {
      re[i] = buf[i] * win[i]
      im[i] = 0
    }
    this.fft.forward(re, im)
    const norm = 4 / N
    let flux = 0
    const prev = this.prevLog
    const cur = this.curLog
    for (let k = this.binLo; k <= this.binHi; k++) {
      const amp = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * norm
      const l = Math.log(1 + 300 * amp)
      cur[k] = l
      const d = l - prev[k]
      if (d > 0) flux += d
    }
    this.curLog = prev
    this.prevLog = cur

    // threshold from history of past flux values
    const sorted = Array.from(this.history).sort((a, b) => a - b)
    const median = sorted[sorted.length >> 1]
    let thr = Math.max(this.minFlux, 2.5 * median)
    // right after a strum, string noise / decay bumps must be clearly strong to count as a new onset
    const dt = (this.frame1 - this.lastOnsetFrame) / this.fs
    if (dt < 0.3) thr = Math.max(thr, 0.4 * this.lastOnsetFlux * (1 - dt / 0.3))
    this.history[this.histPos] = flux
    this.histPos = (this.histPos + 1) % this.history.length

    // the candidate must clearly stand out from the flux right before it
    const before = this.recent.slice(-9, -1)
    const meanBefore = before.length ? before.reduce((a, b) => a + b, 0) / before.length : 0
    const stands = this.f1 >= 2.4 * meanBefore + 1

    let ev: OnsetEvent | null = null
    const rms = Math.sqrt(energy / ONSET_HOP)
    if (
      this.f1 > this.f2 &&
      this.f1 >= flux &&
      this.f1 >= thr &&
      stands &&
      this.frame1 - this.lastOnsetFrame > this.refractory &&
      rms > 2e-4
    ) {
      this.lastOnsetFrame = this.frame1
      this.lastOnsetFlux = this.f1
      ev = { time: this.frame1 / this.fs, frame: this.frame1, strength: this.f1 / thr }
    }
    this.f2 = this.f1
    this.f1 = flux
    this.recent.push(flux)
    if (this.recent.length > 10) this.recent.shift()
    this.frame1 = startFrame
    return ev
  }
}
