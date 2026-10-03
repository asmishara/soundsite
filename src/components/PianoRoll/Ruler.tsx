import { memo } from 'react'
import { STEPS_PER_BAR } from '../../model/types'
import styles from './PianoRoll.module.css'

/** Bar numbers and beat ticks along the top. */
export const Ruler = memo(function Ruler({ bars, zoom }: { bars: number; zoom: number }) {
  return (
    <div className={styles.rulerTicks} style={{ ['--step' as string]: `${zoom}px` }}>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className={styles.barNumber} style={{ left: i * STEPS_PER_BAR * zoom }}>
          {i + 1}
        </span>
      ))}
    </div>
  )
})
