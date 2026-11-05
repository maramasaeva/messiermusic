export type Stroke = 'D' | 'U' | '-'

export interface StrumPattern {
  id: string
  name: string
  level: 1 | 2 | 3
  beats: number
  /** Steps per beat (2 = eighth notes, 3 = triplets / 6-8, 4 = sixteenths). */
  subdiv: number
  steps: Stroke[]
  blurb: string
}

function p(
  id: string,
  name: string,
  level: 1 | 2 | 3,
  beats: number,
  subdiv: number,
  pattern: string,
  blurb: string,
): StrumPattern {
  const steps = pattern.replace(/\s+/g, '').split('') as Stroke[]
  if (steps.length !== beats * subdiv) throw new Error(`Pattern ${id} has wrong length`)
  return { id, name, level, beats, subdiv, steps, blurb }
}

export const PATTERNS: StrumPattern[] = [
  p('quarters', 'Four on the floor', 1, 4, 2, 'D- D- D- D-', 'Steady downstrums on every beat.'),
  p('eighths', 'Straight eighths', 1, 4, 2, 'DU DU DU DU', 'Constant down-up motion; the hand never stops.'),
  p('down-down-up', 'Down, down-up', 1, 4, 2, 'D- DU D- DU', 'A gentle folk groove.'),
  p('old-faithful', 'The classic (D DU UDU)', 2, 4, 2, 'D- DU -U DU', 'The strum behind a thousand campfire songs. Keep the hand moving through the gaps.'),
  p('pop', 'Pop strum', 2, 4, 2, 'D- -U -U DU', 'Skips beat 2, then rides the off-beats.'),
  p('folk-drive', 'Folk drive', 2, 4, 2, 'D- DU DU DU', 'Driving eighths with the first beat left open.'),
  p('backbeat', 'Backbeat lift', 2, 4, 2, 'D- -U D- -U', 'Down on 1 and 3, up-strums on the ands of 2 and 4.'),
  p('reggae', 'Offbeat skank', 2, 4, 2, '-U -U -U -U', 'Only hit the "ands". Count out loud!'),
  p('syncopated', 'Syncopated push', 3, 4, 2, 'D- -U UD -U', 'Tied-over rhythm: a strum lands between beats 2 and 3.'),
  p('ballad', 'Ballad', 3, 4, 2, 'D- -U -U D-', 'Open and spacious, with a lazy push into the next bar.'),
  p('waltz', 'Waltz (3/4)', 2, 3, 2, 'D- DU DU', 'One-two-three, one-two-three.'),
  p('sixteenths', 'Sixteenth drive', 3, 4, 4, 'D-DU -UDU D-DU -UDU', 'Four hits per beat; keep the wrist loose.'),
  p('six-eight', '6/8 rock', 3, 2, 3, 'D-- D-U', 'Two big pulses, each divided in three.'),
]

export const PATTERN_BY_ID: Record<string, StrumPattern> = Object.fromEntries(PATTERNS.map((x) => [x.id, x]))

/** Counting syllables for each step, e.g. "1 & 2 & 3 & 4 &". */
export function stepLabels(beats: number, subdiv: number): string[] {
  const out: string[] = []
  const syl: Record<number, string[]> = {
    1: [''],
    2: ['', '&'],
    3: ['', 'la', 'li'],
    4: ['', 'e', '&', 'a'],
  }
  for (let b = 1; b <= beats; b++) {
    for (let s = 0; s < subdiv; s++) out.push(s === 0 ? String(b) : syl[subdiv][s])
  }
  return out
}
