import { memo, type PointerEvent } from 'react'
import { cue } from '../../audio/scheduler'
import { STEPS_PER_BAR } from '../../model/types'
import { useUiStore } from '../../state/uiStore'
import styles from './PianoRoll.module.css'

function StartFlag({ zoom, steps }: { zoom: number; steps: number }) {
  const startStep = useUiStore((s) => s.startStep)
  if (startStep >= steps) return null
  return <div className={styles.startFlag} style={{ left: startStep * zoom }} />
}

/** Bar numbers and beat ticks along the top. Click a bar to play from there. */
export const Ruler = memo(function Ruler({ bars, zoom }: { bars: number; zoom: number }) {
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left
    const bar = Math.min(bars - 1, Math.max(0, Math.floor(x / (zoom * STEPS_PER_BAR))))
    cue(bar * STEPS_PER_BAR)
  }

  return (
    <div
      className={styles.rulerTicks}
      style={{ ['--step' as string]: `${zoom}px` }}
      onPointerDown={onPointerDown}
      title="Click a bar to play from there"
    >
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className={styles.barNumber} style={{ left: i * STEPS_PER_BAR * zoom }}>
          {i + 1}
        </span>
      ))}
      <StartFlag zoom={zoom} steps={bars * STEPS_PER_BAR} />
    </div>
  )
})
