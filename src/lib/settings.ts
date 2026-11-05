import { createStore } from './store'
import type { Sensitivity } from '../dsp/chordMatch'
import type { ChordGroup } from '../music/chords'
import { engine } from '../audio/engine'

export interface Settings {
  deviceId: string | null
  a4: number
  sensitivity: Sensitivity
  strumSensitivity: 'low' | 'normal' | 'high'
  /** null = automatic estimate */
  latencyMs: number | null
  clickVolume: number
  /** Software boost for quiet microphones. */
  micGain: number

  // chord trainer
  chordGroups: ChordGroup[]
  chordOrder: 'random' | 'sequence'
  showHints: boolean

  // transitions
  changesProgression: string
  changesCustom: string[]
  changesTimer: boolean

  // strumming
  strumPatterns: string[]
  strumProgression: string
  barsPerChord: number
  startBpm: number
  targetBpm: number
  bpmStep: number
  barsToPass: number
  strumTolerance: 'strict' | 'normal' | 'forgiving'
  checkChords: boolean
  checkDirection: boolean
  autoSlow: boolean
  clickSubdivisions: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  deviceId: null,
  a4: 440,
  sensitivity: 'normal',
  strumSensitivity: 'normal',
  latencyMs: null,
  clickVolume: 0.8,
  micGain: 1,

  chordGroups: ['open'],
  chordOrder: 'random',
  showHints: true,

  changesProgression: 'g-c',
  changesCustom: ['Am', 'C', 'G'],
  changesTimer: true,

  strumPatterns: ['quarters', 'eighths', 'down-down-up', 'old-faithful'],
  strumProgression: 'none',
  barsPerChord: 1,
  startBpm: 60,
  targetBpm: 90,
  bpmStep: 5,
  barsToPass: 2,
  strumTolerance: 'normal',
  checkChords: true,
  checkDirection: false,
  autoSlow: true,
  clickSubdivisions: true,
}

export const settingsStore = createStore<Settings>('mm:settings:v1', DEFAULT_SETTINGS)

const FLUX: Record<Settings['strumSensitivity'], number> = { low: 11, normal: 7, high: 5 }

export function applySettingsToEngine(): void {
  const s = settingsStore.get()
  engine.configure({ a4: s.a4, minFlux: FLUX[s.strumSensitivity], gain: s.micGain })
}

settingsStore.subscribe(applySettingsToEngine)
applySettingsToEngine()

/** Seconds between a sound being audible/performed and its onset being reported. */
export function effectiveLatency(): number {
  const s = settingsStore.get()
  return s.latencyMs !== null ? s.latencyMs / 1000 : engine.autoLatency
}

// ---------- stats ----------

export interface Stats {
  bestChangesPerMin: Record<string, number>
  chordTimes: Record<string, { n: number; avgMs: number; bestMs: number }>
  strumBest: Record<string, number>
  sessions: number
}

export const statsStore = createStore<Stats>('mm:stats:v1', {
  bestChangesPerMin: {},
  chordTimes: {},
  strumBest: {},
  sessions: 0,
})
