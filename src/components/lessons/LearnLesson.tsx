import { useCallback, useEffect, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import { useChordListener } from '../../hooks/useChordListener'
import { useEngineStatus } from '../../hooks/useEngine'
import { settingsStore } from '../../lib/settings'
import { useStore } from '../../lib/store'
import { resolveChord, type LearnLesson as Learn } from '../../music/courses'
import { chordLabel } from '../../music/chords'
import { ChordDiagram } from '../ChordDiagram'

/** True once the strings have been quiet for a moment, so a ringing chord can't count twice. */
function useQuiet(active: boolean): boolean {
  const [quiet, setQuiet] = useState(false)
  useEffect(() => {
    if (!active) return
    let since: number | null = null
    const id = window.setInterval(() => {
      const now = performance.now()
      if (engine.signal) {
        since = null
        setQuiet(false)
      } else {
        since ??= now
        if (now - since >= 450) setQuiet(true)
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [active])
  return active && quiet
}

export function LearnLessonView({ lesson, onDone }: { lesson: Learn; onDone: (stars: number) => void }) {
  const settings = useStore(settingsStore)
  const status = useEngineStatus()
  const chord = resolveChord(lesson.chord)
  const [count, setCount] = useState(0)
  const [waitQuiet, setWaitQuiet] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const [flash, setFlash] = useState(false)
  const finished = count >= lesson.plays
  const quiet = useQuiet(waitQuiet && !finished)
  const reported = useRef(false)

  useEffect(() => {
    if (waitQuiet && quiet) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWaitQuiet(false)
      setEpoch((e) => e + 1)
    }
  }, [waitQuiet, quiet])

  const onMatch = useCallback(() => {
    setFlash(true)
    window.setTimeout(() => setFlash(false), 500)
    setCount((c) => c + 1)
    setWaitQuiet(true)
  }, [])

  const live = useChordListener({
    target: chord,
    enabled: status === 'running' && !finished,
    sensitivity: settings.sensitivity,
    a4: settings.a4,
    resetKey: epoch,
    onMatch,
  })

  useEffect(() => {
    if (finished && !reported.current) {
      reported.current = true
      const t = window.setTimeout(() => onDone(3), 900)
      return () => window.clearTimeout(t)
    }
  }, [finished, onDone])

  const tone = flash ? 'good' : !waitQuiet && live.wrong ? 'bad' : 'idle'
  const status_ = finished
    ? 'Learned!'
    : flash
      ? 'Clean!'
      : waitQuiet
        ? 'Now mute the strings (or let it ring out) before the next one.'
        : live.wrong
          ? live.heard && live.heard.chord.pcMask !== chord.pcMask
            ? `Not quite. That sounded like ${chordLabel(live.heard.chord)}.`
            : 'Not quite. Check the red strings.'
          : live.signal
            ? 'Hearing you…'
            : 'Strum the chord'

  return (
    <div className={`stage practice-stage ${flash ? 'flash-good' : tone === 'bad' ? 'flash-bad' : ''}`}>
      <div className="stage-main">
        <div className="row gap center-items wrap">
          <div className="col center-items">
            <div className="chord-name">{chordLabel(chord)}</div>
            <ChordDiagram chord={chord} width={190} strings={settings.showHints ? live.strings : null} tone={tone} />
          </div>
          <ol className="tips">
            {lesson.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </div>
      </div>
      <div className="stage-side">
        <div className={`ring ${flash || finished ? 'ok' : tone === 'bad' ? 'bad' : ''}`} style={{ ['--p' as string]: flash || finished || tone === 'bad' ? 1 : live.progress }}>
          <span>{finished || flash ? '✓' : tone === 'bad' ? '✗' : '…'}</span>
        </div>
        <div className={`status-line center ${flash || finished ? 'good' : tone === 'bad' ? 'bad' : 'muted'}`}>{status_}</div>
        <div className="dots center" aria-label={`${count} of ${lesson.plays} clean plays`}>
          {Array.from({ length: lesson.plays }, (_, i) => (
            <span key={i} className={`dot ${i < count ? 'on' : ''}`} />
          ))}
          <span className="muted small">
            {Math.min(count, lesson.plays)}/{lesson.plays} clean plays
          </span>
        </div>
        <button className="btn ghost small" onClick={() => onDone(1)} disabled={finished}>
          I know this one: skip
        </button>
      </div>
    </div>
  )
}
