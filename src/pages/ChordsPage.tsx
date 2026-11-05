import { useCallback, useEffect, useRef, useState } from 'react'
import { ChordDiagram } from '../components/ChordDiagram'
import { MicGate } from '../components/MicGate'
import { ListenBadge } from '../components/ListenBadge'
import { useChordListener } from '../hooks/useChordListener'
import { useEngineStatus } from '../hooks/useEngine'
import { settingsStore, statsStore } from '../lib/settings'
import { useStore } from '../lib/store'
import { CHORDS, GROUP_LABELS, chordLabel, type Chord, type ChordGroup } from '../music/chords'

const GROUPS = Object.keys(GROUP_LABELS) as ChordGroup[]

function pickNext(deck: Chord[], current: Chord | null, order: 'random' | 'sequence'): Chord | null {
  if (deck.length === 0) return null
  if (deck.length === 1) return deck[0]
  if (order === 'sequence') {
    const i = current ? deck.findIndex((c) => c.id === current.id) : -1
    return deck[(i + 1) % deck.length]
  }
  let c: Chord
  do c = deck[Math.floor(Math.random() * deck.length)]
  while (current && c.id === current.id)
  return c
}

export function ChordsPage() {
  const settings = useStore(settingsStore)
  const status = useEngineStatus()
  const deck = CHORDS.filter((c) => settings.chordGroups.includes(c.group))
  const deckKey = deck.map((c) => c.id).join('|')

  const [target, setTarget] = useState<Chord | null>(() => pickNext(deck, null, settings.chordOrder))
  const [paused, setPaused] = useState(false)
  const [flash, setFlash] = useState<{ ms: number } | null>(null)
  const [log, setLog] = useState<{ id: string; ms: number }[]>([])
  const shownAt = useRef(performance.now())
  const advanceTimer = useRef<number | null>(null)

  // Keep the target valid when the deck changes.
  useEffect(() => {
    if (!target || !deck.some((c) => c.id === target.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTarget(pickNext(deck, null, settings.chordOrder))
      shownAt.current = performance.now()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckKey])

  useEffect(
    () => () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    },
    [],
  )

  const goNext = useCallback(
    (from: Chord | null) => {
      setFlash(null)
      setTarget(pickNext(deck, from, settings.chordOrder))
      shownAt.current = performance.now()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deckKey, settings.chordOrder],
  )

  const onMatch = useCallback(() => {
    if (!target) return
    const ms = performance.now() - shownAt.current
    setFlash({ ms })
    setLog((l) => [{ id: target.id, ms }, ...l].slice(0, 12))
    const prev = statsStore.get().chordTimes[target.id]
    const n = (prev?.n ?? 0) + 1
    statsStore.set({
      chordTimes: {
        ...statsStore.get().chordTimes,
        [target.id]: {
          n,
          avgMs: prev ? prev.avgMs + (ms - prev.avgMs) / n : ms,
          bestMs: prev ? Math.min(prev.bestMs, ms) : ms,
        },
      },
    })
    advanceTimer.current = window.setTimeout(() => goNext(target), 900)
  }, [target, goNext])

  const live = useChordListener({
    target,
    enabled: status === 'running' && !paused && !flash,
    sensitivity: settings.sensitivity,
    a4: settings.a4,
    onMatch,
  })

  const toggleGroup = (g: ChordGroup) => {
    const has = settings.chordGroups.includes(g)
    const next = has ? settings.chordGroups.filter((x) => x !== g) : [...settings.chordGroups, g]
    if (next.length) settingsStore.set({ chordGroups: next })
  }

  const avg = log.length ? log.reduce((a, b) => a + b.ms, 0) / log.length : 0

  return (
    <div className="stack">
      <div className="card">
        <div className="row wrap gap">
          {GROUPS.map((g) => (
            <button key={g} className={`chip ${settings.chordGroups.includes(g) ? 'on' : ''}`} onClick={() => toggleGroup(g)}>
              {GROUP_LABELS[g]}
            </button>
          ))}
          <span className="spacer" />
          <div className="seg">
            <button className={settings.chordOrder === 'random' ? 'on' : ''} onClick={() => settingsStore.set({ chordOrder: 'random' })}>
              Shuffle
            </button>
            <button className={settings.chordOrder === 'sequence' ? 'on' : ''} onClick={() => settingsStore.set({ chordOrder: 'sequence' })}>
              In order
            </button>
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          {deck.length} chords in the deck: {deck.map(chordLabel).join(', ')}
        </p>
      </div>

      <MicGate why="Play the chord shown. When it rings true the app moves on by itself. No tapping needed.">
        <ListenBadge />
        {target && (
          <div className={`card stage ${flash ? 'flash-good' : live.wrong ? 'flash-bad' : ''}`}>
            <div className="stage-main">
              <div className="chord-name">{chordLabel(target)}</div>
              <ChordDiagram
                chord={target}
                width={220}
                strings={settings.showHints ? live.strings : null}
                tone={flash ? 'good' : live.wrong ? 'bad' : 'idle'}
              />
            </div>
            <div className="stage-side">
              <div className={`listen ${live.signal ? 'on' : ''}`}>
                <div className={`ring ${flash ? 'ok' : live.wrong ? 'bad' : ''}`} style={{ ['--p' as string]: flash ? 1 : live.wrong ? 1 : live.progress }}>
                  <span>{flash ? '✓' : live.wrong ? '✗' : live.heard ? live.heard.chord.name : paused ? '⏸' : '…'}</span>
                </div>
                <div className={`status-line center ${flash ? 'good' : live.wrong ? 'bad' : 'muted'}`}>
                  {flash
                    ? `Nailed it · ${(flash.ms / 1000).toFixed(1)} s`
                    : paused
                      ? 'Paused'
                      : live.wrong
                        ? live.heard && live.heard.chord.pcMask !== target.pcMask
                          ? `Not quite. That sounded like ${chordLabel(live.heard.chord)}.`
                          : 'Not quite. Check the red strings and strum again.'
                        : live.signal
                          ? live.heard
                            ? `Hearing ${chordLabel(live.heard.chord)}`
                            : 'Hearing something…'
                          : 'Strum the chord'}
                </div>
              </div>
              <div className="row gap">
                <button className="btn ghost" onClick={() => setPaused((p) => !p)}>
                  {paused ? 'Resume' : 'Pause'}
                </button>
                <button className="btn ghost" onClick={() => goNext(target)}>
                  Skip
                </button>
              </div>
              <label className="check">
                <input type="checkbox" checked={settings.showHints} onChange={(e) => settingsStore.set({ showHints: e.target.checked })} />
                Show which strings I'm sounding
              </label>
            </div>
          </div>
        )}
      </MicGate>

      {log.length > 0 && (
        <div className="card">
          <div className="row between">
            <h3>This session</h3>
            <span className="muted small">
              {log.length} chords · avg {(avg / 1000).toFixed(1)} s
            </span>
          </div>
          <div className="row wrap gap" style={{ marginTop: 8 }}>
            {log.map((l, i) => (
              <span key={i} className="pill">
                {CHORDS.find((c) => c.id === l.id)?.name} <b>{(l.ms / 1000).toFixed(1)}s</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
