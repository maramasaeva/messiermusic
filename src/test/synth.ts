/** Rough acoustic-guitar-like synthesis used only to exercise the DSP in tests. */
import { midiToFreq } from '../music/notes'

let seed = 12345
export function rand(): number {
  // mulberry32
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
export function reseed(s: number): void {
  seed = s
}
export function gauss(): number {
  return Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
}

export interface PluckOpts {
  detuneCents?: number
  gain?: number
  decay?: number
  B?: number
  harmonics?: number
}

export function addPluck(
  out: Float32Array,
  fs: number,
  startSec: number,
  freq: number,
  opts: PluckOpts = {},
): void {
  const f0 = freq * Math.pow(2, (opts.detuneCents ?? 0) / 1200)
  const gain = opts.gain ?? 0.1
  const B = opts.B ?? 1.2e-4
  const H = opts.harmonics ?? 14
  const start = Math.round(startSec * fs)
  const dur = Math.min(out.length - start, Math.round(fs * 4))
  if (dur <= 0) return
  const amps: number[] = []
  const freqs: number[] = []
  const decays: number[] = []
  const phases: number[] = []
  for (let h = 1; h <= H; h++) {
    const fh = h * f0 * Math.sqrt(1 + B * h * h)
    if (fh > fs * 0.45) break
    const pluckPos = 0.17
    amps.push((gain * Math.abs(Math.sin(Math.PI * h * pluckPos)) + gain * 0.05) / Math.pow(h, 0.9))
    freqs.push(fh)
    decays.push((opts.decay ?? 1.1) + 0.55 * h)
    phases.push(rand() * Math.PI * 2)
  }
  for (let n = 0; n < dur; n++) {
    const t = n / fs
    let v = 0
    for (let i = 0; i < amps.length; i++) {
      v += amps[i] * Math.exp(-decays[i] * t) * Math.sin(2 * Math.PI * freqs[i] * t + phases[i])
    }
    // pick noise at the attack
    if (n < fs * 0.012) v += gain * 0.3 * gauss() * (1 - n / (fs * 0.012))
    out[start + n] += v
  }
}

export interface StrumOpts {
  /** 'D' low->high, 'U' high->low */
  dir?: 'D' | 'U'
  spreadMs?: number
  gain?: number
  detuneCents?: number
  /** Only play these note indices (e.g. upstrokes hit top strings). */
  only?: number[]
}

export function addStrum(out: Float32Array, fs: number, startSec: number, notes: number[], o: StrumOpts = {}): void {
  const dir = o.dir ?? 'D'
  const spread = (o.spreadMs ?? 22) / 1000
  const idx = notes.map((_, i) => i).filter((i) => !o.only || o.only.includes(i))
  const order = dir === 'D' ? idx : [...idx].reverse()
  order.forEach((i, k) => {
    const t = startSec + (k / Math.max(1, order.length - 1)) * spread
    const g = (o.gain ?? 0.12) * (0.75 + 0.25 * rand())
    addPluck(out, fs, t, midiToFreq(notes[i]), { gain: g, detuneCents: (o.detuneCents ?? 0) + gauss() * 2 })
  })
}

export function addNoise(out: Float32Array, rmsDb: number): void {
  const a = Math.pow(10, rmsDb / 20)
  for (let i = 0; i < out.length; i++) out[i] += a * gauss()
}

/** One-pole high-pass, mimics a laptop/phone mic that rolls off bass. */
export function highpass(x: Float32Array, fs: number, fc: number): Float32Array {
  const y = new Float32Array(x.length)
  const rc = 1 / (2 * Math.PI * fc)
  const dt = 1 / fs
  const a = rc / (rc + dt)
  let py = 0
  let px = 0
  for (let i = 0; i < x.length; i++) {
    py = a * (py + x[i] - px)
    px = x[i]
    y[i] = py
  }
  return y
}

/** Feed a whole signal through an AnalysisCore in 256-sample blocks. */
export function feed(
  push: (block: Float32Array, startFrame: number) => void,
  signal: Float32Array,
  startFrame = 100000,
): void {
  const hop = 256
  for (let i = 0; i + hop <= signal.length; i += hop) {
    push(signal.subarray(i, i + hop), startFrame + i)
  }
}
