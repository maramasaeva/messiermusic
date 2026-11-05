import { describe, expect, it } from 'vitest'
import { AnalysisCore, type Onset } from '../audio/core'
import { chordByName } from '../music/chords'
import { addNoise, addStrum, feed, reseed } from '../test/synth'

const FS = 48000

function run(bpm: number, pattern: string, chord: string, opts: { noise?: number; gain?: number } = {}) {
  reseed(11)
  const step = 60 / bpm / 2
  const notes = chordByName(chord).notes
  const sig = new Float32Array(Math.round(FS * (1 + step * pattern.length * 2 + 1)))
  const expected: number[] = []
  const t0 = 1
  for (let bar = 0; bar < 2; bar++) {
    pattern.split('').forEach((s, i) => {
      if (s === '-') return
      const t = t0 + (bar * pattern.length + i) * step
      expected.push(t)
      addStrum(sig, FS, t, notes, {
        dir: s === 'D' ? 'D' : 'U',
        only: s === 'U' ? [2, 3, 4, 5] : undefined,
        gain: (opts.gain ?? 0.1) * (s === 'U' ? 0.8 : 1),
      })
    })
  }
  addNoise(sig, opts.noise ?? -60)
  const onsets: Onset[] = []
  const core = new AnalysisCore(FS, { onOnset: (o) => onsets.push(o) })
  feed((b, s) => core.pushBlock(b, s), sig, 0)
  return { expected, onsets }
}

describe('onset detection on strummed patterns', () => {
  for (const [bpm, pattern] of [
    [70, 'D-DU-UDU'],
    [100, 'D-DU-UDU'],
    [120, 'DUDUDUDU'],
    [140, 'D-DU-UDU'],
  ] as const) {
    it(`finds every strum @${bpm} bpm ${pattern}`, () => {
      const { expected, onsets } = run(bpm, pattern, 'G')
      const times = onsets.map((o) => o.time)
      const errs: number[] = []
      const used = new Set<number>()
      let missed = 0
      for (const e of expected) {
        let bi = -1
        let bd = Infinity
        times.forEach((t, i) => {
          if (used.has(i)) return
          const d = Math.abs(t - e)
          if (d < bd) {
            bd = d
            bi = i
          }
        })
        if (bi >= 0 && bd < 0.06) {
          used.add(bi)
          errs.push((times[bi] - e) * 1000)
        } else missed++
      }
      const extras = times.length - used.size
      const mean = errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length)
      console.log(
        `${bpm}bpm ${pattern}: expected ${expected.length} missed ${missed} extra ${extras} mean err ${mean.toFixed(1)}ms range ${Math.min(...errs).toFixed(1)}..${Math.max(...errs).toFixed(1)}`,
      )
      expect(missed).toBe(0)
      expect(extras).toBe(0)
      expect(Math.abs(mean)).toBeLessThan(25)
    })
  }

  it('down strums have a bass-heavier ratio than up strums (top strings only)', () => {
    const { onsets } = run(80, 'DUDUDUDU', 'G')
    const down = onsets.filter((_, i) => i % 2 === 0).map((o) => o.ratioDb)
    const up = onsets.filter((_, i) => i % 2 === 1).map((o) => o.ratioDb)
    const m = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    console.log(`ratio down ${m(down).toFixed(1)} dB, up ${m(up).toFixed(1)} dB`)
    expect(m(down)).toBeGreaterThan(m(up))
  })
})
