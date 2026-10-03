import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { useSongStore } from '../../state/songStore'
import styles from './Knob.module.css'

type KnobProps = {
  value: number
  min: number
  max: number
  defaultValue: number
  onChange: (value: number) => void
  label: string
  format?: (value: number) => string
  /** Draw the value arc from the centre (e.g. pan) */
  bipolar?: boolean
  color?: string
  size?: number
}

const START = -135
const END = 135

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  if (Math.abs(to - from) < 0.01) return ''
  const [a, b] = from < to ? [from, to] : [to, from]
  const p1 = polar(cx, cy, r, a)
  const p2 = polar(cx, cy, r, b)
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${p2.x} ${p2.y}`
}

/** Rotary control: drag vertically (Shift for fine), arrow keys, double-click to reset. */
export function Knob({
  value,
  min,
  max,
  defaultValue,
  onChange,
  label,
  format = (v) => v.toFixed(2),
  bipolar = false,
  color = 'var(--accent)',
  size = 34,
}: KnobProps) {
  const drag = useRef<{ y: number; value: number } | null>(null)
  // Latest value, updated immediately on change so repeated key presses build on each other
  // even before the parent re-renders.
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])
  const range = max - min
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const t = (value - min) / range
  const angle = START + t * (END - START)
  const origin = bipolar ? 0 : START
  const c = size / 2
  const r = size / 2 - 3

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus()
    drag.current = { y: e.clientY, value }
    useSongStore.getState().beginTransaction()
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const pixelsForFullRange = e.shiftKey ? 600 : 150
    onChange(clamp(drag.current.value + ((drag.current.y - e.clientY) / pixelsForFullRange) * range))
  }

  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    useSongStore.getState().endTransaction()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = range / (e.shiftKey ? 200 : 50)
    let next: number
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = clamp(latest.current + step)
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = clamp(latest.current - step)
    else return
    latest.current = next
    onChange(next)
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div className={styles.knob} title={`${label}: ${format(value)} (double-click to reset)`}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        className={styles.dial}
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => onChange(defaultValue)}
        onKeyDown={onKeyDown}
      >
        <svg width={size} height={size}>
          <path d={arc(c, c, r, START, END)} className={styles.track} />
          <path d={arc(c, c, r, origin, angle)} className={styles.value} style={{ stroke: color }} />
          <line
            x1={polar(c, c, r * 0.25, angle).x}
            y1={polar(c, c, r * 0.25, angle).y}
            x2={polar(c, c, r - 3, angle).x}
            y2={polar(c, c, r - 3, angle).y}
            className={styles.pointer}
          />
        </svg>
      </div>
      <span className={styles.caption}>{label}</span>
    </div>
  )
}
