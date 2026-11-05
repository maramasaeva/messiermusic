import { CHORDS, type Chord } from './chords'

/**
 * A song is metadata plus a plain-text "chart":
 *
 *   ## Verse 1                 starts a section
 *   [C]Twinkle, [F]twinkle     a chord goes right before the word it changes on
 *   [Am] [G] [C]               a line with only chords is fine
 *   > play this softly         a note to yourself
 *
 * The same format is used for built-in songs and for songs you add or edit.
 */
export interface Song {
  id: string
  title: string
  artist: string
  /** Capo fret; chords are written as the shapes you finger. */
  capo: number
  /** Original tempo if known. */
  bpm: number | null
  key?: string
  /** A suggested strum pattern id from music/strum.ts. */
  patternId: string
  strumNote?: string
  level: 1 | 2 | 3
  /** Free-form remark shown under the title (where the chords came from, what's simplified). */
  remark?: string
  chart: string
}

// ---------- chord token -> a chord the app can draw and listen for ----------

const BY_NAME = new Map<string, Chord>()
for (const c of CHORDS) if (!BY_NAME.has(c.name)) BY_NAME.set(c.name, c)

const ROOT_ALIAS: Record<string, string> = { 'A#': 'Bb', 'D#': 'Eb', 'G#': 'Ab', Db: 'C#', Gb: 'F#' }

export interface Resolved {
  label: string
  chord: Chord | null
  /** The shape differs from what is written (extensions or a slash bass were dropped). */
  simplified: boolean
}

export function resolveChordToken(token: string): Resolved {
  const label = token.trim()
  const none: Resolved = { label, chord: null, simplified: false }
  if (!label || /^n\.?c\.?$/i.test(label)) return none
  const m = /^([A-G][#b]?)(.*)$/.exec(label)
  if (!m) return none
  const [qual0] = m[2].split('/')
  const qual = qual0.replace(/\(.*?\)/g, '')
  const minor = /^m(?!aj)/.test(qual)
  const roots = ROOT_ALIAS[m[1]] ? [m[1], ROOT_ALIAS[m[1]]] : [m[1]]
  for (const root of roots) {
    const candidates = [root + qual0, root + qual]
    if (qual.startsWith('dim')) candidates.push(`${root}dim7`)
    candidates.push(root + (minor ? 'm' : ''))
    for (const name of candidates) {
      const chord = BY_NAME.get(name)
      if (chord) return { label, chord, simplified: chord.name !== label }
    }
  }
  return none
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const ROOT_PC: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }

/** "D" heard with a capo on 2 is the "C" shape. */
export function shapeName(soundingName: string, capo: number): string {
  const m = /^([A-G][#b]?)(.*)$/.exec(soundingName)
  if (!m || !capo) return soundingName
  const pc = (((ROOT_PC[m[1]] - capo) % 12) + 12) % 12
  return SHARP_NAMES[pc] + m[2]
}

const CHORD_RE = /\[([^\]]*)\]/g

const GUITAR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

function transposeName(root: string, n: number): string {
  return GUITAR_NAMES[(((ROOT_PC[root] + n) % 12) + 12) % 12]
}

/** "C/G" up 2 semitones is "D/A". Anything that isn't a chord (N.C., ?) is left alone. */
export function transposeToken(label: string, semitones: number): string {
  const m = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(label.trim())
  if (!m || !semitones) return label
  return transposeName(m[1], semitones) + m[2] + (m[3] ? `/${transposeName(m[3], semitones)}` : '')
}

/** Rewrites every [chord] in a chart so it sounds `semitones` higher (use the capo fret to play a capo song without a capo). */
export function transposeChart(chart: string, semitones: number): string {
  if (!semitones) return chart
  return chart.replace(CHORD_RE, (_, tok: string) => `[${transposeToken(tok, semitones)}]`)
}

// ---------- chart parser ----------

export interface Tok {
  label: string
  chord: Chord | null
  simplified: boolean
  /** Index into `steps`, or -1 when there is no shape for it. */
  step: number
}
export interface Seg {
  tok?: Tok
  text: string
}
export type Line = { kind: 'lyric'; segs: Seg[]; chordsOnly: boolean } | { kind: 'note'; text: string }
export interface Section {
  title: string
  lines: Line[]
}
export interface Step {
  chord: Chord
  label: string
  simplified: boolean
}
export interface ParsedSong {
  sections: Section[]
  steps: Step[]
  /** Distinct shapes in order of first use. */
  shapes: Chord[]
  unresolved: string[]
}

export function parseChart(chart: string): ParsedSong {
  const sections: Section[] = []
  const steps: Step[] = []
  const unresolved: string[] = []
  let cur: Section | null = null
  const ensure = () => {
    if (!cur) {
      cur = { title: '', lines: [] }
      sections.push(cur)
    }
    return cur
  }

  for (const raw of chart.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) continue
    const head = /^\s*##\s*(.*)$/.exec(line)
    if (head) {
      cur = { title: head[1].trim(), lines: [] }
      sections.push(cur)
      continue
    }
    const note = /^\s*>\s?(.*)$/.exec(line)
    if (note) {
      ensure().lines.push({ kind: 'note', text: note[1] })
      continue
    }

    const segs: Seg[] = []
    let last = 0
    let pending: Tok | undefined
    const push = (text: string) => {
      if (pending || text) segs.push({ tok: pending, text })
      pending = undefined
    }
    for (const m of line.matchAll(CHORD_RE)) {
      push(line.slice(last, m.index))
      last = m.index + m[0].length
      const r = resolveChordToken(m[1])
      let step = -1
      if (r.chord) {
        const prev = steps[steps.length - 1]
        if (prev && prev.chord.id === r.chord.id) step = steps.length - 1
        else {
          steps.push({ chord: r.chord, label: r.label, simplified: r.simplified })
          step = steps.length - 1
        }
      } else if (r.label && !/^n\.?c\.?$/i.test(r.label) && !unresolved.includes(r.label)) unresolved.push(r.label)
      pending = { label: r.label, chord: r.chord, simplified: r.simplified, step }
    }
    push(line.slice(last))
    const chordsOnly = segs.length > 0 && segs.every((s) => !s.text.trim())
    if (chordsOnly) for (const s of segs) s.text = ''
    ensure().lines.push({ kind: 'lyric', segs, chordsOnly })
  }

  const seen = new Set<string>()
  const shapes: Chord[] = []
  for (const s of steps)
    if (!seen.has(s.chord.id)) {
      seen.add(s.chord.id)
      shapes.push(s.chord)
    }
  return { sections, steps, shapes, unresolved }
}

// ---------- built-in songs ----------

const TWINKLE = `
## Verse 1
[C]Twinkle, twinkle, [F]little [C]star,
[F]How I [C]wonder [G]what you [C]are.
[C]Up a[F]bove the [C]world so [G]high,
[C]Like a [F]dia-mond [C]in the [G]sky.

## Verse 2 (same again)
[C]Twinkle, twinkle, [F]little [C]star,
[F]How I [C]wonder [G]what you [C]are.
`

const WAITING_ROOM = `
> Add your own lyrics under the chords with Edit (the lyrics are not included here).
## Intro
[C] [Fmaj7] [Am7] [Em] [G]
[Am7] [Fmaj7] [C] [Em] [G]
## Verse 1
[C] [Fmaj7] [Am7] [Em] [G]
[C] [Fmaj7] [C] [Em] [G]
## Chorus
[Fmaj7] [C]
[G] [Am7]
[Fmaj7] [C]
[G] [Am7]
[Fmaj7] [C]
[Fmaj7] [C]
[G] [Am7]
[Fmaj7] [G] [C]
## Instrumental
[C] [Fmaj7] [Am7] [Em] [G]
[Am7] [Fmaj7] [C] [Em] [G]
## Verse 2
[C] [Fmaj7]
[Am7] [Em] [G]
[Am7] [Fmaj7]
[C]
[Em] [G]
## Chorus 2 (same shape as the first chorus, with small variations)
[Fmaj7] [C]
[G] [Am7]
[Fmaj7] [C]
[G] [Am7]
## Outro (repeat and fade)
> The last line of the chorus is sung over and over on this loop.
[Am7] [Fmaj7] [C] [G]
[Am7] [Fmaj7] [C] [G]
`

const DISTORTION = `
> Written for distorted electric guitar. This is a strummed, simplified version for acoustic.
> Chorus is in F# (barre chords). Start at half speed (about 88 bpm).
## Intro
[A] [D] [A/C#] [Bsus4] [E] [D]
[A/C#] [D]
## Verse 1
[E] [Bsus4]
[A] [Bsus4]
[E] [Bsus4] [Cdim]
[C#m] [Bsus4] [A] [Esus4/B] [E/B]
## Pre-chorus
[E] [F#m7(11)] [Bsus4] [Aadd9]
[E] [F#m7(11)] [Bsus4]
[C#sus4] [C#]
## Chorus 1
[F#] [G#m7(11)] [F#/A#] [B]
[F#] [G#m7(11)] [F#/A#] [B]
[F#] [G#m7(11)] [F#/A#] [B]
[F#] [B] [F#/A#] [B] [F#sus4] [F#] [C#] [F#] [F]
## Verse 2
[E] [Bsus4]
[A] [Bsus4]
[E] [Bsus4] [Cdim]
[C#m] [Bsus4] N.C. [C#sus4] [C#]
## Chorus 2
[F#] [G#m7(11)] [F#/A#] [B]
[F#] [G#m7(11)] [F#/A#] [B]
[F#] [G#m7(11)] [F#/A#] [B]
[F#] [D] [C#]
## Guitar solo (power chords)
[F#5] [A5] [B5] [E5] [F5]
[F#5] [A5] [B5] [E5] [F5]
[F#5] [A5] [B5] [E5] [B5]
[C#] [B/C#] [C#]
## Bridge
[F#] [A#7]
[B] [C#]
[F#] [A#7]
[B] [C#] [C#/G#] [C#/F] [C#7]
## Final chorus
[F#] [G#m7(11)] [F#/A#] [B]
[F#] [G#m7(11)] [F#/A#] [B]
[F#] [G#m7(11)] [F#/A#] [B]
[F#] [G#m7(11)] [F#/A#] [B]
[B] [F#/A#] [G#m7(11)] [F#]
[B] [F#/A#] [G#m7(11)] [F#]
[B] [F#/A#] [G#m] [C#]
[F#] [G#m] [F#]
`

export const BUILTIN_SONGS: Song[] = [
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    artist: 'Traditional',
    capo: 0,
    bpm: 90,
    key: 'C',
    patternId: 'quarters',
    strumNote: 'One gentle downstrum per beat, one chord change every two beats or so. Perfect for your first changes.',
    level: 1,
    remark: 'Public-domain melody. The chords follow the tune: C, F, G.',
    chart: TWINKLE.trim(),
  },
  {
    id: 'waiting-room',
    title: 'Waiting Room',
    artist: 'Phoebe Bridgers',
    capo: 2,
    bpm: null,
    key: 'D (capo 2, C shapes)',
    patternId: 'down-down-up',
    strumNote: 'Suggested, not transcribed: a soft, loose folk strum. Let the chords ring and keep the volume down.',
    level: 2,
    remark:
      'Chord progression assembled from several community charts; they agree on the shapes. Fmaj7 stands in for the F-type chords. Lyrics are not included (copyright).',
    chart: WAITING_ROOM.trim(),
  },
  {
    id: 'distortion',
    title: 'Distortion!!',
    artist: 'Kessoku Band',
    capo: 0,
    bpm: 176,
    key: 'A / F# (chorus)',
    patternId: 'eighths',
    strumNote:
      'Suggested, not transcribed: constant down-up eighths, accenting the downbeats. The original is distorted electric guitar with power chords, so on acoustic keep it percussive.',
    level: 3,
    remark:
      'Progression from a community transcription (ChordWiki). Extended chords are simplified (for example G#m7(11) is played as G#m), and slash chords are played without the bass note. Lyrics are not included (copyright).',
    chart: DISTORTION.trim(),
  },
]
