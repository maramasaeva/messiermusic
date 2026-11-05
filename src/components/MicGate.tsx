import { useEffect, useRef, type ReactNode } from 'react'
import { engine } from '../audio/engine'
import { startMic, useEngineStatus } from '../hooks/useEngine'

export function MicGate({ children, why }: { children: ReactNode; why: string }) {
  const status = useEngineStatus()
  if (status === 'running') return <>{children}</>
  return (
    <div className="card gate">
      <div className="gate-icon" aria-hidden>
        🎙
      </div>
      <h2>Turn on your microphone</h2>
      <p className="muted">{why}</p>
      <p className="muted small">Audio is analysed on this device only. Nothing is recorded or uploaded.</p>
      <button className="btn primary big" onClick={() => void startMic()} disabled={status === 'starting'}>
        {status === 'starting' ? 'Starting…' : 'Enable microphone'}
      </button>
      {status === 'error' && <p className="error">{engine.error}</p>}
    </div>
  )
}

/** Small live input meter. */
export function LevelMeter() {
  const bar = useRef<HTMLDivElement>(null)
  const status = useEngineStatus()
  useEffect(() => {
    if (status !== 'running') return
    let raf = 0
    let shown = 0
    const loop = () => {
      const db = engine.levelDb
      const target = Math.max(0, Math.min(1, (db + 70) / 55))
      shown = target > shown ? target : shown * 0.9 + target * 0.1
      if (bar.current) {
        bar.current.style.width = `${shown * 100}%`
        bar.current.dataset.hot = shown > 0.93 ? '1' : '0'
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [status])
  return (
    <div className="meter" title="Microphone level" aria-label="Microphone level">
      <div ref={bar} className="meter-bar" />
    </div>
  )
}
