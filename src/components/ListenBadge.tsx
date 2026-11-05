import { useEffect, useRef, useState } from 'react'
import { engine } from '../audio/engine'
import { useEngineStatus } from '../hooks/useEngine'
import { settingsStore } from '../lib/settings'

interface Problem {
  text: string
  action?: { label: string; run: () => void }
}

function diagnose(hearing: boolean): Problem | null {
  const d = engine.diagnostics()
  if (d.ctxState !== 'running') {
    return {
      text: `The browser has paused audio (${d.ctxState}).`,
      action: { label: 'Resume audio', run: () => void engine.resumeAudio() },
    }
  }
  if (!d.trackLive) return { text: 'The microphone stream has ended. Turn the mic off and on again.' }
  if (d.trackMuted) return { text: `"${d.device || 'This mic'}" is muted by the system or browser. Unmute it, or pick another mic in Settings (⚙).` }
  if (!d.blocksFlowing) {
    return { text: `No audio is arriving from "${d.device || 'the mic'}". Pick a different microphone in Settings (⚙).` }
  }
  if (!hearing && d.peakDb < -85) {
    return {
      text: `"${d.device || 'The mic'}" is sending pure silence. Check the system input volume / mute switch, or choose another mic in Settings (⚙).`,
    }
  }
  if (!hearing && d.peakDb < -50) {
    return {
      text: `Very quiet input (${Math.round(d.peakDb)} dB). Move the guitar closer, raise the system input volume, or turn up "Mic boost" in Settings (⚙).`,
      action: { label: 'Boost ×4', run: () => settingsStore.set({ micGain: 4 }) },
    }
  }
  return null
}

/**
 * Always-visible proof that the app is hearing you: a live level bar,
 * a "hearing you / silent" label, a pulse for every detected strum or pluck,
 * and, when something is wrong, a plain-language diagnosis.
 */
export function ListenBadge() {
  const status = useEngineStatus()
  const bar = useRef<HTMLDivElement>(null)
  const db = useRef<HTMLSpanElement>(null)
  const [hearing, setHearing] = useState(false)
  const [pulse, setPulse] = useState(0)
  const [problem, setProblem] = useState<Problem | null>(null)

  useEffect(() => {
    if (status !== 'running') return
    let raf = 0
    let shown = 0
    let last = false
    let lastCheck = 0
    const began = performance.now()
    const loop = (now: number) => {
      const target = Math.max(0, Math.min(1, (engine.levelDb + 70) / 55))
      shown = target > shown ? target : shown * 0.88 + target * 0.12
      if (bar.current) bar.current.style.width = `${shown * 100}%`
      const h = engine.signal
      if (h !== last) {
        last = h
        setHearing(h)
      }
      if (now - lastCheck > 400) {
        lastCheck = now
        if (db.current) {
          const d = engine.diagnostics()
          db.current.textContent = d.peakDb > -119 ? `${Math.round(d.peakDb)} dB` : ''
        }
        // only nag after the mic has had a moment to warm up
        const p = now - began < 2500 ? null : diagnose(h)
        setProblem((prev) => (prev?.text === p?.text ? prev : p))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const off = engine.onOnset(() => setPulse((p) => p + 1))
    return () => {
      cancelAnimationFrame(raf)
      off()
    }
  }, [status])

  if (status !== 'running') return null
  return (
    <div className="listen-wrap">
      <div className={`listen-badge ${hearing ? 'on' : ''}`}>
        <span key={pulse} className={`ear-dot ${pulse ? 'pulse' : ''}`} />
        <div className="lb-meter">
          <div ref={bar} className="lb-bar" />
        </div>
        <span className="lb-text">{hearing ? 'Hearing you' : 'Silent — play something'}</span>
        <span ref={db} className="mono small muted lb-db" />
      </div>
      {problem && (
        <div className="problem">
          <span>⚠ {problem.text}</span>
          {problem.action && (
            <button className="btn small" onClick={problem.action.run}>
              {problem.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
