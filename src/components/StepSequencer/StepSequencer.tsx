import { useRef, type PointerEvent } from 'react'
import { engine } from '../../audio/engine'
import { useFollowPlayhead } from '../../hooks/useFollowPlayhead'
import { emptyDrumSteps } from '../../model/factory'
import { partPattern } from '../../model/arrangement'
import { ACCENT_VELOCITY, DRUM_VOICES, NORMAL_VELOCITY } from '../../model/presets'
import { STEPS_PER_BAR, STEPS_PER_BEAT, type DrumTrack, type DrumVoiceId, type Section } from '../../model/types'
import { usePlayheadStore } from '../../state/playheadStore'
import { useSongStore, type PartRef } from '../../state/songStore'
import { useUiStore } from '../../state/uiStore'
import { Playhead } from '../PianoRoll/Playhead'
import { Ruler } from '../PianoRoll/Ruler'
import styles from './StepSequencer.module.css'

const LABEL_WIDTH = 104
const ROW_HEIGHT = 32
const HEADER_HEIGHT = 26

function PlayheadColumn({ cellWidth, sectionId }: { cellWidth: number; sectionId: string }) {
  const step = usePlayheadStore((s) => (s.sectionId === sectionId ? s.step : -1))
  if (step < 0) return null
  return <div className={styles.playColumn} style={{ width: cellWidth, transform: `translateX(${step * cellWidth}px)` }} />
}

/** Drum grid for one drum track within one section. */
export function StepSequencer({ track, section }: { track: DrumTrack; section: Section }) {
  const zoom = useUiStore((s) => s.zoom)
  const bars = section.bars
  const cellWidth = Math.max(zoom, 18)
  const total = bars * STEPS_PER_BAR
  const part: PartRef = { trackId: track.id, sectionId: section.id }
  const pattern = partPattern(track, section.id) ?? emptyDrumSteps(bars)
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const paint = useRef<{ value: number; last: { voice: DrumVoiceId; step: number } } | null>(null)

  useFollowPlayhead(scrollerRef, cellWidth, LABEL_WIDTH, section.id)

  const cellAt = (e: { clientX: number; clientY: number }) => {
    const rect = gridRef.current!.getBoundingClientRect()
    const row = Math.floor((e.clientY - rect.top) / ROW_HEIGHT)
    const step = Math.floor((e.clientX - rect.left) / cellWidth)
    if (row < 0 || row >= DRUM_VOICES.length || step < 0 || step >= total) return null
    return { voice: DRUM_VOICES[row].id, step }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const cell = cellAt(e)
    if (!cell) return
    e.currentTarget.setPointerCapture(e.pointerId)
    // Read live state rather than props so rapid clicks never act on a stale render.
    const live = useSongStore.getState().song.tracks.find((t) => t.id === track.id)
    if (live?.kind !== 'drums') return
    const current = partPattern(live, section.id)?.[cell.voice][cell.step] ?? 0
    const value = e.shiftKey
      ? current === ACCENT_VELOCITY
        ? NORMAL_VELOCITY
        : ACCENT_VELOCITY
      : current > 0
        ? 0
        : NORMAL_VELOCITY
    const store = useSongStore.getState()
    store.beginTransaction()
    store.setDrumStep(part, cell.voice, cell.step, value)
    if (value > 0) void engine.preview(track.id, cell.voice, value)
    paint.current = { value, last: cell }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = paint.current
    if (!p) return
    const cell = cellAt(e)
    if (!cell || (cell.voice === p.last.voice && cell.step === p.last.step)) return
    const store = useSongStore.getState()
    // Fill any steps skipped by a fast drag along the same row.
    const from = cell.voice === p.last.voice ? p.last.step : cell.step
    const dir = Math.sign(cell.step - from)
    for (let s = from + dir; s !== cell.step; s += dir) store.setDrumStep(part, cell.voice, s, p.value)
    store.setDrumStep(part, cell.voice, cell.step, p.value)
    p.last = cell
  }

  const onPointerUp = () => {
    if (!paint.current) return
    paint.current = null
    useSongStore.getState().endTransaction()
  }

  return (
    <div className={styles.seq}>
      <div className={styles.scroller} ref={scrollerRef}>
        <div className={styles.inner} style={{ width: LABEL_WIDTH + total * cellWidth }}>
          <div className={styles.header} style={{ height: HEADER_HEIGHT }}>
            <div className={styles.corner} style={{ width: LABEL_WIDTH }} />
            <div className={styles.ruler} style={{ width: total * cellWidth }}>
              <Ruler bars={bars} zoom={cellWidth} />
              <Playhead zoom={cellWidth} sectionId={section.id} variant="marker" />
            </div>
          </div>
          <div className={styles.body}>
            <div className={styles.labels} style={{ width: LABEL_WIDTH }}>
              {DRUM_VOICES.map((v) => (
                <button
                  key={v.id}
                  className={styles.label}
                  style={{ height: ROW_HEIGHT }}
                  onPointerDown={() => void engine.preview(track.id, v.id, NORMAL_VELOCITY)}
                  title={`Audition ${v.label}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div
              ref={gridRef}
              className={styles.grid}
              style={{
                width: total * cellWidth,
                gridTemplateColumns: `repeat(${total}, ${cellWidth}px)`,
                gridTemplateRows: `repeat(${DRUM_VOICES.length}, ${ROW_HEIGHT}px)`,
                ['--track-color' as string]: track.color,
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {DRUM_VOICES.map((v) =>
                pattern[v.id].map((velocity, step) => {
                  const beat = Math.floor(step / STEPS_PER_BEAT)
                  const classes = [styles.cell]
                  if (beat % 2 === 1) classes.push(styles.cellAltBeat)
                  if (step % STEPS_PER_BAR === 0) classes.push(styles.cellBarStart)
                  if (velocity > 0) classes.push(styles.cellOn)
                  if (velocity >= ACCENT_VELOCITY) classes.push(styles.cellAccent)
                  return (
                    <div
                      key={`${v.id}-${step}`}
                      className={classes.join(' ')}
                      style={velocity > 0 ? { ['--velocity' as string]: velocity } : undefined}
                      aria-label={`${v.label} step ${step + 1}${velocity > 0 ? ' on' : ''}`}
                    />
                  )
                }),
              )}
              <PlayheadColumn cellWidth={cellWidth} sectionId={section.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
