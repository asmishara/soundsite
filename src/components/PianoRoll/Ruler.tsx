import { memo, useRef, useState, type PointerEvent } from 'react'
import { cue, setLoop } from '../../audio/scheduler'
import { STEPS_PER_BAR } from '../../model/types'
import { useUiStore } from '../../state/uiStore'
import styles from './PianoRoll.module.css'

function StartFlag({ zoom, steps }: { zoom: number; steps: number }) {
  const startStep = useUiStore((s) => s.startStep)
  if (startStep >= steps) return null
  return <div className={styles.startFlag} style={{ left: startStep * zoom }} />
}

/** The loop range on this section's ruler, if one is set. */
function LoopBand({ sectionId, zoom, steps }: { sectionId: string; zoom: number; steps: number }) {
  const loop = useUiStore((s) => s.loop)
  if (loop?.scope !== 'section' || loop.sectionId !== sectionId || loop.start >= steps) return null
  return (
    <div
      className={styles.loopBand}
      style={{ left: loop.start * zoom, width: (Math.min(loop.end, steps) - loop.start) * zoom }}
    />
  )
}

type Drag = { from: number; startX: number; moved: boolean }

/**
 * Bar numbers and beat ticks along the top. Click a bar to play from there; drag across bars to
 * loop them.
 */
export const Ruler = memo(function Ruler({ bars, zoom, sectionId }: { bars: number; zoom: number; sectionId: string }) {
  const drag = useRef<Drag | null>(null)
  const [preview, setPreview] = useState<{ from: number; to: number } | null>(null)
  const barWidth = zoom * STEPS_PER_BAR

  const barAt = (e: PointerEvent<HTMLDivElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left
    return Math.min(bars - 1, Math.max(0, Math.floor(x / barWidth)))
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { from: barAt(e), startX: e.clientX, moved: false }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || (!d.moved && Math.abs(e.clientX - d.startX) < 4)) return
    d.moved = true
    setPreview({ from: d.from, to: barAt(e) })
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    setPreview(null)
    if (!d) return
    if (!d.moved) {
      cue(d.from * STEPS_PER_BAR)
      return
    }
    const to = barAt(e)
    const first = Math.min(d.from, to)
    const last = Math.max(d.from, to)
    setLoop({ scope: 'section', sectionId, start: first * STEPS_PER_BAR, end: (last + 1) * STEPS_PER_BAR })
  }

  return (
    <div
      className={styles.rulerTicks}
      style={{ ['--step' as string]: `${zoom}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null
        setPreview(null)
      }}
      title="Click a bar to play from there, or drag across bars to loop them"
    >
      <LoopBand sectionId={sectionId} zoom={zoom} steps={bars * STEPS_PER_BAR} />
      {preview && (
        <div
          className={`${styles.loopBand} ${styles.loopPreview}`}
          style={{
            left: Math.min(preview.from, preview.to) * barWidth,
            width: (Math.abs(preview.to - preview.from) + 1) * barWidth,
          }}
        />
      )}
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className={styles.barNumber} style={{ left: i * barWidth }}>
          {i + 1}
        </span>
      ))}
      <StartFlag zoom={zoom} steps={bars * STEPS_PER_BAR} />
    </div>
  )
})

/** Dims the grid outside this section's loop range. */
export function LoopShade({ sectionId, zoom, steps }: { sectionId: string; zoom: number; steps: number }) {
  const loop = useUiStore((s) => s.loop)
  if (loop?.scope !== 'section' || loop.sectionId !== sectionId || loop.start >= steps) return null
  const end = Math.min(loop.end, steps)
  return (
    <>
      {loop.start > 0 && <div className={styles.loopShade} style={{ left: 0, width: loop.start * zoom }} />}
      {end < steps && <div className={styles.loopShade} style={{ left: end * zoom, right: 0 }} />}
    </>
  )
}
