import { createStore, useStore } from './store'
import { BUILTIN_SONGS, type Song } from '../music/songs'

interface SongState {
  /** Songs you added. */
  custom: Song[]
  /** Your changes to built-in songs, by id. */
  edits: Record<string, Partial<Song>>
  runs: Record<string, number>
  /** Play capo songs without a capo (chords are transposed to sound the same). */
  noCapo: boolean
  lastId: string | null
}

export const songStore = createStore<SongState>('mm:songs:v1', { custom: [], edits: {}, runs: {}, noCapo: true, lastId: null })

export function allSongs(s: SongState): Song[] {
  return [...BUILTIN_SONGS.map((b) => ({ ...b, ...(s.edits[b.id] ?? {}) })), ...s.custom]
}

export function useSongs(): { songs: Song[]; state: SongState } {
  const state = useStore(songStore)
  return { songs: allSongs(state), state }
}

export function saveSong(song: Song): void {
  const s = songStore.get()
  if (BUILTIN_SONGS.some((b) => b.id === song.id)) {
    songStore.set({ edits: { ...s.edits, [song.id]: song } })
  } else {
    const exists = s.custom.some((c) => c.id === song.id)
    songStore.set({ custom: exists ? s.custom.map((c) => (c.id === song.id ? song : c)) : [...s.custom, song] })
  }
}

export function resetSong(id: string): void {
  const { [id]: _removed, ...rest } = songStore.get().edits
  void _removed
  songStore.set({ edits: rest })
}

export function deleteSong(id: string): void {
  songStore.set({ custom: songStore.get().custom.filter((c) => c.id !== id) })
}

export function countRun(id: string): void {
  const s = songStore.get()
  songStore.set({ runs: { ...s.runs, [id]: (s.runs[id] ?? 0) + 1 } })
}
