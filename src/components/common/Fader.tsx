import { useSongStore } from '../../state/songStore'
import styles from './Fader.module.css'

type FaderProps = {
  value: number
  min: number
  max: number
  step?: number
  defaultValue: number
  onChange: (value: number) => void
  label: string
  format: (value: number) => string
  orientation?: 'vertical' | 'horizontal'
}

/** A styled range input. A whole drag is recorded as one undo step; double-click resets. */
export function Fader({
  value,
  min,
  max,
  step = 0.5,
  defaultValue,
  onChange,
  label,
  format,
  orientation = 'vertical',
}: FaderProps) {
  const begin = () => useSongStore.getState().beginTransaction()
  const end = () => useSongStore.getState().endTransaction()

  return (
    <div className={`${styles.fader} ${styles[orientation]}`}>
      <input
        type="range"
        className={styles.input}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={format(value)}
        title={`${label}: ${format(value)} (double-click to reset)`}
        onPointerDown={begin}
        onPointerUp={end}
        onPointerCancel={end}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(defaultValue)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <span className={styles.readout}>{format(value)}</span>
    </div>
  )
}
