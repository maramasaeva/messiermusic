import { CHORDS, CHORD_BY_ID, type Chord } from './chords'
import { PATTERN_BY_ID, type StrumPattern } from './strum'

/**
 * Courses are an ordered curriculum. Lessons inside a course unlock one after another.
 * "Recap" courses are generated from everything taught before them, so they always
 * test exactly what you have learned up to that point.
 */

export type RecapMode = 'chords' | 'changes' | 'sprint' | 'strums'

export interface LearnLesson {
  kind: 'learn'
  id: string
  title: string
  blurb: string
  /** Chord id (see music/chords). */
  chord: string
  tips: string[]
  /** Clean plays needed, with the strings muted in between. */
  plays: number
}
export interface DrillLesson {
  kind: 'drill'
  id: string
  title: string
  blurb: string
  sequence: string[]
  /** Seconds allowed per change (the clock starts with your first chord). */
  secPerChord: number
}
export interface StrumLesson {
  kind: 'strum'
  id: string
  title: string
  blurb: string
  patternId: string
  chords: string[]
  barsPerChord: number
  bpm: number
  /** Clean bars in a row needed. */
  bars: number
}
export interface RecapLesson {
  kind: 'recap'
  id: string
  title: string
  blurb: string
  mode: RecapMode
}
export type Lesson = LearnLesson | DrillLesson | StrumLesson | RecapLesson

export interface Course {
  id: string
  title: string
  blurb: string
  level: 1 | 2 | 3
  recap: boolean
  lessons: Lesson[]
}

const learn = (chord: string, blurb: string, tips: string[], plays = 2): LearnLesson => ({
  kind: 'learn',
  id: `learn-${chord.replace(/[^a-z0-9]/gi, '')}`,
  title: `${chord.replace(':easy', ' (easy)')} chord`,
  blurb,
  chord,
  tips,
  plays,
})
const drill = (id: string, title: string, blurb: string, sequence: string[], secPerChord = 5): DrillLesson => ({
  kind: 'drill',
  id,
  title,
  blurb,
  sequence,
  secPerChord,
})
const strum = (
  id: string,
  title: string,
  blurb: string,
  patternId: string,
  chords: string[],
  barsPerChord: number,
  bpm: number,
  bars = 2,
): StrumLesson => ({ kind: 'strum', id, title, blurb, patternId, chords, barsPerChord, bpm, bars })
const recap = (id: string, title: string, blurb: string, mode: RecapMode): RecapLesson => ({ kind: 'recap', id, title, blurb, mode })

export const COURSES: Course[] = [
  {
    id: 'majors',
    title: 'Open major chords',
    blurb: 'Your first five bright, happy chords: E, A, D, C and G. Learn each shape, then change between them.',
    level: 1,
    recap: false,
    lessons: [
      learn('E', 'The first major chord. Big and full: all six strings ring.', [
        'Index finger on the G string (3rd string), 1st fret.',
        'Middle finger on the A string, 2nd fret. Ring finger on the D string, 2nd fret.',
        'Strum all six strings.',
      ]),
      learn('A', 'Three fingers in a row on the 2nd fret.', [
        'Index, middle and ring fingers side by side on the D, G and B strings at the 2nd fret.',
        'Strum from the A string (5th string). Skip the low E.',
        'Squeeze the fingers together; the B string is the one that tends to mute.',
      ]),
      drill('majors-e-a', 'E ↔ A', 'Your first chord change. Take it slowly: look ahead and move all fingers at once.', ['E', 'A', 'E', 'A', 'E', 'A', 'E', 'A'], 6),
      learn('D', 'A little triangle at the top of the neck.', [
        'Index on the G string, 2nd fret. Ring finger on the B string, 3rd fret. Middle finger on the high E string, 2nd fret.',
        'Strum only the top four strings (from the D string).',
      ]),
      drill('majors-a-d-e', 'A – D – E', 'The three chords behind a huge number of rock and blues songs.', ['A', 'D', 'E', 'A', 'D', 'E', 'A', 'D', 'E'], 5),
      learn('C', 'The first stretchy shape: fingers climb the strings.', [
        'Ring finger on the A string, 3rd fret. Middle finger on the D string, 2nd fret. Index finger on the B string, 1st fret.',
        'Strum from the A string. Skip the low E.',
      ]),
      learn('G', 'A wide reach that rings out beautifully.', [
        'Middle finger on the low E string, 3rd fret. Index finger on the A string, 2nd fret.',
        'Pinky (or ring) on the high E string, 3rd fret. Leave D, G and B open.',
        'Strum all six strings.',
      ]),
      drill('majors-c-g', 'C ↔ G', 'The change everyone struggles with, and everyone gets there.', ['C', 'G', 'C', 'G', 'C', 'G', 'C', 'G'], 6),
      drill('majors-mix', 'All five majors', 'Every chord you know so far, in a mixed order.', ['E', 'A', 'D', 'G', 'C', 'D', 'A', 'E', 'C', 'G'], 5),
    ],
  },
  {
    id: 'recap-majors',
    title: 'Recap: open majors',
    blurb: 'Check that E, A, D, C and G really stuck. The exercises are shuffled every time.',
    level: 1,
    recap: true,
    lessons: [
      recap('recap1-chords', 'Chord check', 'Each chord you know, once, in random order.', 'chords'),
      recap('recap1-changes', 'Change check', 'Random changes between the chords you know.', 'changes'),
      recap('recap1-sprint', 'Speed round', 'A long, quick run. Beat the clock.', 'sprint'),
    ],
  },
  {
    id: 'minors',
    title: 'Open minor chords',
    blurb: 'The moody sound: Em, Am and Dm. Then mix them with your majors.',
    level: 1,
    recap: false,
    lessons: [
      learn('Em', 'The easiest chord of all, and a good place to start the minors.', [
        'Middle finger on the A string, 2nd fret. Ring finger on the D string, 2nd fret.',
        'Strum all six strings.',
      ]),
      learn('Am', 'Looks like an E chord shifted down one string.', [
        'Middle finger on the D string, 2nd fret. Ring finger on the G string, 2nd fret. Index finger on the B string, 1st fret.',
        'Strum from the A string. Skip the low E.',
      ]),
      drill('minors-em-am', 'Em ↔ Am', 'Two fingers stay the same shape and just hop over a string.', ['Em', 'Am', 'Em', 'Am', 'Em', 'Am', 'Em', 'Am'], 5),
      learn('Dm', 'A tight shape on the highest strings.', [
        'Index finger on the high E string, 1st fret. Middle finger on the G string, 2nd fret. Ring finger on the B string, 3rd fret.',
        'Strum only the top four strings (from the D string).',
      ]),
      drill('minors-three', 'Am – Dm – Em', 'All three minors in a loop.', ['Am', 'Dm', 'Em', 'Am', 'Dm', 'Em', 'Am', 'Dm', 'Em'], 5),
      drill('minors-mix-major', 'Major meets minor', 'Em – C – G – D style changes: the backbone of countless pop songs.', ['Em', 'C', 'G', 'D', 'Em', 'C', 'G', 'D'], 5),
      drill('minors-mix-2', 'Am – C – G – E', 'Another classic loop that mixes both families.', ['Am', 'C', 'G', 'E', 'Am', 'C', 'G', 'E'], 5),
      drill('minors-all', 'Everything so far', 'Eight chords, mixed up. Quick hands!', ['Em', 'A', 'Dm', 'G', 'Am', 'D', 'C', 'E', 'Am', 'G'], 5),
    ],
  },
  {
    id: 'recap-minors',
    title: 'Recap: majors + minors',
    blurb: 'All eight open chords so far, mixed together.',
    level: 1,
    recap: true,
    lessons: [
      recap('recap2-chords', 'Chord check', 'Every chord you have learned, once, in random order.', 'chords'),
      recap('recap2-changes', 'Change check', 'Random changes between all your chords.', 'changes'),
      recap('recap2-sprint', 'Speed round', 'The long one. Stay relaxed and keep moving.', 'sprint'),
    ],
  },
  {
    id: 'strums',
    title: 'Chords + strumming',
    blurb: 'Put rhythm and chords together: play a strum pattern while changing chords on time.',
    level: 2,
    recap: false,
    lessons: [
      strum('strum-quarters', 'Four on the floor', 'One downstrum per beat while you swap between two chords every two bars.', 'quarters', ['G', 'C'], 2, 60),
      strum('strum-eighths', 'Straight eighths', 'Down-up, down-up: keep the hand moving like a pendulum.', 'eighths', ['Am', 'C'], 2, 60),
      strum('strum-ddu', 'Down, down-up', 'A gentle folk groove across four chords.', 'down-down-up', ['G', 'D', 'Em', 'C'], 1, 65),
      strum('strum-classic', 'The classic strum', 'The pattern behind a thousand campfire songs.', 'old-faithful', ['C', 'G', 'Am', 'Em'], 1, 65),
      strum('strum-pop', 'Pop strum', 'Skips the second beat and rides the off-beats.', 'pop', ['Am', 'C', 'G', 'D'], 1, 70),
      strum('strum-combo', 'Combination', 'The classic strum over a longer loop, a little faster.', 'old-faithful', ['G', 'Em', 'C', 'D'], 1, 80, 3),
    ],
  },
  {
    id: 'recap-strums',
    title: 'Recap: chords + strums',
    blurb: 'Everything together: all your chords, plus the strum patterns you learned.',
    level: 2,
    recap: true,
    lessons: [
      recap('recap3-chords', 'Chord check', 'Every chord you have learned, once, in random order.', 'chords'),
      recap('recap3-sprint', 'Speed round', 'A long, quick run through all your chords.', 'sprint'),
      recap('recap3-strums', 'Strum check', 'A random loop of your chords, played with strum patterns you learned.', 'strums'),
    ],
  },
]

export const COURSE_BY_ID: Record<string, Course> = Object.fromEntries(COURSES.map((c) => [c.id, c]))

export function lessonsOf(course: Course): Lesson[] {
  return course.lessons
}

export function resolveChord(id: string): Chord {
  const c = CHORD_BY_ID[id] ?? CHORDS.find((x) => x.name === id)
  if (!c) throw new Error(`Unknown chord ${id}`)
  return c
}

// ---------- scope and generated exercises ----------

export interface Scope {
  chords: string[]
  patterns: string[]
}

/** What the curriculum has taught before the given course starts. */
export function scopeBefore(courseId: string): Scope {
  const chords: string[] = []
  const patterns: string[] = []
  for (const c of COURSES) {
    if (c.id === courseId) break
    for (const l of c.lessons) {
      if (l.kind === 'learn' && !chords.includes(l.chord)) chords.push(l.chord)
      if (l.kind === 'strum' && !patterns.includes(l.patternId)) patterns.push(l.patternId)
    }
  }
  return { chords, patterns }
}

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** `n` chords from `pool`, never the same chord twice in a row, and every chord used before any repeats. */
export function randomSequence(pool: string[], n: number, rnd: () => number = Math.random): string[] {
  if (pool.length === 0) return []
  if (pool.length === 1) return Array<string>(n).fill(pool[0])
  const out: string[] = []
  let bag: string[] = []
  while (out.length < n) {
    if (bag.length === 0) bag = shuffle(pool, rnd)
    const last = out[out.length - 1]
    let i = bag.findIndex((c) => c !== last)
    if (i < 0) {
      bag = shuffle(pool, rnd)
      i = bag.findIndex((c) => c !== last)
    }
    out.push(bag.splice(i, 1)[0])
  }
  return out
}

export type Exercise =
  | { type: 'drill'; sequence: string[]; secPerChord: number }
  | { type: 'strum'; patterns: string[]; chords: string[]; barsPerChord: number; bpm: number; bars: number }

/** Turns a lesson into something playable (recaps are shuffled fresh each attempt). */
export function exerciseFor(course: Course, lesson: Lesson, rnd: () => number = Math.random): Exercise | null {
  if (lesson.kind === 'drill') return { type: 'drill', sequence: lesson.sequence, secPerChord: lesson.secPerChord }
  if (lesson.kind === 'strum') {
    return { type: 'strum', patterns: [lesson.patternId], chords: lesson.chords, barsPerChord: lesson.barsPerChord, bpm: lesson.bpm, bars: lesson.bars }
  }
  if (lesson.kind === 'recap') {
    const { chords, patterns } = scopeBefore(course.id)
    if (lesson.mode === 'chords') return { type: 'drill', sequence: randomSequence(chords, chords.length, rnd), secPerChord: 4.5 }
    if (lesson.mode === 'changes') return { type: 'drill', sequence: randomSequence(chords, 12, rnd), secPerChord: 4 }
    if (lesson.mode === 'sprint') return { type: 'drill', sequence: randomSequence(chords, Math.max(14, chords.length * 2), rnd), secPerChord: 3.5 }
    if (lesson.mode === 'strums') {
      const pats = shuffle(patterns, rnd).slice(0, 3)
      return { type: 'strum', patterns: pats, chords: randomSequence(chords, 4, rnd), barsPerChord: 1, bpm: 70, bars: 2 }
    }
  }
  return null
}

// ---------- scoring and progress ----------

/** Seconds from your first chord to your last (so n-1 changes). */
export function drillLimit(sequenceLength: number, secPerChord: number): number {
  return Math.max(1, sequenceLength - 1) * secPerChord
}

export function starsFor(seconds: number, limit: number): 0 | 1 | 2 | 3 {
  if (seconds > limit) return 0
  if (seconds <= limit * 0.45) return 3
  if (seconds <= limit * 0.7) return 2
  return 1
}

export interface LessonResult {
  stars: number
  bestSec?: number
  at: number
}
export type Progress = Record<string, LessonResult>

export function lessonUnlocked(course: Course, index: number, progress: Progress, unlockAll: boolean): boolean {
  if (unlockAll || index === 0) return true
  return !!progress[course.lessons[index - 1].id]
}

export function courseDone(course: Course, progress: Progress): boolean {
  return course.lessons.every((l) => !!progress[l.id])
}

export function courseUnlocked(index: number, progress: Progress, unlockAll: boolean): boolean {
  if (unlockAll || index === 0) return true
  const course = COURSES[index]
  // a recap opens once the course right before it is done; a normal course once the previous normal course is done
  if (course.recap) return courseDone(COURSES[index - 1], progress)
  for (let i = index - 1; i >= 0; i--) if (!COURSES[i].recap) return courseDone(COURSES[i], progress)
  return true
}

export function patternOf(id: string): StrumPattern {
  const p = PATTERN_BY_ID[id]
  if (!p) throw new Error(`Unknown pattern ${id}`)
  return p
}

/** Chords and patterns you have actually learned (completed lessons), for the "known so far" summary. */
export function knownSoFar(progress: Progress): Scope {
  const chords: string[] = []
  const patterns: string[] = []
  for (const c of COURSES)
    for (const l of c.lessons) {
      if (!progress[l.id]) continue
      if (l.kind === 'learn') chords.push(l.chord)
      if (l.kind === 'strum' && !patterns.includes(l.patternId)) patterns.push(l.patternId)
    }
  return { chords, patterns }
}
