import { describe, expect, it } from 'vitest'
import {
  COURSES,
  courseUnlocked,
  drillLimit,
  exerciseFor,
  knownSoFar,
  lessonUnlocked,
  randomSequence,
  resolveChord,
  scopeBefore,
  starsFor,
  type Progress,
} from './courses'
import { PATTERN_BY_ID } from './strum'

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

describe('curriculum', () => {
  it('has unique lesson ids and real chords and patterns', () => {
    const ids = new Set<string>()
    for (const c of COURSES)
      for (const l of c.lessons) {
        expect(ids.has(l.id), l.id).toBe(false)
        ids.add(l.id)
        if (l.kind === 'learn') expect(() => resolveChord(l.chord)).not.toThrow()
        if (l.kind === 'drill') for (const x of l.sequence) expect(() => resolveChord(x)).not.toThrow()
        if (l.kind === 'strum') {
          expect(PATTERN_BY_ID[l.patternId]).toBeTruthy()
          for (const x of l.chords) expect(() => resolveChord(x)).not.toThrow()
        }
      }
  })

  it('never asks for a chord before it has been taught', () => {
    const known = new Set<string>()
    for (const c of COURSES)
      for (const l of c.lessons) {
        if (l.kind === 'learn') known.add(l.chord)
        if (l.kind === 'drill') for (const x of l.sequence) expect(known.has(x), `${l.id} uses ${x}`).toBe(true)
        if (l.kind === 'strum') for (const x of l.chords) expect(known.has(x), `${l.id} uses ${x}`).toBe(true)
      }
  })

  it('never repeats the same chord back to back in a drill', () => {
    for (const c of COURSES)
      for (const l of c.lessons)
        if (l.kind === 'drill') for (let i = 1; i < l.sequence.length; i++) expect(l.sequence[i], l.id).not.toBe(l.sequence[i - 1])
  })

  it('has recap courses placed after what they recap', () => {
    for (const [i, c] of COURSES.entries()) {
      if (!c.recap) continue
      expect(i).toBeGreaterThan(0)
      expect(scopeBefore(c.id).chords.length, c.id).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('generated recaps', () => {
  it('only use what was taught before them', () => {
    for (const c of COURSES.filter((x) => x.recap)) {
      const scope = scopeBefore(c.id)
      for (const l of c.lessons) {
        const ex = exerciseFor(c, l, seeded(7))!
        expect(ex).toBeTruthy()
        if (ex.type === 'drill') for (const x of ex.sequence) expect(scope.chords).toContain(x)
        else {
          for (const x of ex.chords) expect(scope.chords).toContain(x)
          for (const p of ex.patterns) expect(scope.patterns).toContain(p)
        }
      }
    }
  })
  it('chord check covers every chord exactly once', () => {
    const c = COURSES.find((x) => x.id === 'recap-minors')!
    const ex = exerciseFor(c, c.lessons[0], seeded(3))!
    if (ex.type !== 'drill') throw new Error('expected drill')
    expect([...ex.sequence].sort()).toEqual([...scopeBefore(c.id).chords].sort())
  })
  it('random sequences never repeat a chord twice in a row and use every chord', () => {
    for (let s = 1; s < 40; s++) {
      const seq = randomSequence(['A', 'B', 'C'], 12, seeded(s))
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1])
      expect(new Set(seq.slice(0, 3)).size).toBe(3)
    }
    expect(randomSequence(['A', 'B'], 9, seeded(1))).toHaveLength(9)
  })
})

describe('scoring and unlocking', () => {
  it('awards stars by speed against the limit', () => {
    const limit = drillLimit(9, 5)
    expect(limit).toBe(40)
    expect(starsFor(41, limit)).toBe(0)
    expect(starsFor(39, limit)).toBe(1)
    expect(starsFor(26, limit)).toBe(2)
    expect(starsFor(17, limit)).toBe(3)
  })
  it('unlocks lessons in order, courses after the previous one', () => {
    const progress: Progress = {}
    const c1 = COURSES[0]
    expect(lessonUnlocked(c1, 0, progress, false)).toBe(true)
    expect(lessonUnlocked(c1, 1, progress, false)).toBe(false)
    progress[c1.lessons[0].id] = { stars: 3, at: 0 }
    expect(lessonUnlocked(c1, 1, progress, false)).toBe(true)
    expect(courseUnlocked(1, progress, false)).toBe(false)
    for (const l of c1.lessons) progress[l.id] = { stars: 1, at: 0 }
    expect(courseUnlocked(1, progress, false)).toBe(true) // recap after course 1
    expect(courseUnlocked(2, progress, false)).toBe(true) // minors after majors (recap not required)
    expect(courseUnlocked(3, progress, false)).toBe(false)
    expect(courseUnlocked(3, {}, true)).toBe(true)
  })
  it('summarises what you know from completed lessons', () => {
    const progress: Progress = { 'learn-E': { stars: 3, at: 0 }, 'learn-A': { stars: 1, at: 0 } }
    expect(knownSoFar(progress).chords).toEqual(['E', 'A'])
  })
})
