import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChordDiagram } from '../components/ChordDiagram'
import { ListenBadge } from '../components/ListenBadge'
import { MicGate } from '../components/MicGate'
import { SongEditor, blankSong } from '../components/SongEditor'
import { useChordListener } from '../hooks/useChordListener'
import { useEngineStatus } from '../hooks/useEngine'
import { settingsStore } from '../lib/settings'
import { countRun, songStore, useSongs } from '../lib/songStore'
import { useStore } from '../lib/store'
import { chordLabel } from '../music/chords'
import { parseChart, shapeName, transposeChart, type ParsedSong, type Song } from '../music/songs'
import { PATTERN_BY_ID, stepLabels } from '../music/strum'

const LEVELS = ['', 'Beginner', 'Intermediate', 'Advanced']

export function SongsPage() {
  const { songs, state } = useSongs()
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Song | null>(null)
  const open = songs.find((s) => s.id === openId) ?? null

  return (
    <div className="stack">
      {open ? (
        <SongView
          key={open.id}
          song={open}
          onBack={() => setOpenId(null)}
          onEdit={() => setEditing(open)}
        />
      ) : (
        <>
          <div className="row between center-items">
            <div>
              <h2 style={{ margin: 0 }}>Songs</h2>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Chords, strumming and lyrics in one place. Play along and it follows you, chord by chord.
              </p>
            </div>
            <button className="btn primary" onClick={() => setEditing(blankSong())}>
              + Add song
            </button>
          </div>
          <div className="song-grid">
            {songs.map((s) => {
              const parsed = parseChart(s.chart)
              return (
                <button
                  key={s.id}
                  className="card song-card"
                  onClick={() => {
                    songStore.set({ lastId: s.id })
                    setOpenId(s.id)
                  }}
                >
                  <div className="song-title">{s.title}</div>
                  <div className="muted">{s.artist || 'Unknown artist'}</div>
                  <div className="row wrap gap" style={{ marginTop: 10 }}>
                    <span className="pill">{LEVELS[s.level]}</span>
                    <span className="pill">{s.capo ? `Capo ${s.capo}` : 'No capo'}</span>
                    <span className="pill">{parsed.shapes.length} chords</span>
                    {state.runs[s.id] ? <span className="pill good">played {state.runs[s.id]}×</span> : null}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
      {editing && (
        <SongEditor
          key={editing.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onDeleted={() => {
            setEditing(null)
            setOpenId(null)
          }}
        />
      )}
    </div>
  )
}

function StrumRow({ patternId }: { patternId: string }) {
  const p = PATTERN_BY_ID[patternId]
  if (!p) return null
  const labels = stepLabels(p.beats, p.subdiv)
  return (
    <div className="pat-row" aria-label={`Strum pattern ${p.steps.join(' ')}`}>
      {p.steps.map((st, i) => (
        <div key={i} className={`pat-cell ${st === '-' ? 'rest' : ''} ${i % p.subdiv === 0 ? 'beat' : ''}`}>
          <span className="pat-count">{labels[i]}</span>
          <span className="pat-arrow">{st === 'D' ? '↓' : st === 'U' ? '↑' : '·'}</span>
        </div>
      ))}
    </div>
  )
}

function SongView({ song: original, onBack, onEdit }: { song: Song; onBack: () => void; onEdit: () => void }) {
  const { noCapo } = useStore(songStore)
  const capoFree = noCapo && original.capo > 0
  // without a capo the same song is played `capo` semitones higher on the neck (same sound, different shapes)
  const song: Song = useMemo(
    () => (capoFree ? { ...original, capo: 0, chart: transposeChart(original.chart, original.capo) } : original),
    [original, capoFree],
  )
  const parsed = useMemo(() => parseChart(song.chart), [song.chart])
  const hasLyrics = parsed.sections.some((sec) => sec.lines.some((l) => l.kind === 'lyric' && l.segs.some((g) => g.text.trim())))
  const [practice, setPractice] = useState(false)
  const [idx, setIdx] = useState(0)
  const pattern = PATTERN_BY_ID[song.patternId]
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdx(0)
  }, [song.chart, song.capo])

  // keep the chord you're on in view
  useEffect(() => {
    if (!practice) return
    chartRef.current?.querySelector(`[data-step="${idx}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [idx, practice])

  const drillStrum = () => {
    const bpm = song.bpm ?? 80
    const start = Math.max(50, Math.min(90, Math.round(bpm * 0.5)))
    settingsStore.set({
      strumPatterns: [song.patternId],
      strumProgression: 'none',
      startBpm: start,
      targetBpm: Math.max(start, Math.min(bpm, 160)),
    })
    window.location.hash = '#strum'
  }

  return (
    <>
      <div className="card">
        <div className="row between wrap gap">
          <button className="btn ghost small" onClick={onBack}>
            ← All songs
          </button>
          <div className="row gap">
            <button className="btn ghost small" onClick={onEdit}>
              Edit chords &amp; lyrics
            </button>
          </div>
        </div>
        <h2 style={{ margin: '10px 0 2px' }}>{song.title}</h2>
        <div className="muted">{song.artist}</div>
        <div className="row wrap gap" style={{ marginTop: 10 }}>
          <span className="pill">{LEVELS[song.level]}</span>
          {song.capo ? <span className="pill warn">Capo on fret {song.capo}</span> : <span className="pill">No capo</span>}
          {song.bpm && <span className="pill">{song.bpm} bpm</span>}
          {song.key && <span className="pill">Key {song.key}</span>}
        </div>
        {original.capo > 0 && (
          <div className="row wrap gap center-items" style={{ marginTop: 12 }}>
            <div className="seg" role="group" aria-label="Capo">
              <button className={!noCapo ? 'on' : ''} onClick={() => songStore.set({ noCapo: false })}>
                With capo (fret {original.capo})
              </button>
              <button className={noCapo ? 'on' : ''} onClick={() => songStore.set({ noCapo: true })}>
                No capo
              </button>
            </div>
            {capoFree && (
              <span className="muted small">
                Same sound as the recording, played without a capo: every chord is moved up {original.capo} semitones, so expect more barre chords.
              </span>
            )}
          </div>
        )}
        {song.remark && <p className="muted small" style={{ marginBottom: 0 }}>{song.remark}</p>}
        {!hasLyrics && (
          <div className="row gap wrap center-items" style={{ marginTop: 10 }}>
            <span className="muted small">No lyrics yet. Paste yours under the chords; plain lines show up as-is.</span>
            <button className="btn small" onClick={onEdit}>
              Add lyrics
            </button>
          </div>
        )}
        {parsed.unresolved.length > 0 && (
          <p className="warn small" style={{ marginBottom: 0 }}>
            No diagram for {parsed.unresolved.join(', ')}; those are shown but skipped when practising.
          </p>
        )}
      </div>

      <div className="card">
        <div className="row between wrap gap">
          <div>
            <h3 style={{ margin: 0 }}>Strumming{pattern ? `: ${pattern.name}` : ''}</h3>
            {song.strumNote && <p className="muted small" style={{ margin: '4px 0 0' }}>{song.strumNote}</p>}
          </div>
          <button className="btn small" onClick={drillStrum}>
            Drill this strum →
          </button>
        </div>
        <StrumRow patternId={song.patternId} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Chords in this song{song.capo ? ` (shapes, capo ${song.capo})` : ''}</h3>
        <div className="shape-row">
          {parsed.shapes.map((c) => (
            <div key={c.id} className="shape">
              <div className="small">{chordLabel(c)}</div>
              <ChordDiagram chord={c} width={84} />
            </div>
          ))}
        </div>
      </div>

      <div className="card practice-bar">
        {practice ? (
          <>
            <MicGate why="Play the chords in order. Each one is checked and the song moves on by itself.">
              <ListenBadge />
              <PracticePanel
                song={song}
                parsed={parsed}
                idx={idx}
                setIdx={setIdx}
                onStop={() => {
                  setPractice(false)
                  setIdx(0)
                }}
              />
            </MicGate>
          </>
        ) : (
          <div className="row between wrap gap">
            <div>
              <h3 style={{ margin: 0 }}>Play along</h3>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                The song follows your playing: get a chord right and it moves to the next one. No tempo pressure, so take your time.
              </p>
            </div>
            <button className="btn primary" onClick={() => setPractice(true)} disabled={parsed.steps.length === 0}>
              Practise with mic
            </button>
          </div>
        )}
      </div>

      <div className="card chart" ref={chartRef}>
        {parsed.sections.map((sec, si) => (
          <section key={si} className="song-section">
            {sec.title && <h3 className="sec-title">{sec.title}</h3>}
            {sec.lines.map((ln, li) =>
              ln.kind === 'note' ? (
                <p key={li} className="song-note">
                  {ln.text}
                </p>
              ) : (
                <div key={li} className={`song-line ${ln.chordsOnly ? 'chords-only' : ''}`}>
                  {ln.segs.map((sg, gi) => {
                    const t = sg.tok
                    const cls = !t
                      ? ''
                      : !practice || t.step < 0
                        ? ''
                        : t.step < idx
                          ? 'done'
                          : t.step === idx
                            ? 'now'
                            : t.step === idx + 1
                              ? 'next'
                              : ''
                    return (
                      <span key={gi} className="lseg">
                        {t ? (
                          <button
                            className={`tok ${cls} ${t.chord ? '' : 'nochord'}`}
                            data-step={t.step >= 0 ? t.step : undefined}
                            disabled={!practice || t.step < 0}
                            onClick={() => setIdx(t.step)}
                            title={t.simplified && t.chord ? `Play ${chordLabel(t.chord)}` : undefined}
                          >
                            {t.label}
                          </button>
                        ) : (
                          <span className="tok ghost-tok"> </span>
                        )}
                        <span className="lseg-text">{sg.text}</span>
                      </span>
                    )
                  })}
                </div>
              ),
            )}
          </section>
        ))}
      </div>
    </>
  )
}

function PracticePanel({
  song,
  parsed,
  idx,
  setIdx,
  onStop,
}: {
  song: Song
  parsed: ParsedSong
  idx: number
  setIdx: (n: number) => void
  onStop: () => void
}) {
  const settings = useStore(settingsStore)
  const status = useEngineStatus()
  const steps = parsed.steps
  const done = idx >= steps.length
  const step = done ? null : steps[idx]
  const next = steps[idx + 1]
  const [flash, setFlash] = useState(false)
  const counted = useRef(false)

  useEffect(() => {
    if (!done) counted.current = false
  }, [done])

  const onMatch = useCallback(() => {
    setFlash(true)
    window.setTimeout(() => setFlash(false), 450)
    const n = idx + 1
    if (n >= steps.length && !counted.current) {
      counted.current = true
      countRun(song.id)
    }
    setIdx(n)
  }, [idx, steps.length, song.id, setIdx])

  const live = useChordListener({
    target: step?.chord ?? null,
    enabled: status === 'running' && !done,
    sensitivity: settings.sensitivity,
    a4: settings.a4,
    capo: song.capo,
    resetKey: idx,
    onMatch,
  })

  if (done) {
    return (
      <div className="center stack">
        <h2 style={{ margin: 0 }}>🎉 You played the whole song</h2>
        <p className="muted" style={{ margin: 0 }}>
          {steps.length} chord changes, start to finish.
        </p>
        <div className="row gap center-items" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => setIdx(0)}>
            Play it again
          </button>
          <button className="btn ghost" onClick={onStop}>
            Done
          </button>
        </div>
      </div>
    )
  }

  const heard = live.heard ? shapeName(live.heard.chord.name, song.capo) : null
  const tone = flash ? 'good' : live.wrong ? 'bad' : 'idle'

  return (
    <div className={`stage practice-stage ${flash ? 'flash-good' : live.wrong ? 'flash-bad' : ''}`}>
      <div className="stage-main">
        <div className="row gap center-items">
          <div className="col center-items">
            <div className="chord-name">{step!.label}</div>
            {step!.simplified && <div className="muted small">play {chordLabel(step!.chord)}</div>}
            <ChordDiagram chord={step!.chord} width={170} strings={settings.showHints ? live.strings : null} tone={tone} />
          </div>
          {next && (
            <>
              <div className="arrow">→</div>
              <div className="col center-items next-up">
                <div className="muted small">then</div>
                <div className="chord-name small">{next.label}</div>
                <ChordDiagram chord={next.chord} width={84} />
              </div>
            </>
          )}
        </div>
      </div>
      <div className="stage-side">
        <div className={`ring ${flash ? 'ok' : live.wrong ? 'bad' : ''}`} style={{ ['--p' as string]: flash || live.wrong ? 1 : live.progress }}>
          <span>{flash ? '✓' : live.wrong ? '✗' : (heard ?? '…')}</span>
        </div>
        <div className={`status-line center ${flash ? 'good' : live.wrong ? 'bad' : 'muted'}`}>
          {flash
            ? 'Nice!'
            : live.wrong
              ? heard && live.heard && live.heard.chord.pcMask !== step!.chord.pcMask
                ? `Not quite. That sounded like ${heard}.`
                : 'Not quite. Check the red strings.'
              : live.signal
                ? heard
                  ? `Hearing ${heard}`
                  : 'Hearing something…'
                : song.capo
                  ? `Strum it (capo ${song.capo} on)`
                  : 'Strum the chord'}
        </div>
        <div className="muted small center">
          {idx + 1} / {steps.length}
        </div>
        <div className="row gap" style={{ justifyContent: 'center' }}>
          <button className="btn ghost small" onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>
            ← Back
          </button>
          <button className="btn ghost small" onClick={() => setIdx(idx + 1)}>
            Skip →
          </button>
          <button className="btn ghost small" onClick={() => setIdx(0)}>
            Restart
          </button>
          <button className="btn ghost small" onClick={onStop}>
            Stop
          </button>
        </div>
      </div>
    </div>
  )
}
