export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export const DEFAULT_A4 = 440

export function midiToFreq(midi: number, a4 = DEFAULT_A4): number {
  return a4 * Math.pow(2, (midi - 69) / 12)
}

export function freqToMidi(freq: number, a4 = DEFAULT_A4): number {
  return 69 + 12 * Math.log2(freq / a4)
}

export function midiToName(midi: number): string {
  return NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12]
}

export function midiToNameOctave(midi: number): string {
  return `${midiToName(midi)}${Math.floor(Math.round(midi) / 12) - 1}`
}

export function centsBetween(freq: number, ref: number): number {
  return 1200 * Math.log2(freq / ref)
}

/** Standard tuning, low string (6th) first. */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64] as const
export const STRING_LETTERS = ['E', 'A', 'D', 'G', 'B', 'E'] as const
/** Human string numbers, matching STANDARD_TUNING order: 6th string first. */
export const STRING_NUMBERS = [6, 5, 4, 3, 2, 1] as const

export function nextPow2(n: number): number {
  let p = 1
  while (p < n) p <<= 1
  return p
}
