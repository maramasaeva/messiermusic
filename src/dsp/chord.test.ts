import { describe, expect, it } from 'vitest'
import { AnalysisCore, type AnalysisFrame } from '../audio/core'
import { CHORDS, type Chord } from '../music/chords'
import { matcher, MATCH_CONFIG, type Sensitivity } from './chordMatch'
import { addNoise, addStrum, feed, highpass, reseed } from '../test/synth'

const FS = 48000

function playedFrames(chord: Chord, opts: { detune?: number; hp?: number; noise?: number; dir?: 'D' | 'U' } = {}): AnalysisFrame[] {
  const sig = new Float32Array(Math.round(FS * 2.4))
  addStrum(sig, FS, 0.5, chord.notes, { dir: opts.dir ?? 'D', detuneCents: opts.detune ?? 0, gain: 0.12 })
  addNoise(sig, opts.noise ?? -62)
  const x = opts.hp ? highpass(highpass(sig, FS, opts.hp), FS, opts.hp) : sig
  const frames: AnalysisFrame[] = []
  const core = new AnalysisCore(FS, { onFrame: (f) => frames.push(f) })
  core.wants = { pitch: false, chroma: true }
  feed((b, s) => core.pushBlock(b, s), x, 0)
  return frames.filter((f) => f.time > 0.5 + 0.3 && f.time < 0.5 + 1.6 && f.chroma && f.signal)
}

function acceptRate(frames: AnalysisFrame[], target: Chord, cfg: Sensitivity): number {
  if (frames.length === 0) return 0
  let ok = 0
  for (const f of frames) if (matcher.check(target, f.chroma!, MATCH_CONFIG[cfg]).ok) ok++
  return ok / frames.length
}

describe('chord recognition on synthetic guitar', () => {
  for (const variant of [
    { name: 'clean', opts: {} },
    { name: 'detuned -18c, noisy', opts: { detune: -18, noise: -52 } },
    { name: 'bass-less mic', opts: { hp: 180 } },
    { name: 'upstroke', opts: { dir: 'U' as const } },
  ]) {
    it(`accepts the right chord and rejects others — ${variant.name}`, () => {
      reseed(42)
      const played = CHORDS.map((c) => ({ chord: c, frames: playedFrames(c, variant.opts) }))
      const misses: string[] = []
      const falseAcc: string[] = []
      for (const p of played) {
        const r = acceptRate(p.frames, p.chord, 'normal')
        if (r < 0.7) misses.push(`${p.chord.id}(${(r * 100).toFixed(0)}%)`)
        for (const t of CHORDS) {
          if (t.pcMask === p.chord.pcMask) continue
          const fr = acceptRate(p.frames, t, 'normal')
          if (fr > 0.2) falseAcc.push(`played ${p.chord.id} -> target ${t.id} (${(fr * 100).toFixed(0)}%)`)
        }
      }
      console.log(`[${variant.name}] misses (${misses.length}/${CHORDS.length}): ${misses.join(', ')}`)
      console.log(`[${variant.name}] false accepts (${falseAcc.length}): ${falseAcc.join(' | ')}`)
      expect(misses.length).toBeLessThanOrEqual(Math.ceil(CHORDS.length * 0.05))
      expect(falseAcc.length).toBeLessThanOrEqual(3)
    })
  }
})
