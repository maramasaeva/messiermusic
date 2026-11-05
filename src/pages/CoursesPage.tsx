import { useCallback, useMemo, useState } from 'react'
import { DrillLessonView } from '../components/lessons/DrillLesson'
import { LearnLessonView } from '../components/lessons/LearnLesson'
import { StrumLessonView } from '../components/lessons/StrumLesson'
import { ListenBadge } from '../components/ListenBadge'
import { MicGate } from '../components/MicGate'
import { courseStore, recordResult, resetCourses } from '../lib/courseStore'
import { useStore } from '../lib/store'
import {
  COURSES,
  courseDone,
  courseUnlocked,
  exerciseFor,
  knownSoFar,
  lessonUnlocked,
  patternOf,
  type Course,
  type Lesson,
  type Progress,
} from '../music/courses'

const KIND_LABEL: Record<Lesson['kind'], string> = { learn: 'Learn', drill: 'Exercise', strum: 'Strum', recap: 'Recap' }

function Stars({ n }: { n: number }) {
  return (
    <span className="stars small" aria-label={`${n} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? 'on' : ''}>
          ★
        </span>
      ))}
    </span>
  )
}

function courseStars(c: Course, progress: Progress): { done: number; stars: number } {
  let done = 0
  let stars = 0
  for (const l of c.lessons) {
    const r = progress[l.id]
    if (r) {
      done++
      stars += l.kind === 'learn' ? 0 : r.stars
    }
  }
  return { done, stars }
}

export function CoursesPage() {
  const { progress, unlockAll } = useStore(courseStore)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [lessonId, setLessonId] = useState<string | null>(null)
  const course = COURSES.find((c) => c.id === courseId) ?? null
  const known = knownSoFar(progress)

  if (course && lessonId) {
    const idx = course.lessons.findIndex((l) => l.id === lessonId)
    if (idx >= 0) {
      return (
        <LessonRunner
          key={lessonId}
          course={course}
          index={idx}
          onBack={() => setLessonId(null)}
          onOpen={(id) => setLessonId(id)}
        />
      )
    }
  }

  if (course) {
    const ci = COURSES.indexOf(course)
    return (
      <div className="stack">
        <div className="card">
          <button className="btn ghost small" onClick={() => setCourseId(null)}>
            ← All courses
          </button>
          <div className="row gap wrap center-items" style={{ margin: '10px 0 2px' }}>
            <h2 style={{ margin: 0 }}>{course.title}</h2>
            {course.recap && <span className="pill warn">Recap</span>}
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {course.blurb}
          </p>
          {!courseUnlocked(ci, progress, unlockAll) && <p className="warn small">Finish the course before this one to open it, or use "Unlock everything" on the course list.</p>}
        </div>
        <div className="lesson-list">
          {course.lessons.map((l, i) => {
            const open = courseUnlocked(ci, progress, unlockAll) && lessonUnlocked(course, i, progress, unlockAll)
            const r = progress[l.id]
            return (
              <button key={l.id} className={`card lesson-row ${open ? '' : 'locked'} ${r ? 'done' : ''}`} disabled={!open} onClick={() => setLessonId(l.id)}>
                <span className="lesson-num">{r ? '✓' : open ? i + 1 : '🔒'}</span>
                <span className="lesson-body">
                  <span className="lesson-title">{l.title}</span>
                  <span className="muted small">{l.blurb}</span>
                </span>
                <span className="lesson-meta">
                  <span className="pill">{KIND_LABEL[l.kind]}</span>
                  {r && l.kind !== 'learn' && <Stars n={r.stars} />}
                  {r?.bestSec !== undefined && <span className="muted small">best {r.bestSec.toFixed(1)} s</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="row between wrap gap center-items">
        <div>
          <h2 style={{ margin: 0 }}>Courses</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Learn chords step by step. Each one is detected from your guitar and the course moves on by itself. Recap courses check everything taught so far.
          </p>
        </div>
        <div className="row gap">
          <button className="btn ghost small" onClick={() => courseStore.set({ unlockAll: !unlockAll })}>
            {unlockAll ? 'Back to guided order' : 'Unlock everything'}
          </button>
        </div>
      </div>

      {known.chords.length > 0 && (
        <div className="card">
          <div className="small muted">You know so far</div>
          <div className="row wrap gap" style={{ marginTop: 6 }}>
            {[...new Set(known.chords)].map((c) => (
              <span key={c} className="pill good">
                {c}
              </span>
            ))}
            {known.patterns.map((p) => (
              <span key={p} className="pill">
                ↓↑ {patternOf(p).name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="course-grid">
        {COURSES.map((c, i) => {
          const open = courseUnlocked(i, progress, unlockAll)
          const { done, stars } = courseStars(c, progress)
          const complete = courseDone(c, progress)
          return (
            <button key={c.id} className={`card course-card ${c.recap ? 'recap' : ''} ${open ? '' : 'locked'}`} disabled={!open} onClick={() => setCourseId(c.id)}>
              <div className="row between center-items">
                <span className="pill">{c.recap ? 'Recap' : `Course ${COURSES.slice(0, i + 1).filter((x) => !x.recap).length}`}</span>
                {!open ? <span>🔒</span> : complete ? <span className="good">✓ complete</span> : null}
              </div>
              <div className="song-title" style={{ marginTop: 8 }}>
                {c.title}
              </div>
              <div className="muted small">{c.blurb}</div>
              <div className="progress-track" aria-hidden>
                <div style={{ width: `${(done / c.lessons.length) * 100}%` }} />
              </div>
              <div className="row between small muted">
                <span>
                  {done}/{c.lessons.length} lessons
                </span>
                {stars > 0 && <span>★ {stars}</span>}
              </div>
            </button>
          )
        })}
      </div>

      {Object.keys(progress).length > 0 && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button
            className="btn ghost small"
            onClick={() => {
              if (window.confirm('Reset all course progress?')) resetCourses()
            }}
          >
            Reset progress
          </button>
        </div>
      )}
    </div>
  )
}

function LessonRunner({ course, index, onBack, onOpen }: { course: Course; index: number; onBack: () => void; onOpen: (id: string) => void }) {
  const lesson = course.lessons[index]
  const [attempt, setAttempt] = useState(0)
  // recaps are shuffled fresh on every attempt
  const exercise = useMemo(
    () => exerciseFor(course, lesson),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [course, lesson, attempt],
  )
  const nextLesson = course.lessons[index + 1]
  const goNext = nextLesson ? () => onOpen(nextLesson.id) : null
  const nextLabel = nextLesson ? 'Next lesson →' : 'Back to course'
  const finish = goNext ?? onBack

  const learnDone = useCallback(
    (stars: number) => {
      recordResult(lesson.id, stars)
      finish()
    },
    [lesson.id, finish],
  )
  const drillResult = useCallback(
    (stars: number, sec: number) => {
      if (stars > 0) recordResult(lesson.id, stars, sec)
    },
    [lesson.id],
  )
  const strumResult = useCallback(
    (stars: number) => {
      recordResult(lesson.id, stars)
    },
    [lesson.id],
  )

  return (
    <div className="stack">
      <div className="card">
        <div className="row between wrap gap center-items">
          <button className="btn ghost small" onClick={onBack}>
            ← {course.title}
          </button>
          <span className="muted small">
            Lesson {index + 1} of {course.lessons.length}
          </span>
        </div>
        <div className="row gap wrap center-items" style={{ margin: '10px 0 2px' }}>
          <h2 style={{ margin: 0 }}>{lesson.title}</h2>
          <span className="pill">{KIND_LABEL[lesson.kind]}</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {lesson.blurb}
        </p>
      </div>

      <MicGate why="Play the chords on your guitar. Each one is detected and the lesson moves on by itself.">
        <ListenBadge />
        <div className="card">
          {lesson.kind === 'learn' && <LearnLessonView lesson={lesson} onDone={learnDone} />}
          {exercise?.type === 'drill' && (
            <DrillLessonView
              key={attempt}
              sequence={exercise.sequence}
              secPerChord={exercise.secPerChord}
              onResult={drillResult}
              onRetry={() => setAttempt((a) => a + 1)}
              onNext={goNext ?? onBack}
              nextLabel={nextLabel}
            />
          )}
          {exercise?.type === 'strum' && (
            <StrumLessonView
              key={attempt}
              patterns={exercise.patterns}
              chords={exercise.chords}
              barsPerChord={exercise.barsPerChord}
              bpm={exercise.bpm}
              bars={exercise.bars}
              onResult={strumResult}
              onNext={goNext ?? onBack}
              nextLabel={nextLabel}
            />
          )}
        </div>
      </MicGate>
    </div>
  )
}
