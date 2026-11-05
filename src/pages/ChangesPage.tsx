import { useCallback, useEffect, useRef, useState } from 'react'
import { ChordDiagram } from '../components/ChordDiagram'
import { MicGate } from '../components/MicGate'
import { ListenBadge } from '../components/ListenBadge'
import { useChordListener } from '../hooks/useChordListener'
import { useEngineStatus } from '../hooks/useEngine'
import { settingsStore, statsStore } from '../lib/settings'
import { useStore } from '../lib/store'
import { CHORDS, CHORD_BY_ID, PROGRESSIONS, chordByName, chordLabel, type Chord } from '../music/chords'

const ROUND_SECONDS = 60

function resolve(id: string): Chord | null {
  return CHORD_BY_ID[id] ?? CHORDS.find((c) => c.name === id) ?? null
}

type Phase = 'ready' | 'running' | 'finished'

export function ChangesPage() {
  const settings = useStore(settingsStore)
  const stats = useStore(statsStore)
  const status = useEngineStatus()

  const custom = settings.changesProgression === 'custom'
  const seq: Chord[] = (
    custom
      ? settings.changesCustom.map(resolve)
      : (PROGRESSIONS.find((p) => p.id === settings.changesProgression)?.chords ?? ['G', 'C']).map(resolve)
  ).filter((c): c is Chord => !!c)
  const safeSeq = seq.length >= 2 ? seq : [chordByName('G'), chordByName('C')]
  const seqKey = safeSeq.map((c) => c.id).join(' > ')

  const [phase, setPhase] = useState<Phase>('ready')
  const [idx, setIdx] = useState(0)
  const [times, setTimes] = useState<number[]>([])
  const [remaining, setRemaining] = useState(ROUND_SECONDS)
  const [result, setResult] = useState<{ changes: number; avgMs: number; best: boolean } | null>(null)
  const lastAt = useRef<number | null>(null)
  const startedAt = useRef<number | null>(null)
  const [flash, setFlash] = useState(false)
  const timesRef = useRef<number[]>([])

  const reset = useCallback(() => {
    setPhase('ready')
    setIdx(0)
    setTimes([])
    timesRef.current = []
    setRemaining(ROUND_SECONDS)
    setResult(null)
    lastAt.current = null
    startedAt.current = null
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reset()
  }, [seqKey, settings.changesTimer, reset])

  const finish = useCallback(
    (all: number[]) => {
      const changes = all.length
      const avg = changes ? all.reduce((a, b) => a + b, 0) / changes : 0
      const prevBest = statsStore.get().bestChangesPerMin[seqKey] ?? 0
      const best = changes > prevBest
      if (best) statsStore.set({ bestChangesPerMin: { ...statsStore.get().bestChangesPerMin, [seqKey]: changes } })
      setResult({ changes, avgMs: avg, best })
      setPhase('finished')
    },
    [seqKey],
  )

  // countdown
  useEffect(() => {
    if (phase !== 'running' || !settings.changesTimer) return
    const id = window.setInterval(() => {
      if (!startedAt.current) return
      const left = ROUND_SECONDS - (performance.now() - startedAt.current) / 1000
      if (left <= 0) {
        setRemaining(0)
        window.clearInterval(id)
        finish(timesRef.current)
      } else setRemaining(left)
    }, 100)
    return () => window.clearInterval(id)
  }, [phase, settings.changesTimer, finish])

  const target = safeSeq[idx % safeSeq.length]
  const upcoming = safeSeq[(idx + 1) % safeSeq.length]

  const onMatch = useCallback(() => {
    const now = performance.now()
    if (phase === 'ready') {
      setPhase('running')
      startedAt.current = now
      lastAt.current = now
    } else if (lastAt.current !== null) {
      const dt = now - lastAt.current
      lastAt.current = now
      timesRef.current = [...timesRef.current, dt]
      setTimes(timesRef.current)
    }
    setIdx((i) => i + 1)
    setFlash(true)
    window.setTimeout(() => setFlash(false), 450)
  }, [phase])

  const live = useChordListener({
    target,
    enabled: status === 'running' && phase !== 'finished',
    sensitivity: settings.sensitivity,
    a4: settings.a4,
    resetKey: phase,
    onMatch,
  })

  const changes = times.length
  const avg = changes ? times.reduce((a, b) => a + b, 0) / changes : 0
  const best = stats.bestChangesPerMin[seqKey]

  const setCustomSlot = (slot: number, id: string) => {
    const next = [...settings.changesCustom]
    if (id === '') next.splice(slot, 1)
    else next[slot] = id
    settingsStore.set({ changesCustom: next.filter(Boolean).slice(0, 4) })
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="row wrap gap">
          <label className="field">
            <span>Drill</span>
            <select
              value={settings.changesProgression}
              onChange={(e) => settingsStore.set({ changesProgression: e.target.value })}
            >
              {PROGRESSIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>
          {custom &&
            [0, 1, 2, 3].map((slot) => (
              <label className="field" key={slot}>
                <span>Chord {slot + 1}</span>
                <select value={settings.changesCustom[slot] ?? ''} onChange={(e) => setCustomSlot(slot, e.target.value)}>
                  <option value="">{slot < 2 ? '—' : 'none'}</option>
                  {CHORDS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {chordLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          <span className="spacer" />
          <div className="seg">
            <button className={settings.changesTimer ? 'on' : ''} onClick={() => settingsStore.set({ changesTimer: true })}>
              60 s challenge
            </button>
            <button className={!settings.changesTimer ? 'on' : ''} onClick={() => settingsStore.set({ changesTimer: false })}>
              Free play
            </button>
          </div>
        </div>
        {custom && settings.changesCustom.length < 2 && <p className="error small">Pick at least two chords.</p>}
      </div>

      <MicGate why="Switch between the chords as fast as you can. Each clean change is counted automatically.">
        <ListenBadge />
        {phase === 'finished' && result ? (
          <div className="card center result">
            <h2>{result.best ? '🔥 New personal best!' : 'Round complete'}</h2>
            <div className="big-number">{result.changes}</div>
            <div className="muted">clean changes in {ROUND_SECONDS} s</div>
            <p className="muted small">
              Average change {(result.avgMs / 1000).toFixed(2)} s{best ? ` · best ${best}` : ''}
            </p>
            <button className="btn primary" onClick={reset}>
              Go again
            </button>
          </div>
        ) : (
          <div className={`card stage ${flash ? 'flash-good' : live.wrong ? 'flash-bad' : ''}`}>
            <div className="stage-main">
              <div className="row gap center-items">
                <div className="col center-items">
                  <div className="chord-name">{chordLabel(target)}</div>
                  <ChordDiagram
                    chord={target}
                    width={200}
                    strings={settings.showHints ? live.strings : null}
                    tone={flash ? 'good' : live.wrong ? 'bad' : 'idle'}
                  />
                </div>
                <div className="arrow">→</div>
                <div className="col center-items next-up">
                  <div className="muted small">then</div>
                  <div className="chord-name small">{chordLabel(upcoming)}</div>
                  <ChordDiagram chord={upcoming} width={96} />
                </div>
              </div>
            </div>
            <div className="stage-side">
              <div className={`ring ${flash ? 'ok' : live.wrong ? 'bad' : ''}`} style={{ ['--p' as string]: flash || live.wrong ? 1 : live.progress }}>
                <span>{flash ? '✓' : live.wrong ? '✗' : live.heard ? live.heard.chord.name : '…'}</span>
              </div>
              <div className={`status-line center ${flash ? 'good' : live.wrong ? 'bad' : 'muted'}`}>
                {flash
                  ? 'Clean change!'
                  : live.wrong
                    ? live.heard && live.heard.chord.pcMask !== target.pcMask
                      ? `Not quite. That sounded like ${chordLabel(live.heard.chord)}.`
                      : 'Not quite. Check the red strings.'
                    : live.signal
                      ? live.heard
                        ? `Hearing ${chordLabel(live.heard.chord)}`
                        : 'Hearing something…'
                      : 'Strum the chord'}
              </div>
              {phase === 'ready' ? (
                <p className="muted small center">The clock starts when you play the first chord.</p>
              ) : (
                <div className="stats-grid">
                  {settings.changesTimer && (
                    <div>
                      <b className="mono">{Math.ceil(remaining)}</b>
                      <span>sec left</span>
                    </div>
                  )}
                  <div>
                    <b className="mono">{changes}</b>
                    <span>changes</span>
                  </div>
                  <div>
                    <b className="mono">{avg ? (avg / 1000).toFixed(2) : '–'}</b>
                    <span>avg s</span>
                  </div>
                  <div>
                    <b className="mono">{best ?? '–'}</b>
                    <span>best / min</span>
                  </div>
                </div>
              )}
              <div className="row gap">
                <button className="btn ghost" onClick={reset}>
                  Restart
                </button>
              </div>
            </div>
          </div>
        )}
      </MicGate>

      {times.length > 0 && phase !== 'finished' && (
        <div className="card">
          <h3>Change times</h3>
          <div className="bars">
            {times.slice(-24).map((t, i) => (
              <div key={i} className="bar-col" title={`${(t / 1000).toFixed(2)} s`}>
                <div className="bar-fill" style={{ height: `${Math.min(100, (t / 6000) * 100)}%` }} />
              </div>
            ))}
          </div>
          <p className="muted small">Shorter bars are faster. Aim for a steady downward trend.</p>
        </div>
      )}
    </div>
  )
}
