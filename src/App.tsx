import { useEffect, useState } from 'react'
import { LevelMeter } from './components/MicGate'
import { SettingsDialog } from './components/SettingsDialog'
import { useEngineStatus } from './hooks/useEngine'
import { engine } from './audio/engine'
import { ChangesPage } from './pages/ChangesPage'
import { ChordsPage } from './pages/ChordsPage'
import { SongsPage } from './pages/SongsPage'
import { StrumPage } from './pages/StrumPage'
import { TunerPage } from './pages/TunerPage'

const TABS = [
  { id: 'tuner', label: 'Tuner', icon: '◎' },
  { id: 'chords', label: 'Chords', icon: '♯' },
  { id: 'changes', label: 'Changes', icon: '⇄' },
  { id: 'strum', label: 'Strum', icon: '↓↑' },
  { id: 'songs', label: 'Songs', icon: '♫' },
] as const

type TabId = (typeof TABS)[number]['id']

function initialTab(): TabId {
  const h = window.location.hash.replace('#', '')
  return TABS.some((t) => t.id === h) ? (h as TabId) : 'tuner'
}

export default function App() {
  const [tab, setTab] = useState<TabId>(initialTab)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const status = useEngineStatus()

  useEffect(() => {
    const onHash = () => setTab(initialTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    window.history.replaceState(null, '', `#${tab}`)
  }, [tab])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">♪</span>
          <div>
            <div className="brand-name">messiermusic</div>
            <div className="brand-sub">guitar trainer</div>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              <span className="tab-icon" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          {status === 'running' ? (
            <>
              <LevelMeter />
              <button className="btn ghost small" onClick={() => void engine.stop()}>
                Mic off
              </button>
            </>
          ) : (
            <span className="muted small">Mic off</span>
          )}
          <button className="btn ghost icon" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            ⚙
          </button>
        </div>
      </header>

      <main className="content">
        {tab === 'tuner' && <TunerPage />}
        {tab === 'chords' && <ChordsPage />}
        {tab === 'changes' && <ChangesPage />}
        {tab === 'strum' && <StrumPage />}
        {tab === 'songs' && <SongsPage />}
      </main>

      <footer className="foot muted small">
        Everything runs in your browser; audio never leaves your device. Tip: keep the guitar 20–50 cm from the mic and turn off any noise-cancelling.
      </footer>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
