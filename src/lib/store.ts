import { useSyncExternalStore } from 'react'

export interface Store<T> {
  get(): T
  set(patch: Partial<T>): void
  subscribe(cb: () => void): () => void
}

export function createStore<T extends object>(key: string, defaults: T): Store<T> {
  let state: T = defaults
  try {
    const raw = localStorage.getItem(key)
    if (raw) state = { ...defaults, ...JSON.parse(raw) }
  } catch {
    /* ignore corrupt storage */
  }
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch }
      try {
        localStorage.setItem(key, JSON.stringify(state))
      } catch {
        /* storage may be unavailable */
      }
      listeners.forEach((l) => l())
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get)
}
