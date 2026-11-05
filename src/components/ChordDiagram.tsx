import type { Chord } from '../music/chords'

interface Props {
  chord: Chord
  width?: number
  /** Per-string status (low E first): true = heard, false = missing, null = muted/not required. */
  strings?: (boolean | null)[] | null
  tone?: 'idle' | 'good' | 'bad'
}

const STR_X = (i: number) => 24 + i * 19
const FRET_H = 26
const TOP = 44
const FRETS = 5

export function ChordDiagram({ chord, width = 160, strings = null, tone = 'idle' }: Props) {
  const fretted = chord.frets.filter((f): f is number => f !== null && f > 0)
  const maxFret = fretted.length ? Math.max(...fretted) : 0
  const minFret = fretted.length ? Math.min(...fretted) : 1
  const base = maxFret <= FRETS ? 1 : minFret
  const accent = tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : 'var(--text)'
  const height = TOP + FRETS * FRET_H + 16

  return (
    <svg
      viewBox={`0 0 ${24 + 5 * 19 + 24} ${height}`}
      width={width}
      role="img"
      aria-label={`${chord.name} chord diagram`}
      style={{ display: 'block' }}
    >
      {/* nut / top bar */}
      {base === 1 ? (
        <rect x={STR_X(0) - 1} y={TOP - 4} width={STR_X(5) - STR_X(0) + 2} height={5} rx={1.5} fill={accent} />
      ) : (
        <text x={STR_X(5) + 10} y={TOP + FRET_H / 2 + 4} fontSize={11} fill="var(--muted)">
          {base}fr
        </text>
      )}
      {/* frets */}
      {Array.from({ length: FRETS + 1 }, (_, i) => (
        <line
          key={i}
          x1={STR_X(0)}
          x2={STR_X(5)}
          y1={TOP + i * FRET_H}
          y2={TOP + i * FRET_H}
          stroke="var(--line-strong)"
          strokeWidth={i === 0 && base === 1 ? 0 : 1}
        />
      ))}
      {/* strings */}
      {chord.frets.map((_, i) => {
        const st = strings?.[i]
        const color = st === true ? 'var(--good)' : st === false ? 'var(--bad)' : 'var(--line-strong)'
        return (
          <line
            key={i}
            x1={STR_X(i)}
            x2={STR_X(i)}
            y1={TOP}
            y2={TOP + FRETS * FRET_H}
            stroke={color}
            strokeWidth={st === undefined || st === null ? 1.2 + (5 - i) * 0.12 : 2.4}
          />
        )
      })}
      {/* barre */}
      {chord.barre && (
        <rect
          x={STR_X(chord.barre.from) - 8}
          y={TOP + (chord.barre.fret - base) * FRET_H + FRET_H / 2 - 8}
          width={STR_X(chord.barre.to) - STR_X(chord.barre.from) + 16}
          height={16}
          rx={8}
          fill={accent}
        />
      )}
      {/* open / muted markers + dots */}
      {chord.frets.map((f, i) => {
        const x = STR_X(i)
        if (f === null)
          return (
            <text key={i} x={x} y={TOP - 14} fontSize={13} textAnchor="middle" fill="var(--muted)">
              ×
            </text>
          )
        if (f === 0)
          return <circle key={i} cx={x} cy={TOP - 19} r={4.5} fill="none" stroke="var(--muted)" strokeWidth={1.4} />
        const y = TOP + (f - base) * FRET_H + FRET_H / 2
        const finger = chord.fingers?.[i]
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={8.5} fill={accent} />
            {finger ? (
              <text x={x} y={y + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill="var(--bg)">
                {finger}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
