import { useEffect, useMemo, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import { useEngineStatus } from '../../hooks/useEngine'
import { effectiveLatency, settingsStore } from '../../lib/settings'
import { useStore } from '../../lib/store'
import { chordLabel, type Chord } from '../../music/chords'
import { resolveChord } from '../../music/courses'
import { PATTERN_BY_ID, stepLabels } from '../../music/strum'
import { hitWindow, type BarPlan, type StepState } from '../../strum/judge'
import { StrumSession, type SessionConfig, type SessionView } from '../../strum/session'
import { ChordDiagram } from '../ChordDiagram'

const SLACK = { strict: 0, normal: 0.125, forgiving: 0.25 } as const

interface Live {
  plan: BarPlan | null
  next: BarPlan | null
  step: number
  states: StepState[]
}

export function StrumLessonView({
  patterns,
  chords: chordIds,
  barsPerChord,
  bpm,
  bars,
  onResult,
  onNext,
  nextLabel,
}: {
  patterns: string[]
  chords: string[]
  barsPerChord: number
  bpm: number
  bars: number
  onResult: (stars: number) => void
  onNext: (() => void) | null
  nextLabel: string
}) {
  const settings = useStore(settingsStore)
  const status = useEngineStatus()
  const [view, setView] = useState<SessionView | null>(null)
  const [session, setSession] = useState<StrumSession | null>(null)
  const [live, setLive] = useState<Live>({ plan: null, next: null, step: -1, states: [] })
  const [counts, setCounts] = useState({ bars: 0, fails: 0 })
  const sessionRef = useRef<StrumSession | null>(null)
  const seen = useRef(new Set<number>())
  const reported = useRef(false)

  const progression: Chord[] = useMemo(() => chordIds.map(resolveChord), [chordIds])
  const queue = useMemo(() => patterns.map((id) => PATTERN_BY_ID[id]).filter(Boolean), [patterns])

  useEffect(
    () => () => {
      sessionRef.current?.stop()
      engine.want('lesson-strum', null)
    },
    [],
  )

  const start = () => {
    sessionRef.current?.stop()
    seen.current = new Set()
    reported.current = false
    setCounts({ bars: 0, fails: 0 })
    const cfg: SessionConfig = {
      patterns: queue,
      progression,
      barsPerChord,
      startBpm: bpm,
      targetBpm: bpm,
      bpmStep: 5,
      barsToPass: bars,
      slack: SLACK[settings.strumTolerance],
      checkChords: true,
      checkDirection: false,
      autoSlow: true,
      clickSubdivisions: settings.clickSubdivisions,
      volume: settings.clickVolume,
      chordSensitivity: settings.sensitivity,
      latency: effectiveLatency,
    }
    engine.want('lesson-strum', { chroma: true })
    const s = new StrumSession(engine.ensureContext(), cfg)
    s.subscribe((v) => {
      setView(v)
      const r = v.lastResult
      if (r && r.version === v.recent[v.recent.length - 1]?.version && !seen.current.has(r.index)) {
        seen.current.add(r.index)
        setCounts((c) => ({ bars: c.bars + 1, fails: c.fails + (r.pass ? 0 : 1) }))
      }
    })
    sessionRef.current = s
    setSession(s)
    setView(s.view)
    s.start()
  }

  useEffect(() => {
    if (view?.phase === 'done' && !reported.current) {
      reported.current = true
      engine.want('lesson-strum', null)
      onResult(counts.fails === 0 ? 3 : counts.fails <= 2 ? 2 : 1)
    }
  }, [view?.phase, counts.fails, onResult])

  useEffect(() => {
    if (!session) return
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < 33) return
      last = now
      const ctx = session.ctx
      const t = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0)
      const { current, next } = session.planAt(t)
      const bar = current ? session.judge.getBar(current.index) : undefined
      const judgedUntil = ctx.currentTime - effectiveLatency() - 0.12
      const states: StepState[] = bar
        ? bar.steps.map((st, i) =>
            st.state === 'pending' && current && judgedUntil > current.start + i * current.stepDur + hitWindow(current.stepDur)
              ? 'miss'
              : st.state,
          )
        : []
      setLive({ plan: current, next, step: current ? Math.floor((t - current.start) / current.stepDur) : -1, states })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [session])

  const running = view?.phase === 'running'
  const done = view?.phase === 'done'
  const pattern = running && view?.pattern ? view.pattern : queue[0]
  const plan = live.plan
  const steps = plan && running ? plan.steps : (pattern?.steps ?? [])
  const labels = pattern ? stepLabels(pattern.beats, pattern.subdiv) : []
  const countIn = !!plan?.countIn && running
  const barChord = plan?.chord ?? progression[0]
  const nextChord = live.next?.chord ?? null

  if (done) {
    const stars = counts.fails === 0 ? 3 : counts.fails <= 2 ? 2 : 1
    return (
      <div className="center stack">
        <h2 style={{ margin: 0 }}>Nicely done!</h2>
        <div className="stars">
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= stars ? 'on' : ''}>
              ★
            </span>
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {counts.bars - counts.fails} clean bars out of {counts.bars}.
        </p>
        <div className="row gap" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={start}>
            Try for more stars
          </button>
          {onNext && (
            <button className="btn primary" onClick={onNext}>
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`strum-stage lesson-strum ${view?.tone ?? 'neutral'}`}>
      <div className="row between wrap gap">
        <div>
          <div className="eyebrow">{running ? 'Now playing' : 'Up first'}</div>
          <h3 style={{ margin: 0 }}>{pattern?.name}</h3>
          <div className="muted small">{pattern?.blurb}</div>
        </div>
        <div className="bpm-box">
          <div className="mono big-number sm">{view?.bpm ?? bpm}</div>
          <div className="muted small">BPM</div>
        </div>
      </div>
      {pattern && (
        <div className="grid-wrap">
          <div className="step-grid" style={{ gridTemplateColumns: `repeat(${pattern.steps.length}, minmax(0, 1fr))` }}>
            {steps.map((s, i) => {
              const st = countIn ? 'rest' : (live.states[i] ?? (s === '-' ? 'rest' : 'pending'))
              const active = running && live.step === i
              return (
                <div key={i} className={`step ${st} ${active ? 'active' : ''} ${i % pattern.subdiv === 0 ? 'beat' : ''} ${s === '-' ? 'empty' : ''}`}>
                  <div className="glyph">{s === 'D' ? '↓' : s === 'U' ? '↑' : '·'}</div>
                  <div className="count">{labels[i]}</div>
                </div>
              )
            })}
          </div>
          {countIn && <div className="countin">{live.step >= 0 ? Math.floor(live.step / pattern.subdiv) + 1 : ''}</div>}
        </div>
      )}
      <div className="row gap center-items chords-strip">
        <div className="col center-items">
          <div className="chord-name small">{chordLabel(barChord)}</div>
          <ChordDiagram chord={barChord} width={110} />
        </div>
        {nextChord && nextChord.id !== barChord.id && (
          <>
            <div className="arrow">→</div>
            <div className="col center-items next-up">
              <div className="chord-name small">{chordLabel(nextChord)}</div>
              <ChordDiagram chord={nextChord} width={80} />
            </div>
          </>
        )}
      </div>
      <div className="row between wrap gap center-items">
        <div className={`msg ${view?.tone ?? ''}`}>{view?.message ?? `Strum along with the click. Get ${bars} clean bars in a row${queue.length > 1 ? ' on each pattern' : ''}.`}</div>
        <div className="row gap">
          {running ? (
            <button className="btn danger" onClick={() => sessionRef.current?.stop()}>
              Stop
            </button>
          ) : (
            <button className="btn primary big" onClick={start} disabled={status !== 'running'}>
              Start
            </button>
          )}
        </div>
      </div>
      {view && (
        <div className="streak" title="Clean bars in a row">
          {Array.from({ length: view.barsToPass }, (_, i) => (
            <span key={i} className={`dot ${i < view.streak ? 'on' : ''}`} />
          ))}
          <span className="muted small">
            {view.streak}/{view.barsToPass} clean bars in a row
          </span>
        </div>
      )}
    </div>
  )
}
