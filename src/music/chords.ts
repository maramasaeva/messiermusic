import { STANDARD_TUNING } from './notes'

export type ChordGroup = 'open' | 'sevenths' | 'sus' | 'barre' | 'power'

export const GROUP_LABELS: Record<ChordGroup, string> = {
  open: 'Open triads',
  sevenths: 'Open 7ths',
  sus: 'Sus / add9',
  barre: 'Barre chords',
  power: 'Power chords',
}

export interface Chord {
  id: string
  name: string
  /** Fret per string, low E first. null = muted. */
  frets: (number | null)[]
  /** Finger per string (0 = none), low E first. */
  fingers?: number[]
  /** Optional barre: fret + range of strings (0 = low E ... 5 = high e). */
  barre?: { fret: number; from: number; to: number }
  group: ChordGroup
  /** 1 (easy) .. 3 (hard) */
  level: 1 | 2 | 3
  /** MIDI notes actually sounded (low to high). */
  notes: number[]
  /** Sorted unique pitch classes. */
  pcs: number[]
  /** Bitmask of pitch classes for fast equality. */
  pcMask: number
}

function make(
  name: string,
  shape: string,
  group: ChordGroup,
  level: 1 | 2 | 3,
  extra: { fingers?: string; barre?: [number, number, number]; id?: string } = {},
): Chord {
  // Shape is 6 tokens; two-digit frets are written in brackets e.g. "x(10)(12)(12)(11)(10)".
  const tokens = shape.match(/x|\(\d+\)|\d/g) ?? []
  if (tokens.length !== 6) throw new Error(`Bad chord shape ${name} ${shape}`)
  const frets = tokens.map((t) => (t === 'x' ? null : Number(t.replace(/[()]/g, ''))))
  const notes: number[] = []
  frets.forEach((f, i) => {
    if (f !== null) notes.push(STANDARD_TUNING[i] + f)
  })
  const pcs = [...new Set(notes.map((n) => n % 12))].sort((a, b) => a - b)
  const pcMask = pcs.reduce((m, p) => m | (1 << p), 0)
  return {
    id: extra.id ?? `${name}:${shape}`,
    name,
    frets,
    fingers: extra.fingers ? extra.fingers.split('').map(Number) : undefined,
    barre: extra.barre ? { fret: extra.barre[0], from: extra.barre[1], to: extra.barre[2] } : undefined,
    group,
    level,
    notes,
    pcs,
    pcMask,
  }
}

export const CHORDS: Chord[] = [
  // --- Open triads
  make('Em', '022000', 'open', 1, { fingers: '023000' }),
  make('Am', 'x02210', 'open', 1, { fingers: '002310' }),
  make('C', 'x32010', 'open', 1, { fingers: '032010' }),
  make('G', '320003', 'open', 1, { fingers: '320004' }),
  make('D', 'xx0232', 'open', 1, { fingers: '000132' }),
  make('A', 'x02220', 'open', 1, { fingers: '001230' }),
  make('E', '022100', 'open', 1, { fingers: '023100' }),
  make('Dm', 'xx0231', 'open', 1, { fingers: '000231' }),
  make('F', 'xx3211', 'open', 2, { fingers: '003211', barre: [1, 4, 5], id: 'F:easy' }),

  // --- Open sevenths
  make('Em7', '022030', 'sevenths', 1, { fingers: '012030' }),
  make('A7', 'x02020', 'sevenths', 1, { fingers: '001020' }),
  make('D7', 'xx0212', 'sevenths', 1, { fingers: '000213' }),
  make('E7', '020100', 'sevenths', 1, { fingers: '020100' }),
  make('G7', '320001', 'sevenths', 2, { fingers: '320001' }),
  make('C7', 'x32310', 'sevenths', 2, { fingers: '032410' }),
  make('B7', 'x21202', 'sevenths', 2, { fingers: '021304' }),
  make('Am7', 'x02010', 'sevenths', 1, { fingers: '002010' }),
  make('Dm7', 'xx0211', 'sevenths', 2, { fingers: '000211' }),
  make('Cmaj7', 'x32000', 'sevenths', 1, { fingers: '032000' }),
  make('Fmaj7', 'xx3210', 'sevenths', 2, { fingers: '003210' }),
  make('Gmaj7', '320002', 'sevenths', 2),
  make('Amaj7', 'x02120', 'sevenths', 2, { fingers: '002130' }),
  make('Dmaj7', 'xx0222', 'sevenths', 2),
  make('Bb7', 'x13131', 'sevenths', 3, { barre: [1, 1, 5] }),
  make('Cdim7', 'x3424x', 'sevenths', 3),
  // --- Sus / add9
  make('Asus2', 'x02200', 'sus', 1, { fingers: '001200' }),
  make('Asus4', 'x02230', 'sus', 1, { fingers: '001230' }),
  make('Dsus2', 'xx0230', 'sus', 1, { fingers: '000120' }),
  make('Dsus4', 'xx0233', 'sus', 1, { fingers: '000134' }),
  make('Esus4', '022200', 'sus', 2),
  make('Cadd9', 'x32030', 'sus', 2, { fingers: '021030' }),
  make('Gadd9', '320203', 'sus', 3),
  make('Bsus4', 'x24452', 'sus', 3, { barre: [2, 1, 5] }),

  // --- Barre chords
  make('F', '133211', 'barre', 2, { fingers: '134211', barre: [1, 0, 5], id: 'F:barre' }),
  make('Fm', '133111', 'barre', 2, { fingers: '134111', barre: [1, 0, 5] }),
  make('F#m', '244222', 'barre', 2, { fingers: '134111', barre: [2, 0, 5] }),
  make('Bm', 'x24432', 'barre', 2, { fingers: '013421', barre: [2, 1, 5] }),
  make('B', 'x24442', 'barre', 2, { fingers: '012341', barre: [2, 1, 5] }),
  make('Bb', 'x13331', 'barre', 2, { barre: [1, 1, 5] }),
  make('Gm', '355333', 'barre', 3, { barre: [3, 0, 5] }),
  make('G', '355433', 'barre', 3, { barre: [3, 0, 5], id: 'G:barre' }),
  make('Cm', 'x35543', 'barre', 3, { barre: [3, 1, 5] }),
  make('C#m', 'x46654', 'barre', 3, { barre: [4, 1, 5] }),
  make('Bm7', 'x24232', 'barre', 3, { barre: [2, 1, 5] }),
  make('F#', '244322', 'barre', 3, { barre: [2, 0, 5] }),
  make('G#m', '466444', 'barre', 3, { barre: [4, 0, 5] }),
  make('C#', 'x46664', 'barre', 3, { barre: [4, 1, 5] }),
  make('F#7', '242322', 'barre', 3, { barre: [2, 0, 5] }),
  make('Ab', '466544', 'barre', 3, { barre: [4, 0, 5] }),
  make('Eb', 'x68886', 'barre', 3, { barre: [6, 1, 5] }),

  // --- Power chords
  make('E5', '022xxx', 'power', 1),
  make('A5', 'x022xx', 'power', 1),
  make('D5', 'xx023x', 'power', 1),
  make('G5', '355xxx', 'power', 2),
  make('C5', 'x355xx', 'power', 2),
  make('B5', 'x244xx', 'power', 2),
  make('F5', '133xxx', 'power', 2),
  make('F#5', '244xxx', 'power', 2),
]

export const CHORD_BY_ID: Record<string, Chord> = Object.fromEntries(CHORDS.map((c) => [c.id, c]))

export function chordByName(name: string): Chord {
  const c = CHORDS.find((x) => x.name === name)
  if (!c) throw new Error(`Unknown chord ${name}`)
  return c
}

/** The same shape played with a capo: the shape stays, the sounding pitches move up. */
export function transposeChord(c: Chord, semitones: number): Chord {
  if (!semitones) return c
  const notes = c.notes.map((n) => n + semitones)
  const pcs = [...new Set(notes.map((n) => n % 12))].sort((a, b) => a - b)
  const pcMask = pcs.reduce((m, p) => m | (1 << p), 0)
  return { ...c, id: `${c.id}+capo${semitones}`, notes, pcs, pcMask }
}

export function chordLabel(c: Chord): string {
  if (c.id === 'F:easy') return 'F (easy)'
  if (c.id === 'F:barre') return 'F (barre)'
  if (c.id === 'G:barre') return 'G (barre)'
  return c.name
}

export interface Progression {
  id: string
  name: string
  chords: string[]
}

export const PROGRESSIONS: Progression[] = [
  { id: 'g-c', name: 'G ↔ C', chords: ['G', 'C'] },
  { id: 'am-c', name: 'Am ↔ C', chords: ['Am', 'C'] },
  { id: 'em-a', name: 'Em ↔ A', chords: ['Em', 'A'] },
  { id: 'd-a', name: 'D ↔ A', chords: ['D', 'A'] },
  { id: 'c-f', name: 'C ↔ F (easy)', chords: ['C', 'F:easy'] },
  { id: 'g-d', name: 'G ↔ D', chords: ['G', 'D'] },
  { id: 'am-e', name: 'Am ↔ E', chords: ['Am', 'E'] },
  { id: 'em-c-g-d', name: 'Em – C – G – D', chords: ['Em', 'C', 'G', 'D'] },
  { id: 'g-em-c-d', name: 'G – Em – C – D', chords: ['G', 'Em', 'C', 'D'] },
  { id: 'c-g-am-f', name: 'C – G – Am – F', chords: ['C', 'G', 'Am', 'F:easy'] },
  { id: 'am-f-c-g', name: 'Am – F – C – G', chords: ['Am', 'F:easy', 'C', 'G'] },
  { id: 'd-a-bm-g', name: 'D – A – Bm – G', chords: ['D', 'A', 'Bm', 'G'] },
  { id: 'am-g-f-e', name: 'Am – G – F – E (Andalusian)', chords: ['Am', 'G', 'F:easy', 'E'] },
  { id: 'e-a-b', name: 'E – A – B (12-bar-ish)', chords: ['E', 'A', 'B'] },
  { id: 'f-bb', name: 'F ↔ Bb (barre)', chords: ['F:barre', 'Bb'] },
]

export function progressionChords(p: Progression): Chord[] {
  return p.chords.map((id) => CHORD_BY_ID[id] ?? chordByName(id))
}
