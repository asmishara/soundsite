import { useGestureTransaction } from '../../hooks/useGestureTransaction'
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
  const gesture = useGestureTransaction()

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
        {...gesture.rangeHandlers}
        onChange={(e) => {
          gesture.keepOpen()
          onChange(Number(e.target.value))
        }}
        onDoubleClick={() => onChange(defaultValue)}
      />
      <span className={styles.readout}>{format(value)}</span>
    </div>
  )
}
