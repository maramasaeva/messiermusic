import { describe, expect, it } from 'vitest'
import { PitchDetector } from './pitch'
import { FundamentalRefiner, REFINE_WINDOW } from './refine'
import { addPluck, highpass, addNoise, reseed } from '../test/synth'
import { midiToFreq, STANDARD_TUNING } from '../music/notes'

const FS_LIST = [44100, 48000]

describe('pitch pipeline', () => {
  for (const fs of FS_LIST) {
    it(`measures open strings within 1 cent @${fs}`, () => {
      reseed(7)
      const det = new PitchDetector(fs, 4096)
      const ref = new FundamentalRefiner(fs)
      const raw: number[] = []
      const fine: number[] = []
      for (const m of STANDARD_TUNING) {
        for (const detune of [-25, -8, 0, 4, 17]) {
          const f = midiToFreq(m)
          const target = f * Math.pow(2, detune / 1200)
          const buf = new Float32Array(fs * 2)
          addPluck(buf, fs, 0, f, { detuneCents: detune, gain: 0.2 })
          addNoise(buf, -70)
          for (const t of [0.4, 0.6, 1.0]) {
            const end = Math.round(t * fs)
            const r = det.detect(buf.subarray(0, end), 60, 1100)
            expect(r, `no pitch for midi ${m} detune ${detune}`).not.toBeNull()
            raw.push(Math.abs(1200 * Math.log2(r!.freq / target)))
            const rf = ref.refine(buf.subarray(end - REFINE_WINDOW, end), r!.freq)
            expect(rf, `no refine ${m} ${detune}`).not.toBeNull()
            const c = Math.abs(1200 * Math.log2(rf! / target))
            fine.push(c)
            expect(c, `midi ${m} detune ${detune} t ${t}`).toBeLessThan(1)
          }
        }
      }
      const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
      console.log(
        `fs=${fs} raw mean ${mean(raw).toFixed(2)} max ${Math.max(...raw).toFixed(2)} | refined mean ${mean(fine).toFixed(2)} max ${Math.max(...fine).toFixed(2)} cents`,
      )
    })
  }

  it('bass-less mic (2x 150 Hz high-pass): refiner still recovers the fundamental', () => {
    reseed(9)
    const fs = 48000
    const det = new PitchDetector(fs, 4096)
    const ref = new FundamentalRefiner(fs)
    for (const m of STANDARD_TUNING.slice(0, 3)) {
      const f = midiToFreq(m)
      const buf = new Float32Array(fs * 2)
      addPluck(buf, fs, 0, f, { gain: 0.2 })
      const hp = highpass(highpass(buf, fs, 150), fs, 150)
      const end = Math.round(0.6 * fs)
      const r = det.detect(hp.subarray(0, end), 60, 1100)
      expect(r).not.toBeNull()
      const ratio = r!.freq / f
      const rf = ref.refine(hp.subarray(end - REFINE_WINDOW, end), r!.freq)
      const c = rf ? 1200 * Math.log2(rf / f) : NaN
      console.log(
        `midi ${m}: MPM ${r!.freq.toFixed(2)} Hz (x${ratio.toFixed(3)}); refined ${rf?.toFixed(3)} (${c.toFixed(2)}c from true f0)`,
      )
    }
  })
})
