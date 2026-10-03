import { useRef, useState } from 'react'
import styles from './NumberField.module.css'

type NumberFieldProps = {
  value: number
  min: number
  max: number
  step?: number
  onCommit: (value: number) => void
  label: string
  width?: number
}

/**
 * Numeric input that only commits on Enter/blur (so typing "100" doesn't pass through 1 and 10),
 * while arrow keys commit immediately.
 */
export function NumberField({ value, min, max, step = 1, onCommit, label, width = 56 }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)

  const commit = (raw: string) => {
    const n = Number(raw)
    if (!cancelled.current && raw.trim() !== '' && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)))
    cancelled.current = false
    setDraft(null)
  }

  return (
    <input
      className={`control ${styles.field}`}
      style={{ width }}
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          const delta = (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1)
          onCommit(Math.min(max, Math.max(min, value + delta)))
          setDraft(null)
        }
      }}
    />
  )
}
