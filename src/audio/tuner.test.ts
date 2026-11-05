import { describe, expect, it } from 'vitest'
import { AnalysisCore, type AnalysisFrame } from './core'
import { TunerLogic, type TunerReading } from './tuner'
import { addNoise, addPluck, feed, highpass, reseed } from '../test/synth'
import { midiToFreq, STANDARD_TUNING } from '../music/notes'

const FS = 48000

function runTuner(sig: Float32Array): { reading: TunerReading | null; all: (TunerReading | null)[] } {
  const tuner = new TunerLogic()
  const all: (TunerReading | null)[] = []
  const core = new AnalysisCore(FS, { onFrame: (f: AnalysisFrame) => all.push(tuner.update(f)) })
  core.wants = { pitch: true, chroma: false }
  feed((b, s) => core.pushBlock(b, s), sig, 0)
  const nn = all.filter((r): r is TunerReading => r !== null)
  return { reading: nn.length ? nn[nn.length - 1] : null, all }
}

describe('tuner', () => {
  it('identifies every string and its deviation (clean + noisy)', () => {
    reseed(21)
    for (let s = 0; s < 6; s++) {
      for (const detune of [-30, -9, 0, 6, 22]) {
        const sig = new Float32Array(FS * 2)
        addPluck(sig, FS, 0.2, midiToFreq(STANDARD_TUNING[s]), { detuneCents: detune, gain: 0.15 })
        addNoise(sig, -58)
        const { reading } = runTuner(sig)
        expect(reading, `string ${s} ${detune}`).not.toBeNull()
        expect(reading!.string).toBe(s)
        expect(Math.abs(reading!.cents - detune), `string ${s} detune ${detune} read ${reading!.cents.toFixed(2)}`).toBeLessThan(1)
      }
    }
  })

  it('reports in-tune and a growing hold timer when the string is right', () => {
    reseed(22)
    const sig = new Float32Array(FS * 3)
    addPluck(sig, FS, 0.2, midiToFreq(STANDARD_TUNING[2]), { detuneCents: 1, gain: 0.2, decay: 0.5 })
    const { all } = runTuner(sig)
    const best = Math.max(...all.map((r) => r?.inTuneMs ?? 0))
    expect(best).toBeGreaterThan(800)
  })

  it('handles a bass-less mic on the low strings without wandering to the wrong string', () => {
    reseed(23)
    for (let s = 0; s < 3; s++) {
      const sig = new Float32Array(FS * 2)
      addPluck(sig, FS, 0.2, midiToFreq(STANDARD_TUNING[s]), { detuneCents: -12, gain: 0.2 })
      const hp = highpass(highpass(sig, FS, 160), FS, 160)
      addNoise(hp, -60)
      const { reading } = runTuner(hp)
      expect(reading!.string).toBe(s)
      expect(Math.abs(reading!.cents + 12)).toBeLessThan(1.5)
    }
  })
})
