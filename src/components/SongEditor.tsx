import { useMemo, useState } from 'react'
import { BUILTIN_SONGS, parseChart, type Song } from '../music/songs'
import { PATTERNS } from '../music/strum'
import { deleteSong, resetSong, saveSong, songStore } from '../lib/songStore'

export const NEW_CHART = `## Verse
[C]Words go here, [G]with the chord right before
[Am]the word where it [F]changes
## Chorus
[C] [G] [Am] [F]
> Lines starting with > are notes to yourself.`

export function blankSong(): Song {
  return {
    id: `custom-${Date.now().toString(36)}`,
    title: '',
    artist: '',
    capo: 0,
    bpm: null,
    patternId: 'down-down-up',
    level: 2,
    chart: NEW_CHART,
  }
}

export function SongEditor({ initial, onClose, onDeleted }: { initial: Song; onClose: () => void; onDeleted: () => void }) {
  const [song, setSong] = useState<Song>(initial)
  const builtin = BUILTIN_SONGS.find((b) => b.id === initial.id)
  const isNew = !builtin && !songStore.get().custom.some((c) => c.id === initial.id)
  const parsed = useMemo(() => parseChart(song.chart), [song.chart])
  const patch = (p: Partial<Song>) => setSong((s) => ({ ...s, ...p }))
  const can = song.title.trim().length > 0 && parsed.steps.length > 0

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Edit song">
      <div className="modal card wide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>{isNew ? 'Add a song' : 'Edit song'}</h2>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>

        <div className="stack" style={{ marginTop: 14 }}>
          <div className="row wrap gap">
            <label className="field grow">
              <span>Title</span>
              <input value={song.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Song title" />
            </label>
            <label className="field grow">
              <span>Artist</span>
              <input value={song.artist} onChange={(e) => patch({ artist: e.target.value })} placeholder="Artist" />
            </label>
          </div>
          <div className="row wrap gap">
            <label className="field">
              <span>Capo</span>
              <select value={song.capo} onChange={(e) => patch({ capo: Number(e.target.value) })}>
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? 'No capo' : `Fret ${i}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tempo (bpm)</span>
              <input
                type="number"
                min={40}
                max={240}
                value={song.bpm ?? ''}
                onChange={(e) => patch({ bpm: e.target.value ? Number(e.target.value) : null })}
                placeholder="optional"
                style={{ width: 110 }}
              />
            </label>
            <label className="field grow">
              <span>Strum pattern</span>
              <select value={song.patternId} onChange={(e) => patch({ patternId: e.target.value })}>
                {PATTERNS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.steps.join('')})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field wide">
            <span>Chords and lyrics</span>
            <textarea
              className="chart-input mono"
              value={song.chart}
              onChange={(e) => patch({ chart: e.target.value })}
              rows={16}
              spellCheck={false}
            />
            <small className="muted">
              Start a section with <code>## Verse</code>. Put a chord in square brackets right before the word where it changes, like{' '}
              <code>[Am]over and over</code>. A line with only chords is fine. To add lyrics, paste them as plain lines right under the chord line they belong to. Chords are the shapes you finger; set the capo above.
            </small>
          </label>

          <div className="small">
            <b>{parsed.steps.length}</b> chord changes · <b>{parsed.shapes.length}</b> different chords
            {parsed.unresolved.length > 0 && (
              <span className="warn">
                {' '}
                · no diagram for {parsed.unresolved.join(', ')} (shown, but skipped in practice)
              </span>
            )}
          </div>

          <div className="row wrap gap">
            <button
              className="btn primary"
              disabled={!can}
              onClick={() => {
                saveSong({ ...song, title: song.title.trim(), artist: song.artist.trim() })
                onClose()
              }}
            >
              Save
            </button>
            <span className="spacer" />
            {builtin && (
              <button
                className="btn ghost"
                onClick={() => {
                  resetSong(initial.id)
                  onClose()
                }}
              >
                Reset to original
              </button>
            )}
            {!builtin && !isNew && (
              <button
                className="btn ghost danger"
                onClick={() => {
                  if (window.confirm(`Delete "${initial.title}"?`)) {
                    deleteSong(initial.id)
                    onDeleted()
                  }
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
