import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChordListener } from '../../hooks/useChordListener'
import { useEngineStatus } from '../../hooks/useEngine'
import { settingsStore } from '../../lib/settings'
import { useStore } from '../../lib/store'
import { chordLabel } from '../../music/chords'
import { drillLimit, resolveChord, starsFor } from '../../music/courses'
import { ChordDiagram } from '../ChordDiagram'

type Phase = 'ready' | 'running' | 'result'

export function DrillLessonView({
  sequence,
  secPerChord,
  onResult,
  onRetry,
  onNext,
  nextLabel,
}: {
  sequence: string[]
  secPerChord: number
  /** Called once with the result of this attempt. */
  onResult: (stars: number, sec: number) => void
  onRetry: () => void
  onNext: (() => void) | null
  nextLabel: string
}) {
  const settings = useStore(settingsStore)
  const status = useEngineStatus()
  const chords = useMemo(() => sequence.map(resolveChord), [sequence])
  const limit = drillLimit(chords.length, secPerChord)
  const [phase, setPhase] = useState<Phase>('ready')
  const [idx, setIdx] = useState(0)
  const [remaining, setRemaining] = useState(limit)
  const [result, setResult] = useState<{ stars: number; sec: number } | null>(null)
  const [flash, setFlash] = useState(false)
  const startedAt = useRef<number | null>(null)
  const done = useRef(false)

  const finish = useCallback(
    (sec: number, completed: boolean) => {
      if (done.current) return
      done.current = true
      const stars = completed ? starsFor(sec, limit) : 0
      setResult({ stars, sec })
      setPhase('result')
      onResult(stars, sec)
    },
    [limit, onResult],
  )

  // the clock only runs after your first chord
  useEffect(() => {
    if (phase !== 'running') return
    const id = window.setInterval(() => {
      if (startedAt.current === null) return
      const elapsed = (performance.now() - startedAt.current) / 1000
      const left = limit - elapsed
      setRemaining(Math.max(0, left))
      if (left <= 0) finish(elapsed, false)
    }, 100)
    return () => window.clearInterval(id)
  }, [phase, limit, finish])

  const onMatch = useCallback(() => {
    const now = performance.now()
    setFlash(true)
    window.setTimeout(() => setFlash(false), 400)
    if (startedAt.current === null) {
      startedAt.current = now
      setPhase('running')
    }
    setIdx((i) => {
      const n = i + 1
      if (n >= chords.length) finish((now - (startedAt.current ?? now)) / 1000, true)
      return n
    })
  }, [chords.length, finish])

  const target = idx < chords.length ? chords[idx] : null
  const live = useChordListener({
    target,
    enabled: status === 'running' && phase !== 'result' && !!target,
    sensitivity: settings.sensitivity,
    a4: settings.a4,
    resetKey: idx,
    onMatch,
  })

  if (phase === 'result' && result) {
    const ok = result.stars > 0
    return (
      <div className="center stack">
        <h2 style={{ margin: 0 }}>{ok ? 'Nicely done!' : 'Out of time'}</h2>
        {ok ? (
          <div className="stars" aria-label={`${result.stars} of 3 stars`}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= result.stars ? 'on' : ''}>
                ★
              </span>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            You got to chord {Math.min(idx, chords.length)} of {chords.length}. A bit more speed and you're there.
          </p>
        )}
        {ok && (
          <p className="muted" style={{ margin: 0 }}>
            {result.sec.toFixed(1)} s for {chords.length - 1} changes. The limit was {limit.toFixed(0)} s; for three stars, aim for {(limit * 0.45).toFixed(0)} s.
          </p>
        )}
        <div className="row gap" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={onRetry}>
            {ok ? 'Try for more stars' : 'Try again'}
          </button>
          {ok && onNext && (
            <button className="btn primary" onClick={onNext}>
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    )
  }

  const next = chords[idx + 1]
  const bad = live.wrong
  return (
    <div className="stack">
      <div className="seq-row" aria-label="Chord sequence">
        {chords.map((c, i) => (
          <span key={i} className={`seq-chip ${i < idx ? 'done' : i === idx ? 'now' : i === idx + 1 ? 'next' : ''}`}>
            {c.name}
          </span>
        ))}
      </div>
      <div className={`stage practice-stage ${flash ? 'flash-good' : bad ? 'flash-bad' : ''}`}>
        <div className="stage-main">
          <div className="row gap center-items">
            <div className="col center-items">
              <div className="chord-name">{target ? chordLabel(target) : ''}</div>
              {target && <ChordDiagram chord={target} width={180} strings={settings.showHints ? live.strings : null} tone={flash ? 'good' : bad ? 'bad' : 'idle'} />}
            </div>
            {next && (
              <>
                <div className="arrow">→</div>
                <div className="col center-items next-up">
                  <div className="muted small">then</div>
                  <div className="chord-name small">{chordLabel(next)}</div>
                  <ChordDiagram chord={next} width={84} />
                </div>
              </>
            )}
          </div>
        </div>
        <div className="stage-side">
          <div className={`ring ${flash ? 'ok' : bad ? 'bad' : ''}`} style={{ ['--p' as string]: flash || bad ? 1 : live.progress }}>
            <span>{flash ? '✓' : bad ? '✗' : (live.heard?.chord.name ?? '…')}</span>
          </div>
          <div className={`status-line center ${flash ? 'good' : bad ? 'bad' : 'muted'}`}>
            {phase === 'ready'
              ? 'The clock starts when you play the first chord.'
              : bad
                ? live.heard && target && live.heard.chord.pcMask !== target.pcMask
                  ? `Not quite. That sounded like ${chordLabel(live.heard.chord)}.`
                  : 'Not quite. Check the red strings.'
                : 'Keep going!'}
          </div>
          <div className="stats-grid">
            <div>
              <b className="mono">{phase === 'ready' ? limit.toFixed(0) : Math.ceil(remaining)}</b>
              <span>sec left</span>
            </div>
            <div>
              <b className="mono">
                {Math.min(idx, chords.length)}/{chords.length}
              </b>
              <span>chords</span>
            </div>
          </div>
          {phase === 'running' && (
            <div className="timebar" aria-hidden>
              <div style={{ width: `${Math.max(0, Math.min(100, (remaining / limit) * 100))}%` }} />
            </div>
          )}
          <button className="btn ghost small" onClick={onRetry}>
            Restart
          </button>
        </div>
      </div>
    </div>
  )
}
