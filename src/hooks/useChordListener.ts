import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnalysisFrame } from '../audio/core'
import type { Chord } from '../music/chords'
import { matcher, MATCH_CONFIG, type Ranked, type Sensitivity } from '../dsp/chordMatch'
import { STANDARD_TUNING, midiToFreq } from '../music/notes'
import { useFrames } from './useEngine'

export interface ListenerState {
  signal: boolean
  score: number
  heard: Ranked | null
  /** 0..1 progress of the hold timer */
  progress: number
  matched: boolean
  strings: (boolean | null)[] | null
}

const EMPTY: ListenerState = { signal: false, score: 0, heard: null, progress: 0, matched: false, strings: null }

function stringHints(chord: Chord, frame: AnalysisFrame, a4: number): (boolean | null)[] {
  return chord.frets.map((fret, i) => {
    if (fret === null) return null
    const f = midiToFreq(STANDARD_TUNING[i] + fret, a4)
    const has = (freq: number) =>
      frame.peaks.some((p) => Math.abs(1200 * Math.log2(p.freq / freq)) < 40 && p.prom > 11)
    return has(f) || (has(2 * f) && has(3 * f))
  })
}

/**
 * Listens for `target` and calls onMatch once it has been sounded cleanly for the hold time.
 * Re-arms whenever `target` (or `resetKey`) changes.
 */
export function useChordListener(opts: {
  target: Chord | null
  enabled: boolean
  sensitivity: Sensitivity
  a4: number
  resetKey?: unknown
  onMatch: () => void
}): ListenerState {
  const { target, enabled, sensitivity, a4, resetKey } = opts
  const [state, setState] = useState<ListenerState>(EMPTY)
  const onMatch = useRef(opts.onMatch)
  const hold = useRef<{ since: number | null; bad: number; fired: boolean; armUntil: number }>({
    since: null,
    bad: 0,
    fired: false,
    armUntil: 0,
  })

  useEffect(() => {
    onMatch.current = opts.onMatch
  })

  useEffect(() => {
    hold.current = { since: null, bad: 0, fired: false, armUntil: performance.now() + 350 }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(EMPTY)
  }, [target, resetKey])

  const cb = useCallback(
    (f: AnalysisFrame) => {
      const h = hold.current
      if (!target || !enabled) return
      if (!f.signal || !f.chroma || f.chromaStrength < 2) {
        h.since = null
        setState((s) => (s.signal || s.progress ? { ...EMPTY, strings: null } : s))
        return
      }
      const cfg = MATCH_CONFIG[sensitivity]
      const res = matcher.check(target, f.chroma, cfg)
      const top = matcher.rank(f.chroma)[0]
      const armed = performance.now() >= h.armUntil && !h.fired
      let progress = 0
      if (res.ok && armed) {
        h.bad = 0
        if (h.since === null) h.since = f.time
        progress = Math.min(1, ((f.time - h.since) * 1000) / cfg.holdMs)
        if (progress >= 1 && !h.fired) {
          h.fired = true
          onMatch.current()
        }
      } else {
        h.bad++
        if (h.bad >= 2) h.since = null
        else if (h.since !== null) progress = Math.min(1, ((f.time - h.since) * 1000) / cfg.holdMs)
      }
      setState({
        signal: true,
        score: res.score,
        heard: top && top.score > 0.7 ? top : null,
        progress,
        matched: h.fired,
        strings: stringHints(target, f, a4),
      })
    },
    [target, enabled, sensitivity, a4],
  )

  useFrames('chords', { chroma: true }, cb, enabled && !!target)
  return state
}
