import { useEffect, useState } from 'react'
import { engine } from '../audio/engine'
import { measureLatency } from '../audio/calibrate'
import { useEngineStatus } from '../hooks/useEngine'
import { DEFAULT_SETTINGS, settingsStore, statsStore } from '../lib/settings'
import { useStore } from '../lib/store'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useStore(settingsStore)
  const status = useEngineStatus()
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [cal, setCal] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void engine.listInputs().then((d) => alive && setDevices(d))
    return () => {
      alive = false
    }
  }, [status])

  const autoMs = Math.round(engine.autoLatency * 1000)
  const effective = s.latencyMs ?? autoMs

  const calibrate = async () => {
    setBusy(true)
    setCal('Listening to 8 clicks… keep quiet.')
    const r = await measureLatency()
    setBusy(false)
    if ('error' in r) setCal(r.error)
    else {
      settingsStore.set({ latencyMs: r.ms })
      setCal(`Measured ${r.ms} ms.`)
    }
  }

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Settings">
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>Settings</h2>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="stack" style={{ marginTop: 14 }}>
          <label className="field wide">
            <span>Microphone</span>
            <select
              value={s.deviceId ?? ''}
              onChange={(e) => {
                const id = e.target.value || null
                settingsStore.set({ deviceId: id })
                if (status === 'running') void engine.restart(id)
              }}
            >
              <option value="">System default</option>
              {devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Input ${i + 1}`}
                </option>
              ))}
            </select>
            <small className="muted">
              {status === 'running' ? `Using: ${engine.deviceLabel || 'default input'}` : 'Turn the mic on to list devices by name.'} An audio interface or
              a phone/laptop mic 20–50 cm from the soundhole works best.
            </small>
          </label>

          <label className="field wide">
            <span>Chord detection</span>
            <select value={s.sensitivity} onChange={(e) => settingsStore.set({ sensitivity: e.target.value as typeof s.sensitivity })}>
              <option value="forgiving">Forgiving (fast, tolerates sloppy chords)</option>
              <option value="normal">Normal</option>
              <option value="strict">Strict (every string must ring clean)</option>
            </select>
          </label>

          <label className="field wide">
            <span>Strum detection</span>
            <select value={s.strumSensitivity} onChange={(e) => settingsStore.set({ strumSensitivity: e.target.value as typeof s.strumSensitivity })}>
              <option value="low">Low (noisy room / loud mic)</option>
              <option value="normal">Normal</option>
              <option value="high">High (soft strumming)</option>
            </select>
          </label>

          <div className="field wide">
            <span>
              Timing offset: <b className="mono">{effective} ms</b> {s.latencyMs === null ? '(auto)' : ''}
            </span>
            <input
              type="range"
              min={0}
              max={400}
              step={1}
              value={effective}
              onChange={(e) => settingsStore.set({ latencyMs: Number(e.target.value) })}
            />
            <div className="row wrap gap">
              <button className="btn ghost" onClick={() => settingsStore.set({ latencyMs: null })}>
                Use auto ({autoMs} ms)
              </button>
              <button className="btn ghost" onClick={() => void calibrate()} disabled={busy || status !== 'running'}>
                Measure with speakers
              </button>
              <span className="muted small">{cal}</span>
            </div>
            <small className="muted">
              Compensates for audio-system delay. Bluetooth headphones add a lot; use the measure button with speakers, or nudge the slider until the
              average timing in the strum trainer reads ~0 ms.
            </small>
          </div>

          <div className="row wrap gap">
            <label className="field">
              <span>Tuning reference A4 (Hz)</span>
              <input type="number" min={415} max={466} value={s.a4} onChange={(e) => settingsStore.set({ a4: Math.min(466, Math.max(415, Number(e.target.value) || 440)) })} />
            </label>
            <label className="field">
              <span>Click volume</span>
              <input type="range" min={0.1} max={1} step={0.05} value={s.clickVolume} onChange={(e) => settingsStore.set({ clickVolume: Number(e.target.value) })} />
            </label>
          </div>

          <div className="row wrap gap">
            <button
              className="btn ghost"
              onClick={() => {
                if (confirm('Reset all settings to defaults?')) settingsStore.set({ ...DEFAULT_SETTINGS })
              }}
            >
              Reset settings
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                if (confirm('Clear saved personal bests and chord times?')) statsStore.set({ bestChangesPerMin: {}, chordTimes: {}, strumBest: {}, sessions: 0 })
              }}
            >
              Clear stats
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
