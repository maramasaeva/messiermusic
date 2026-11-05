import { describe, expect, it } from 'vitest'
import { StrumJudge, type BarPlan } from './judge'
import { PATTERN_BY_ID } from '../music/strum'
import { chordByName } from '../music/chords'

const BPM = 90
const stepDur = 60 / BPM / 2

function bar(index: number, start: number, patternId = 'old-faithful', chord = false): BarPlan {
  return {
    index,
    start,
    stepDur,
    steps: PATTERN_BY_ID[patternId].steps,
    countIn: false,
    chord: chord ? chordByName('G') : null,
    judged: true,
    version: 1,
  }
}

function play(judge: StrumJudge, plan: BarPlan, opts: { skip?: number[]; offsetMs?: number; extraAt?: number[] } = {}) {
  plan.steps.forEach((s, i) => {
    if (s === '-' || opts.skip?.includes(i)) return
    judge.addOnset(plan.start + i * stepDur + (opts.offsetMs ?? 0) / 1000, 0)
  })
  for (const i of opts.extraAt ?? []) judge.addOnset(plan.start + i * stepDur, 0)
}

describe('StrumJudge', () => {
  const cfg = { slack: 0.125, checkDirection: false, checkChord: false }
  const barLen = stepDur * 8

  it('passes a clean bar and reports timing bias', () => {
    const j = new StrumJudge(cfg)
    const b = bar(1, 10)
    j.addBar(b)
    play(j, b, { offsetMs: 18 })
    const [r] = j.finalize(10 + barLen + 1)
    expect(r.pass).toBe(true)
    expect(r.hits).toBe(r.expected)
    expect(r.meanDeltaMs).toBeCloseTo(18, 0)
  })

  it('tolerates one slip at normal strictness but not at strict', () => {
    for (const [slack, pass] of [
      [0.125, true],
      [0, false],
    ] as const) {
      const j = new StrumJudge({ ...cfg, slack })
      const b = bar(1, 10)
      j.addBar(b)
      play(j, b, { skip: [3] })
      const [r] = j.finalize(10 + barLen + 1)
      expect(r.misses).toBe(1)
      expect(r.pass).toBe(pass)
    }
  })

  it('fails a bar with too many misses', () => {
    const j = new StrumJudge(cfg)
    const b = bar(1, 10)
    j.addBar(b)
    play(j, b, { skip: [0, 2, 3] })
    const [r] = j.finalize(10 + barLen + 1)
    expect(r.pass).toBe(false)
    expect(r.misses).toBe(3)
  })

  it('counts strums on rests as extras (strict)', () => {
    const j = new StrumJudge({ ...cfg, slack: 0 })
    const b = bar(1, 10)
    j.addBar(b)
    play(j, b, { extraAt: [1] }) // step 1 is a rest in old-faithful ("D-")
    const [r] = j.finalize(10 + barLen + 1)
    expect(r.extras).toBe(1)
    expect(r.pass).toBe(false)
  })

  it('rejects hits that land too far from the grid', () => {
    const j = new StrumJudge(cfg)
    const b = bar(1, 10)
    j.addBar(b)
    play(j, b, { offsetMs: 160 })
    const [r] = j.finalize(10 + barLen + 1)
    expect(r.pass).toBe(false)
  })

  it('evaluates the chord ~0.2–0.6 s after the first strum when enabled', () => {
    const j = new StrumJudge({ ...cfg, checkChord: true })
    const b = bar(1, 10, 'old-faithful', true)
    j.addBar(b)
    play(j, b)
    for (let t = 10.1; t < 11; t += 0.043) j.addChordFrame(t, () => true)
    const [r] = j.finalize(10 + barLen + 1)
    expect(r.chordOk).toBe(true)
    expect(r.pass).toBe(true)

    const j2 = new StrumJudge({ ...cfg, checkChord: true })
    const b2 = bar(1, 10, 'old-faithful', true)
    j2.addBar(b2)
    play(j2, b2)
    for (let t = 10.1; t < 11; t += 0.043) j2.addChordFrame(t, () => false)
    const [r2] = j2.finalize(10 + barLen + 1)
    expect(r2.chordOk).toBe(false)
    expect(r2.pass).toBe(false)
  })

  it('does not judge count-in bars', () => {
    const j = new StrumJudge(cfg)
    const b = { ...bar(0, 5), countIn: true }
    j.addBar(b)
    j.addOnset(5.2, 0)
    const [r] = j.finalize(5 + barLen + 1)
    expect(r.pass).toBe(false)
    expect(r.extras).toBe(0)
  })
})
