import { createStore } from './store'
import type { Progress } from '../music/courses'

interface CourseState {
  progress: Progress
  /** Skip the guided order: every course and lesson is open. */
  unlockAll: boolean
}

export const courseStore = createStore<CourseState>('mm:courses:v1', { progress: {}, unlockAll: false })

/** Keeps your best stars and best time for a lesson. */
export function recordResult(id: string, stars: number, sec?: number): void {
  const s = courseStore.get()
  const prev = s.progress[id]
  const best = sec !== undefined && (prev?.bestSec === undefined || sec < prev.bestSec) ? sec : prev?.bestSec
  courseStore.set({
    progress: { ...s.progress, [id]: { stars: Math.max(prev?.stars ?? 0, stars), bestSec: best, at: Date.now() } },
  })
}

export function resetCourses(): void {
  courseStore.set({ progress: {}, unlockAll: false })
}
