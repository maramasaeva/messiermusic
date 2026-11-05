import { FFT, hann } from '../dsp/fft'
import { OnsetDetector, ONSET_HOP, type OnsetEvent } from '../dsp/onset'
import { PitchDetector, type PitchResult } from '../dsp/pitch'
import { SpectrumAnalyzer, type Peak } from '../dsp/spectrum'
import { FundamentalRefiner, REFINE_WINDOW } from '../dsp/refine'
import { chromaFromPeaks } from '../dsp/chroma'
import { DEFAULT_A4 } from '../music/notes'

export interface AnalysisFrame {
  /** Context time (s) at the END of the analysed window. */
  time: number
  levelDb: number
  noiseDb: number
  /** True when the level is clearly above the room noise. */
  signal: boolean
  pitch: PitchResult | null
  chroma: Float32Array | null
  chromaStrength: number
  peaks: Peak[]
}

export interface Onset extends OnsetEvent {
  /** Bass-vs-treble energy ratio (dB) just after the onset, used for up/down strum guess. */
  ratioDb: number
}

export interface Wants {
  pitch: boolean
  chroma: boolean
}

export interface CoreHandlers {
  onFrame?: (f: AnalysisFrame) => void
  onOnset?: (o: Onset) => void
}

const RING = 32768
const ANALYSIS_EVERY_BLOCKS = 8 // 8 * 256 = 2048 samples (~43 ms)
const SPECTRUM_WINDOW = 8192
const FEATURE_N = 2048

/**
 * Pure signal-processing core (no WebAudio): feed it 256-sample blocks and it emits
 * analysis frames (pitch / chroma) and onsets. Fully testable offline.
 */
export class AnalysisCore {
  readonly fs: number
  wants: Wants = { pitch: false, chroma: false }
  a4 = DEFAULT_A4
  handlers: CoreHandlers

  private readonly ring = new Float32Array(RING)
  private endFrame = 0
  private firstFrame = -1
  private blocks = 0
  private readonly onset: OnsetDetector
  private readonly pitch: PitchDetector
  private readonly spectrum: SpectrumAnalyzer
  private readonly refiner: FundamentalRefiner
  private readonly refineBuf = new Float32Array(REFINE_WINDOW)
  private readonly levels: number[] = []
  private readonly pitchBuf: Float32Array
  private readonly specBuf = new Float32Array(SPECTRUM_WINDOW)
  private readonly levelBuf = new Float32Array(2048)
  private pending: OnsetEvent[] = []
  private readonly featFft = new FFT(FEATURE_N)
  private readonly featWin = hann(FEATURE_N)
  private readonly featRe = new Float64Array(FEATURE_N)
  private readonly featIm = new Float64Array(FEATURE_N)
  private lastLevelDb = -120
  signalNow = false
  private noiseDb = -90

  constructor(fs: number, handlers: CoreHandlers = {}) {
    this.fs = fs
    this.handlers = handlers
    this.onset = new OnsetDetector(fs)
    const w = fs > 60000 ? 8192 : 4096
    this.pitch = new PitchDetector(fs, w)
    this.pitchBuf = new Float32Array(w)
    this.spectrum = new SpectrumAnalyzer(fs, SPECTRUM_WINDOW, 2)
    this.refiner = new FundamentalRefiner(fs)
  }

  get level(): number {
    return this.lastLevelDb
  }

  setOnsetSensitivity(minFlux: number): void {
    this.onset.setMinFlux(minFlux)
  }

  pushBlock(block: Float32Array, startFrame: number): void {
    if (this.firstFrame < 0) this.firstFrame = startFrame
    for (let i = 0; i < ONSET_HOP; i++) this.ring[(startFrame + i) % RING] = block[i]
    this.endFrame = startFrame + ONSET_HOP

    const ev = this.onset.push(block, startFrame)
    if (ev) this.pending.push(ev)
    this.flushPending()

    this.blocks++
    if (this.blocks % ANALYSIS_EVERY_BLOCKS === 0) this.analyze()
  }

  private readLast(out: Float32Array): void {
    const n = out.length
    const start = this.endFrame - n
    for (let i = 0; i < n; i++) out[i] = this.ring[(start + i) % RING]
  }

  private flushPending(): void {
    const delay = Math.round(0.07 * this.fs)
    while (this.pending.length && this.endFrame >= this.pending[0].frame + delay) {
      const ev = this.pending.shift()!
      this.handlers.onOnset?.({ ...ev, ratioDb: this.bassTrebleRatio(ev.frame) })
    }
  }

  private bassTrebleRatio(frame: number): number {
    const { featRe: re, featIm: im, featWin: win } = this
    const start = frame - 128
    for (let i = 0; i < FEATURE_N; i++) {
      re[i] = this.ring[(((start + i) % RING) + RING) % RING] * win[i]
      im[i] = 0
    }
    this.featFft.forward(re, im)
    const binHz = this.fs / FEATURE_N
    let low = 0
    let high = 0
    for (let k = Math.round(80 / binHz); k <= Math.round(400 / binHz); k++) low += re[k] * re[k] + im[k] * im[k]
    for (let k = Math.round(1500 / binHz); k <= Math.round(5000 / binHz); k++) high += re[k] * re[k] + im[k] * im[k]
    return 10 * Math.log10((low + 1e-12) / (high + 1e-12))
  }

  private analyze(): void {
    if (this.endFrame - this.firstFrame < SPECTRUM_WINDOW) return
    this.readLast(this.levelBuf)
    let e = 0
    for (let i = 0; i < this.levelBuf.length; i++) e += this.levelBuf[i] * this.levelBuf[i]
    const levelDb = 20 * Math.log10(Math.sqrt(e / this.levelBuf.length) + 1e-9)
    this.lastLevelDb = levelDb
    this.levels.push(levelDb)
    if (this.levels.length > 160) this.levels.shift()
    const sorted = [...this.levels].sort((a, b) => a - b)
    this.noiseDb = Math.min(-52, sorted[Math.floor(sorted.length * 0.15)])
    const signal = levelDb >= Math.max(this.noiseDb + 8, -74)
    this.signalNow = signal

    let pitch: PitchResult | null = null
    let chroma: Float32Array | null = null
    let chromaStrength = 0
    let peaks: Peak[] = []
    if (signal) {
      if (this.wants.pitch) {
        this.readLast(this.pitchBuf)
        pitch = this.pitch.detect(this.pitchBuf, 60, 1100)
        if (pitch && this.endFrame - this.firstFrame >= REFINE_WINDOW) {
          this.readLast(this.refineBuf)
          const rf = this.refiner.refine(this.refineBuf, pitch.freq)
          if (rf && Math.abs(1200 * Math.log2(rf / pitch.freq)) < 80) {
            pitch = { freq: rf, clarity: pitch.clarity, refined: true }
          }
        }
      }
      if (this.wants.chroma) {
        this.readLast(this.specBuf)
        this.spectrum.analyze(this.specBuf)
        peaks = this.spectrum.peaks()
        const c = chromaFromPeaks(peaks, this.a4)
        chroma = c.vec
        chromaStrength = c.strength
      }
    }
    this.handlers.onFrame?.({
      time: this.endFrame / this.fs,
      levelDb,
      noiseDb: this.noiseDb,
      signal,
      pitch,
      chroma,
      chromaStrength,
      peaks,
    })
  }
}
