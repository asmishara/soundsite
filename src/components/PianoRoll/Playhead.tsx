import { usePlayheadStore } from '../../state/playheadStore'
import styles from './PianoRoll.module.css'

/**
 * Vertical line at the current step, shown only while `sectionId` is the section playing.
 * Subscribes on its own so playback doesn't re-render the grid.
 */
export function Playhead({ zoom, sectionId, variant = 'line' }: { zoom: number; sectionId: string; variant?: 'line' | 'marker' }) {
  const step = usePlayheadStore((s) => (s.sectionId === sectionId ? s.step : -1))
  if (step < 0) return null
  return (
    <div
      className={variant === 'line' ? styles.playhead : styles.playheadMarker}
      style={{ transform: `translateX(${step * zoom}px)`, width: variant === 'marker' ? zoom : undefined }}
    />
  )
}
