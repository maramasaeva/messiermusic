import { useCallback, useRef, useState } from 'react'
import { engine } from '../audio/engine'
import { IN_TUNE_CENTS, TunerLogic, type TunerReading } from '../audio/tuner'
import { playReferenceTone } from '../audio/tone'
import { MicGate } from '../components/MicGate'
import { useFrames } from '../hooks/useEngine'
import { settingsStore } from '../lib/settings'
import { useStore } from '../lib/store'
import { STANDARD_TUNING, STRING_LETTERS, STRING_NUMBERS, midiToFreq, midiToNameOctave } from '../music/notes'

const HOLD_MS = 800

function Gauge({ cents, active, inTune }: { cents: number; active: boolean; inTune: boolean }) {
  const c = Math.max(-50, Math.min(50, cents))
  const left = 50 + c
  return (
    <div className={`gauge ${inTune ? 'in-tune' : ''} ${active ? '' : 'idle'}`}>
      <div className="gauge-scale">
        {[-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map((t) => (
          <div key={t} className={`tick ${t === 0 ? 'centre' : ''} ${t % 50 === 0 ? 'major' : ''}`} style={{ left: `${50 + t}%` }}>
            {t % 25 === 0 || t === 0 ? <span>{t > 0 ? `+${t}` : t}</span> : null}
          </div>
        ))}
        <div className="sweet" style={{ left: `${50 - IN_TUNE_CENTS}%`, width: `${IN_TUNE_CENTS * 2}%` }} />
        <div className="needle" style={{ left: `${left}%` }} />
      </div>
    </div>
  )
}

export function TunerPage() {
  const settings = useStore(settingsStore)
  const logic = useRef(new TunerLogic())
  const [reading, setReading] = useState<TunerReading | null>(null)
  const [done, setDone] = useState<boolean[]>(Array(6).fill(false))

  const onFrame = useCallback(
    (f: Parameters<TunerLogic['update']>[0]) => {
      logic.current.a4 = settings.a4
      const r = logic.current.update(f)
      setReading(r)
      if (r) {
        setDone((d) => {
          if (r.inTune && r.inTuneMs >= HOLD_MS && !d[r.string]) {
            const n = [...d]
            n[r.string] = true
            return n
          }
          // a finished string that drifted out of tune becomes active again
          if (d[r.string] && r.stable && Math.abs(r.cents) > 8) {
            const n = [...d]
            n[r.string] = false
            return n
          }
          return d
        })
      }
    },
    [settings.a4],
  )
  useFrames('tuner', { pitch: true }, onFrame)

  const nextToTune = done.findIndex((d) => !d)
  const allDone = nextToTune === -1
  const cents = reading?.cents ?? 0
  const live = !!reading
  const inTune = !!reading?.inTune
  const stringIdx = reading?.string ?? Math.max(0, nextToTune)
  const midi = STANDARD_TUNING[stringIdx]

  let hint = 'Pluck an open string and let it ring.'
  if (allDone) hint = 'All six strings are in tune. Check again after a few chords; new strings drift.'
  else if (live) {
    if (inTune) hint = 'Perfect. Hold it…'
    else if (!reading!.stable) hint = 'Listening…'
    else hint = cents < 0 ? 'Too low. Tighten the string (turn the peg up).' : 'Too high. Loosen the string (turn the peg down).'
  } else if (nextToTune >= 0) {
    hint = `Pluck the ${ordinal(STRING_NUMBERS[nextToTune])} string (${STRING_LETTERS[nextToTune]}).`
  }

  const playRef = (s: number) => {
    const ctx = engine.ensureContext()
    playReferenceTone(ctx, midiToFreq(STANDARD_TUNING[s], settings.a4))
  }

  return (
    <MicGate why="The tuner listens to one string at a time and shows how many cents sharp or flat it is.">
      <div className="card tuner">
        <div className="tuner-readout">
          <div className={`note ${live ? '' : 'dim'} ${inTune ? 'good' : ''}`}>
            {live || nextToTune >= 0 ? STRING_LETTERS[stringIdx] : '✓'}
            <small>{live || nextToTune >= 0 ? midiToNameOctave(midi) : ''}</small>
          </div>
          <div className="tuner-numbers mono">
            <div className={`cents ${inTune ? 'good' : ''}`}>
              {live ? `${cents > 0 ? '+' : ''}${cents.toFixed(1)}` : '—'}
              <span>cents</span>
            </div>
            <div className="muted small">
              {live ? `${reading!.freq.toFixed(2)} Hz  →  ${reading!.targetFreq.toFixed(2)} Hz` : `A4 = ${settings.a4} Hz`}
            </div>
          </div>
        </div>

        <Gauge cents={cents} active={live} inTune={inTune} />
        <p className={`hint ${inTune ? 'good' : ''}`}>{hint}</p>

        <div className="strings">
          {STANDARD_TUNING.map((m, s) => (
            <button
              key={s}
              className={`string-pill ${done[s] ? 'done' : ''} ${reading?.string === s ? 'active' : ''} ${!allDone && s === nextToTune && !live ? 'next' : ''}`}
              onClick={() => playRef(s)}
              title={`Click to hear ${midiToNameOctave(m)}`}
            >
              <span className="n">{STRING_NUMBERS[s]}</span>
              <span className="l">{STRING_LETTERS[s]}</span>
              <span className="tick-mark">{done[s] ? '✓' : ''}</span>
            </button>
          ))}
        </div>
        <div className="row between">
          <span className="muted small">Tap a string to hear its reference pitch. Strings tick off automatically.</span>
          <button className="btn ghost" onClick={() => setDone(Array(6).fill(false))}>
            Reset
          </button>
        </div>
      </div>
    </MicGate>
  )
}

function ordinal(n: number): string {
  return ['', '1st', '2nd', '3rd', '4th', '5th', '6th'][n]
}
