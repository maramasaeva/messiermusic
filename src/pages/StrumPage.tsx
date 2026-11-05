import { useEffect, useMemo, useRef, useState } from 'react'
import { engine } from '../audio/engine'
import { ChordDiagram } from '../components/ChordDiagram'
import { MicGate } from '../components/MicGate'
import { ListenBadge } from '../components/ListenBadge'
import { useEngineStatus } from '../hooks/useEngine'
import { effectiveLatency, settingsStore } from '../lib/settings'
import { useStore } from '../lib/store'
import { PROGRESSIONS, chordLabel, progressionChords, type Chord } from '../music/chords'
import { PATTERNS, PATTERN_BY_ID, stepLabels, type StrumPattern } from '../music/strum'
import { hitWindow, type BarPlan, type StepState } from '../strum/judge'
import { StrumSession, type SessionConfig, type SessionView } from '../strum/session'

const SLACK = { strict: 0, normal: 0.125, forgiving: 0.25 } as const

interface Live {
  plan: BarPlan | null
  next: BarPlan | null
  step: number
  states: StepState[]
  extras: number
}

const LEVEL_LABEL = { 1: 'Starter', 2: 'Groove', 3: 'Challenge' } as const

export function StrumPage() {
  const settings = useStore(settingsStore)
  const status = useEngineStatus()
  const [session, setSession] = useState<StrumSession | null>(null)
  const [view, setView] = useState<SessionView | null>(null)
  const [live, setLive] = useState<Live>({ plan: null, next: null, step: -1, states: [], extras: 0 })
  const [showSetup, setShowSetup] = useState(true)
  const sessionRef = useRef<StrumSession | null>(null)

  const queue = useMemo(
    () =>
      PATTERNS.filter((p) => settings.strumPatterns.includes(p.id)).map((p) => PATTERN_BY_ID[p.id]),
    [settings.strumPatterns],
  )
  const progression: Chord[] | null = useMemo(() => {
    if (settings.strumProgression === 'none') return null
    const p = PROGRESSIONS.find((x) => x.id === settings.strumProgression)
    return p ? progressionChords(p) : null
  }, [settings.strumProgression])

  useEffect(
    () => () => {
      sessionRef.current?.stop()
    },
    [],
  )

  const start = () => {
    if (queue.length === 0) return
    sessionRef.current?.stop()
    const cfg: SessionConfig = {
      patterns: queue,
      progression,
      barsPerChord: settings.barsPerChord,
      startBpm: settings.startBpm,
      targetBpm: Math.max(settings.startBpm, settings.targetBpm),
      bpmStep: settings.bpmStep,
      barsToPass: settings.barsToPass,
      slack: SLACK[settings.strumTolerance],
      checkChords: settings.checkChords && !!progression,
      checkDirection: settings.checkDirection,
      autoSlow: settings.autoSlow,
      clickSubdivisions: settings.clickSubdivisions,
      volume: settings.clickVolume,
      chordSensitivity: settings.sensitivity,
      latency: effectiveLatency,
    }
    engine.want('strum', { chroma: cfg.checkChords })
    const s = new StrumSession(engine.ensureContext(), cfg)
    s.subscribe(setView)
    sessionRef.current = s
    setSession(s)
    setView(s.view)
    setShowSetup(false)
    s.start()
  }

  const stop = () => {
    sessionRef.current?.stop()
    engine.want('strum', null)
  }

  // animation loop for the playhead
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
      // a strum still missing once its window has closed (plus detector delay) shows red right away
      const judgedUntil = ctx.currentTime - effectiveLatency() - 0.12
      const states: StepState[] = bar
        ? bar.steps.map((st, i) =>
            st.state === 'pending' && current && judgedUntil > current.start + i * current.stepDur + hitWindow(current.stepDur)
              ? 'miss'
              : st.state,
          )
        : []
      setLive({
        plan: current,
        next,
        step: current ? Math.floor((t - current.start) / current.stepDur) : -1,
        states,
        extras: bar && current?.judged ? bar.extras : 0,
      })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [session])

  const running = view?.phase === 'running'
  const idlePattern = queue[0] ?? null
  const plan = live.plan
  const displayPattern: StrumPattern | null = running && plan && view?.pattern ? view.pattern : idlePattern
  const steps = plan && running ? plan.steps : (displayPattern?.steps ?? [])
  const labels = displayPattern ? stepLabels(displayPattern.beats, displayPattern.subdiv) : []
  const countIn = !!plan?.countIn && running
  const beat = displayPattern && live.step >= 0 ? Math.floor(live.step / displayPattern.subdiv) + 1 : 0
  const barChord = plan?.chord ?? null
  const nextChord = live.next?.chord ?? null

  const togglePattern = (id: string) => {
    const has = settings.strumPatterns.includes(id)
    const next = has ? settings.strumPatterns.filter((x) => x !== id) : [...settings.strumPatterns, id]
    settingsStore.set({ strumPatterns: next })
  }

  const levels = [1, 2, 3] as const

  return (
    <div className="stack">
      <MicGate why="Strum along with the click. Your strums are timed against the beat, so keep the sound clear of other noise.">
        <ListenBadge />
        <div className={`card strum-stage ${view?.tone ?? 'neutral'}`}>
          {view?.lastResult && view.lastResult.version === view.recent[view.recent.length - 1]?.version && (
            <div key={view.lastResult.index} className={`bar-flash ${view.lastResult.pass ? 'g' : 'r'}`} />
          )}
          <div className="row between wrap gap">
            <div>
              <div className="eyebrow">{running ? 'Now playing' : 'Up first'}</div>
              <h2 style={{ margin: 0 }}>{displayPattern?.name ?? 'Pick a pattern below'}</h2>
              {displayPattern && <div className="muted small">{displayPattern.blurb}</div>}
            </div>
            <div className="bpm-box">
              <div className="mono big-number sm">{running || view ? view?.bpm : settings.startBpm}</div>
              <div className="muted small">
                BPM{' '}
                {running && view && view.bpm < settings.targetBpm ? `→ ${settings.targetBpm}` : ''}
              </div>
            </div>
          </div>

          {displayPattern && (
            <div className="grid-wrap">
              <div
                className="step-grid"
                style={{ gridTemplateColumns: `repeat(${displayPattern.steps.length}, minmax(0, 1fr))` }}
              >
                {steps.map((s, i) => {
                  const st = countIn ? 'rest' : (live.states[i] ?? (s === '-' ? 'rest' : 'pending'))
                  const active = running && live.step === i
                  const beatStart = i % displayPattern.subdiv === 0
                  return (
                    <div
                      key={i}
                      className={`step ${st} ${active ? 'active' : ''} ${beatStart ? 'beat' : ''} ${s === '-' ? 'empty' : ''}`}
                    >
                      <div className="glyph">{s === 'D' ? '↓' : s === 'U' ? '↑' : '·'}</div>
                      <div className="count">{labels[i]}</div>
                    </div>
                  )
                })}
              </div>
              {countIn && <div className="countin">{beat > 0 ? beat : ''}</div>}
            </div>
          )}

          <div className="row between wrap gap center-items">
            <div className={`msg ${view?.tone ?? ''}`}>
              {view?.message ?? 'Choose patterns and a tempo, then press Start.'}
              {live.extras > 0 && running && (
                <span key={live.extras} className="extra-badge" style={{ marginLeft: 8 }}>
                  +{live.extras} extra strum
                </span>
              )}
            </div>
            <div className="row gap">
              {running && (
                <button className="btn ghost" onClick={() => session?.skipPattern()}>
                  Skip pattern
                </button>
              )}
              {running ? (
                <button className="btn danger" onClick={stop}>
                  Stop
                </button>
              ) : (
                <button className="btn primary big" onClick={start} disabled={queue.length === 0 || status !== 'running'}>
                  {view?.phase === 'done' ? 'Play again' : 'Start'}
                </button>
              )}
            </div>
          </div>

          {(barChord || progression) && (
            <div className="row gap center-items chords-strip">
              {(barChord ?? progression?.[0]) && (
                <div className="col center-items">
                  <div className="chord-name small">{chordLabel((barChord ?? progression![0])!)}</div>
                  <ChordDiagram chord={(barChord ?? progression![0])!} width={110} />
                </div>
              )}
              {nextChord && nextChord.id !== barChord?.id && (
                <>
                  <div className="arrow">→</div>
                  <div className="col center-items next-up">
                    <div className="chord-name small">{chordLabel(nextChord)}</div>
                    <ChordDiagram chord={nextChord} width={80} />
                  </div>
                </>
              )}
            </div>
          )}

          {view && (
            <div className="row between wrap gap center-items progress-row">
              <div className="streak" title="Clean bars in a row">
                {Array.from({ length: view.barsToPass }, (_, i) => (
                  <span key={i} className={`dot ${i < view.streak ? 'on' : ''}`} />
                ))}
                <span className="muted small">
                  {view.streak}/{view.barsToPass} clean bars to level up
                </span>
              </div>
              <div className="history">
                {view.recent.map((r) => (
                  <span
                    key={r.index}
                    className={`pip ${r.version !== view.recent[view.recent.length - 1].version ? 'old' : ''} ${r.pass ? 'pass' : 'fail'}`}
                    title={`${r.hits}/${r.expected} hits, ${r.extras} extra${r.meanDeltaMs !== null ? `, ${r.meanDeltaMs > 0 ? '+' : ''}${Math.round(r.meanDeltaMs)} ms` : ''}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </MicGate>

      <div className="card">
        <div className="row between">
          <h3>Setup</h3>
          <button className="btn ghost" onClick={() => setShowSetup((s) => !s)}>
            {showSetup ? 'Hide' : 'Show'}
          </button>
        </div>
        {showSetup && (
          <div className="stack" style={{ marginTop: 12 }}>
            <div>
              <div className="label">Patterns (played in this order; clear one to unlock the next)</div>
              {levels.map((lv) => (
                <div key={lv} className="row wrap gap" style={{ marginBottom: 6 }}>
                  <span className="muted small level-tag">{LEVEL_LABEL[lv]}</span>
                  {PATTERNS.filter((p) => p.level === lv).map((p) => (
                    <button
                      key={p.id}
                      className={`chip ${settings.strumPatterns.includes(p.id) ? 'on' : ''}`}
                      onClick={() => togglePattern(p.id)}
                      title={p.blurb}
                    >
                      {p.name}
                      <span className="chip-pat mono">{p.steps.map((s) => (s === 'D' ? '↓' : s === 'U' ? '↑' : '·')).join('')}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="row wrap gap">
              <label className="field">
                <span>Chords</span>
                <select value={settings.strumProgression} onChange={(e) => settingsStore.set({ strumProgression: e.target.value })}>
                  <option value="none">Rhythm only (any sound)</option>
                  {PROGRESSIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Bars per chord</span>
                <select value={settings.barsPerChord} onChange={(e) => settingsStore.set({ barsPerChord: Number(e.target.value) })}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                </select>
              </label>
              <label className="field">
                <span>Start BPM</span>
                <input type="number" min={40} max={200} value={settings.startBpm} onChange={(e) => settingsStore.set({ startBpm: clamp(Number(e.target.value), 40, 200) })} />
              </label>
              <label className="field">
                <span>Target BPM</span>
                <input type="number" min={40} max={220} value={settings.targetBpm} onChange={(e) => settingsStore.set({ targetBpm: clamp(Number(e.target.value), 40, 220) })} />
              </label>
              <label className="field">
                <span>Speed-up step</span>
                <input type="number" min={1} max={20} value={settings.bpmStep} onChange={(e) => settingsStore.set({ bpmStep: clamp(Number(e.target.value), 1, 20) })} />
              </label>
              <label className="field">
                <span>Clean bars to pass</span>
                <select value={settings.barsToPass} onChange={(e) => settingsStore.set({ barsToPass: Number(e.target.value) })}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Strictness</span>
                <select value={settings.strumTolerance} onChange={(e) => settingsStore.set({ strumTolerance: e.target.value as typeof settings.strumTolerance })}>
                  <option value="forgiving">Forgiving</option>
                  <option value="normal">Normal</option>
                  <option value="strict">Strict (no slips)</option>
                </select>
              </label>
            </div>
            <div className="row wrap gap">
              <label className="check">
                <input type="checkbox" checked={settings.checkChords} onChange={(e) => settingsStore.set({ checkChords: e.target.checked })} />
                Check the chord too (when chords are selected)
              </label>
              <label className="check">
                <input type="checkbox" checked={settings.clickSubdivisions} onChange={(e) => settingsStore.set({ clickSubdivisions: e.target.checked })} />
                Tick the off-beats
              </label>
              <label className="check">
                <input type="checkbox" checked={settings.autoSlow} onChange={(e) => settingsStore.set({ autoSlow: e.target.checked })} />
                Slow down automatically if I struggle
              </label>
              <label className="check" title="Experimental: guesses up vs down from how bass-heavy each strum is">
                <input type="checkbox" checked={settings.checkDirection} onChange={(e) => settingsStore.set({ checkDirection: e.target.checked })} />
                Check up/down direction (experimental)
              </label>
            </div>
            <p className="muted small">
              Tempo changes land on the bar line. If hits feel consistently early or late, adjust <b>Timing offset</b> in Settings (⚙).
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo))
}
