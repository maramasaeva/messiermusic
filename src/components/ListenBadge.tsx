import { useEffect, useRef, useState } from 'react'
import { engine } from '../audio/engine'
import { useEngineStatus } from '../hooks/useEngine'

/**
 * Always-visible proof that the app is hearing you: a live level bar,
 * a "hearing you / silent" label, and a pulse for every detected strum or pluck.
 */
export function ListenBadge() {
  const status = useEngineStatus()
  const bar = useRef<HTMLDivElement>(null)
  const [hearing, setHearing] = useState(false)
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    if (status !== 'running') return
    let raf = 0
    let shown = 0
    let last = false
    const loop = () => {
      const target = Math.max(0, Math.min(1, (engine.levelDb + 70) / 55))
      shown = target > shown ? target : shown * 0.88 + target * 0.12
      if (bar.current) bar.current.style.width = `${shown * 100}%`
      const h = engine.signal
      if (h !== last) {
        last = h
        setHearing(h)
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
    <div className={`listen-badge ${hearing ? 'on' : ''}`}>
      <span key={pulse} className={`ear-dot ${pulse ? 'pulse' : ''}`} />
      <div className="lb-meter">
        <div ref={bar} className="lb-bar" />
      </div>
      <span className="lb-text">{hearing ? 'Hearing you' : 'Silent — play something'}</span>
    </div>
  )
}
