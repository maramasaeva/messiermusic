import { describe, expect, it } from 'vitest'
import { PATTERN_BY_ID } from './strum'
import { BUILTIN_SONGS, parseChart, resolveChordToken, shapeName } from './songs'
import { transposeChord, chordByName } from './chords'

describe('chord token resolution', () => {
  const name = (t: string) => resolveChordToken(t).chord?.name
  it('finds exact chords', () => {
    expect(name('Am7')).toBe('Am7')
    expect(name('Fmaj7')).toBe('Fmaj7')
    expect(name('F#5')).toBe('F#5')
    expect(resolveChordToken('Am7').simplified).toBe(false)
  })
  it('simplifies extensions, slash chords and enharmonics', () => {
    expect(name('G#m7(11)')).toBe('G#m')
    expect(name('F#m7(11)')).toBe('F#m')
    expect(name('F#/A#')).toBe('F#')
    expect(name('Esus4/B')).toBe('Esus4')
    expect(name('Aadd9')).toBe('A')
    expect(name('C#sus4')).toBe('C#')
    expect(name('A#7')).toBe('Bb7')
    expect(name('Cdim')).toBe('Cdim7')
    expect(resolveChordToken('G#m7(11)').simplified).toBe(true)
  })
  it('does not invent chords for rests', () => {
    expect(resolveChordToken('N.C.').chord).toBeNull()
    expect(resolveChordToken('???').chord).toBeNull()
  })
})

describe('chart parser', () => {
  it('splits sections, lyrics and chords, and merges repeated chords into one step', () => {
    const p = parseChart('## A\n[C]Hello [C]there [G]you\n> a note\n[Am] [G]')
    expect(p.sections).toHaveLength(1)
    expect(p.sections[0].lines).toHaveLength(3)
    expect(p.steps.map((s) => s.chord.name)).toEqual(['C', 'G', 'Am', 'G'])
    const first = p.sections[0].lines[0]
    expect(first.kind).toBe('lyric')
    if (first.kind === 'lyric') {
      expect(first.segs.map((s) => s.text)).toEqual(['Hello ', 'there ', 'you'])
      expect(first.segs.map((s) => s.tok?.step)).toEqual([0, 0, 1])
    }
    const only = p.sections[0].lines[2]
    expect(only.kind === 'lyric' && only.chordsOnly).toBe(true)
  })
  it('keeps text that comes before the first chord', () => {
    const p = parseChart('Oh [C]yes')
    const l = p.sections[0].lines[0]
    expect(l.kind === 'lyric' && l.segs[0]).toEqual({ tok: undefined, text: 'Oh ' })
  })
  it('reports chords it cannot draw', () => {
    expect(parseChart('[C]x [Zzz]y').unresolved).toEqual(['Zzz'])
    expect(parseChart('[C]x [E13b9]y').unresolved).toEqual([]) // falls back to E
  })
})

describe('built-in songs', () => {
  for (const s of BUILTIN_SONGS) {
    it(`${s.title} parses fully and uses a real strum pattern`, () => {
      const p = parseChart(s.chart)
      expect(p.unresolved).toEqual([])
      expect(p.steps.length).toBeGreaterThan(8)
      expect(PATTERN_BY_ID[s.patternId]).toBeTruthy()
    })
  }
  it('has no copyrighted lyrics for the two modern songs', () => {
    for (const id of ['waiting-room', 'distortion']) {
      const s = BUILTIN_SONGS.find((x) => x.id === id)!
      const p = parseChart(s.chart)
      for (const sec of p.sections)
        for (const l of sec.lines) if (l.kind === 'lyric') expect(l.segs.every((g) => g.text.replace(/N\.C\./, '').trim() === '')).toBe(true)
    }
  })
})

describe('capo helpers', () => {
  it('transposes sounding pitches, not the shape', () => {
    const c = chordByName('C')
    const t = transposeChord(c, 2)
    expect(t.frets).toEqual(c.frets)
    expect(t.notes).toEqual(c.notes.map((n) => n + 2))
    expect(t.pcs).toEqual(chordByName('D').pcs)
    expect(t.pcMask).toBe(chordByName('D').pcMask)
  })
  it('names the shape for a sounding chord', () => {
    expect(shapeName('D', 2)).toBe('C')
    expect(shapeName('Em', 2)).toBe('Dm')
    expect(shapeName('A', 0)).toBe('A')
  })
})
