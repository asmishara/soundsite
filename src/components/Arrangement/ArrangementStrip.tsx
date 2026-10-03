import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { cue, setPlayMode } from '../../audio/scheduler'
import { useDismiss } from '../../hooks/useDismiss'
import {
  layoutArrangement,
  placementOf,
  secondsPerStep,
  sectionSteps,
  type ArrangementLayout,
  type Placement,
} from '../../model/arrangement'
import { MAX_NAME_LENGTH } from '../../model/rules'
import { STEPS_PER_BAR } from '../../model/types'
import { usePlayheadStore } from '../../state/playheadStore'
import { useSongStore } from '../../state/songStore'
import { useUiStore } from '../../state/uiStore'
import { LinkIcon, MoreIcon, PlusIcon } from '../common/icons'
import styles from './ArrangementStrip.module.css'

const PX_PER_BAR = 26
const PX_PER_STEP = PX_PER_BAR / STEPS_PER_BAR

type Drag = { placement: Placement; startX: number; moved: boolean }
type Menu = { entryId: string; left: number; top: number }

function formatTime(seconds: number): string {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Moving line showing what's playing: the song position, or the loop inside the selected block. */
function StripPlayhead({ layout }: { layout: ArrangementLayout }) {
  const playhead = usePlayheadStore()
  if (!playhead.isPlaying || playhead.step < 0) return null
  let steps = playhead.songStep
  if (steps < 0) {
    const placement =
      placementOf(layout, playhead.entryId) ?? layout.placements.find((p) => p.section.id === playhead.sectionId)
    if (!placement) return null
    steps = placement.start + playhead.step
  }
  return <div className={styles.playhead} style={{ transform: `translateX(${steps * PX_PER_STEP}px)` }} />
}

/** Flag marking where playback will start. */
function StartMarker({ layout }: { layout: ArrangementLayout }) {
  const entryId = useUiStore((s) => s.selectedEntryId)
  const startStep = useUiStore((s) => s.startStep)
  const placement = placementOf(layout, entryId)
  if (!placement) return null
  const x = (placement.start + Math.min(startStep, sectionSteps(placement.section) - 1)) * PX_PER_STEP
  return <div className={styles.startMarker} style={{ left: x }} title="Playback starts here" />
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const cancelled = useRef(false)
  return (
    <input
      className={styles.rename}
      defaultValue={initial}
      maxLength={MAX_NAME_LENGTH}
      autoFocus
      aria-label="Section name"
      data-no-drag
      onFocus={(e) => e.target.select()}
      onBlur={(e) => onDone(cancelled.current ? null : e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function BlockMenu({ menu, onClose, onRename }: { menu: Menu; onClose: () => void; onRename: (entryId: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, true, onClose)
  const canRemove = useSongStore((s) => s.song.arrangement.length > 1)

  const run = (action: () => void) => {
    onClose()
    action()
  }
  const selectNew = (entryId: string | null) => {
    const entry = useSongStore.getState().song.arrangement.find((e) => e.id === entryId)
    if (entry) useUiStore.getState().selectEntry(entry.id, entry.sectionId, 0)
  }

  return (
    <div ref={ref} className={styles.menu} style={{ left: menu.left, top: menu.top }} role="menu">
      <button role="menuitem" className={styles.menuItem} onClick={() => run(() => onRename(menu.entryId))}>
        Rename
      </button>
      <button
        role="menuitem"
        className={styles.menuItem}
        onClick={() => run(() => selectNew(useSongStore.getState().repeatEntry(menu.entryId)))}
      >
        Repeat
        <span className={styles.menuHint}>linked: edits apply to both</span>
      </button>
      <button
        role="menuitem"
        className={styles.menuItem}
        onClick={() => run(() => selectNew(useSongStore.getState().duplicateSection(menu.entryId)?.entryId ?? null))}
      >
        Duplicate
        <span className={styles.menuHint}>independent copy</span>
      </button>
      <button
        role="menuitem"
        className={styles.menuItem}
        disabled={!canRemove}
        onClick={() =>
          run(() => {
            const { arrangement } = useSongStore.getState().song
            const i = arrangement.findIndex((e) => e.id === menu.entryId)
            const neighbour = arrangement[i + 1] ?? arrangement[i - 1]
            if (useSongStore.getState().removeEntry(menu.entryId) && neighbour) {
              useUiStore.getState().selectEntry(neighbour.id, neighbour.sectionId, 0)
            }
          })
        }
      >
        Remove from song
      </button>
    </div>
  )
}

/** The song's sections in play order. Click a block to edit it, drag to reorder, double-click to rename. */
export function ArrangementStrip() {
  const sections = useSongStore((s) => s.song.sections)
  const arrangement = useSongStore((s) => s.song.arrangement)
  const bpm = useSongStore((s) => s.song.bpm)
  const selectedEntryId = useUiStore((s) => s.selectedEntryId)
  const selectedSectionId = useUiStore((s) => s.selectedSectionId)
  const playMode = useUiStore((s) => s.playMode)

  const layout = useMemo(() => layoutArrangement({ sections, arrangement }), [sections, arrangement])
  const uses = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of arrangement) counts.set(e.sectionId, (counts.get(e.sectionId) ?? 0) + 1)
    return counts
  }, [arrangement])

  const contentRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)

  const contentX = (clientX: number) => clientX - contentRef.current!.getBoundingClientRect().left
  /** Index of the gap (between blocks) nearest to x, for drag-reordering. */
  const gapAt = (x: number) => {
    for (const p of layout.placements) {
      if (x < (p.start + sectionSteps(p.section) / 2) * PX_PER_STEP) return p.index
    }
    return layout.placements.length
  }

  const onBlockPointerDown = (e: PointerEvent<HTMLDivElement>, placement: Placement) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-no-drag]')) return
    contentRef.current!.setPointerCapture(e.pointerId)
    drag.current = { placement, startX: e.clientX, moved: false }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || (!d.moved && Math.abs(e.clientX - d.startX) < 5)) return
    if (!d.moved) setDraggingId(d.placement.entry.id)
    d.moved = true
    setDropIndex(gapAt(contentX(e.clientX)))
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const { placement } = d
    if (d.moved) {
      setDropIndex(null)
      setDraggingId(null)
      const gap = gapAt(contentX(e.clientX))
      const to = gap > placement.index ? gap - 1 : gap
      if (to !== placement.index) useSongStore.getState().moveEntry(placement.entry.id, to)
      return
    }
    // A click selects the block and moves the start marker to the bar under the pointer.
    const localX = contentX(e.clientX) - placement.start * PX_PER_STEP
    const bar = Math.min(placement.section.bars - 1, Math.max(0, Math.floor(localX / PX_PER_BAR)))
    useUiStore.getState().selectEntry(placement.entry.id, placement.section.id, bar * STEPS_PER_BAR)
    cue(bar * STEPS_PER_BAR)
  }

  const addSection = () => {
    const { entryId, sectionId } = useSongStore.getState().addSection(null)
    useUiStore.getState().selectEntry(entryId, sectionId, 0)
    requestAnimationFrame(() => contentRef.current?.parentElement?.scrollTo({ left: 1e6, behavior: 'smooth' }))
  }

  const totalBars = layout.totalSteps / STEPS_PER_BAR

  return (
    <section className={styles.strip} aria-label="Arrangement">
      <div className={styles.head}>
        <div className={styles.headTop}>
          <span className="label">Arrangement</span>
          <span className={styles.meta} title="Song length">
            {totalBars} bar{totalBars === 1 ? '' : 's'} · {formatTime(layout.totalSteps * secondsPerStep(bpm))}
          </span>
        </div>
        <div className={styles.modes} role="group" aria-label="Playback">
          <button
            className={styles.mode}
            aria-pressed={playMode === 'section'}
            onClick={() => setPlayMode('section')}
            title="Play loops the selected section"
          >
            Loop section
          </button>
          <button
            className={styles.mode}
            aria-pressed={playMode === 'song'}
            onClick={() => setPlayMode('song')}
            title="Play runs through the whole arrangement"
          >
            Play song
          </button>
        </div>
      </div>

      <div className={styles.lane}>
        <div
          ref={contentRef}
          className={styles.content}
          style={{ width: layout.totalSteps * PX_PER_STEP }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null
            setDropIndex(null)
            setDraggingId(null)
          }}
        >
          {layout.placements.map((p) => {
            const selected = p.entry.id === selectedEntryId
            const linked = (uses.get(p.section.id) ?? 0) > 1
            const width = sectionSteps(p.section) * PX_PER_STEP
            return (
              <div
                key={p.entry.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${p.section.name}, ${p.section.bars} bars`}
                className={[
                  styles.block,
                  selected ? styles.selected : '',
                  !selected && p.section.id === selectedSectionId ? styles.sameSection : '',
                  draggingId === p.entry.id ? styles.dragging : '',
                ].join(' ')}
                style={{
                  left: p.start * PX_PER_STEP,
                  width: width - 3,
                  ['--section-color' as string]: p.section.color,
                  ['--bar' as string]: `${PX_PER_BAR}px`,
                }}
                title={
                  linked
                    ? `${p.section.name}: plays ${uses.get(p.section.id)} times. Edits apply to every copy.`
                    : `${p.section.name} (double-click to rename, drag to move)`
                }
                onPointerDown={(e) => onBlockPointerDown(e, p)}
                onDoubleClick={() => setRenaming(p.entry.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    useUiStore.getState().selectEntry(p.entry.id, p.section.id, 0)
                    cue(0)
                  }
                }}
              >
                {renaming === p.entry.id ? (
                  <RenameInput
                    initial={p.section.name}
                    onDone={(name) => {
                      if (name !== null) useSongStore.getState().renameSection(p.section.id, name)
                      setRenaming(null)
                    }}
                  />
                ) : (
                  <>
                    <span className={styles.blockName}>
                      {linked && <LinkIcon size={11} />}
                      {p.section.name}
                    </span>
                    {width >= 72 && <span className={styles.blockBars}>{p.section.bars} bars</span>}
                  </>
                )}
                {selected && renaming !== p.entry.id && (
                  <button
                    className={styles.more}
                    data-no-drag
                    aria-label={`${p.section.name} options`}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setMenu({ entryId: p.entry.id, left: rect.left, top: rect.bottom + 4 })
                    }}
                  >
                    <MoreIcon size={14} />
                  </button>
                )}
              </div>
            )
          })}
          {dropIndex !== null && (
            <div
              className={styles.dropMarker}
              style={{
                left:
                  (dropIndex < layout.placements.length ? layout.placements[dropIndex].start : layout.totalSteps) *
                    PX_PER_STEP -
                  2,
              }}
            />
          )}
          <StartMarker layout={layout} />
          <StripPlayhead layout={layout} />
        </div>
        <button className={styles.add} onClick={addSection} title="Add an empty section at the end">
          <PlusIcon size={14} /> Section
        </button>
      </div>

      {menu && <BlockMenu menu={menu} onClose={() => setMenu(null)} onRename={setRenaming} />}
    </section>
  )
}
