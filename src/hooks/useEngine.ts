import { useEffect, useSyncExternalStore } from 'react'
import { engine, type EngineStatus } from '../audio/engine'
import type { AnalysisFrame, Onset, Wants } from '../audio/core'
import { settingsStore } from '../lib/settings'

export function useEngineStatus(): EngineStatus {
  return useSyncExternalStore(engine.onStatus.bind(engine), () => engine.status)
}

export function startMic(): Promise<void> {
  return engine.start(settingsStore.get().deviceId)
}

/** Subscribe to analysis frames while mounted and declare which analyses are needed. */
export function useFrames(owner: string, wants: Partial<Wants>, cb: (f: AnalysisFrame) => void, active = true): void {
  const pitch = !!wants.pitch
  const chroma = !!wants.chroma
  useEffect(() => {
    if (!active) return
    engine.want(owner, { pitch, chroma })
    const off = engine.onFrame(cb)
    return () => {
      off()
      engine.want(owner, null)
    }
  }, [owner, pitch, chroma, cb, active])
}

export function useOnsets(cb: (o: Onset) => void, active = true): void {
  useEffect(() => {
    if (!active) return
    return engine.onOnset(cb)
  }, [cb, active])
}
