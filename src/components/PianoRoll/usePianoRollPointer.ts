import { useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import { engine } from '../../audio/engine'
import { findSection, partNotes, sectionSteps } from '../../model/arrangement'
import { moveByScaleSteps, scaleStepsBetween, snapToScale } from '../../model/music'
import { MAX_PITCH, MIN_PITCH, type InstrumentTrack, type Note, type Section } from '../../model/types'
import { useSongStore, type NotePatch, type PartRef } from '../../state/songStore'
import { useUiStore } from '../../state/uiStore'
import { ROW_HEIGHT, pitchToY, yToPitch } from './layout'
import { pitchesToPlace } from './placement'

type Point = { x: number; y: number }

type Drag =
  | {
      mode: 'move'
      start: Point
      anchorId: string
      origin: Map<string, { start: number; pitch: number }>
      /** Allowed deltas that keep the whole group inside the grid */
      bounds: { minStart: number; maxStart: number; minPitch: number; maxPitch: number }
      lastPitch: number
    }
  | { mode: 'resize'; start: Point; origin: Map<string, number> }
  | { mode: 'marquee'; start: Point; base: string[]; moved: boolean }

export type Marquee = { left: number; top: number; width: number; height: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** All mouse interaction on the note grid: draw, move, resize, delete and box-select. */
export function usePianoRollPointer(
  gridRef: RefObject<HTMLDivElement | null>,
  track: InstrumentTrack,
  section: Section,
  zoom: number,
) {
  const drag = useRef<Drag | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const part: PartRef = { trackId: track.id, sectionId: section.id }

  const local = (e: { clientX: number; clientY: number }): Point => {
    const rect = gridRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const noteIdAt = (target: EventTarget) => (target as HTMLElement).closest<HTMLElement>('[data-note-id]')?.dataset.noteId

  /** Live notes from the store, so rapid input never acts on a stale render. */
  const currentNotes = () => {
    const t = useSongStore.getState().song.tracks.find((t) => t.id === track.id)
    return t?.kind === 'instrument' ? partNotes(t, section.id) : []
  }

  const currentSteps = () => {
    const live = findSection(useSongStore.getState().song, section.id)
    return live ? sectionSteps(live) : sectionSteps(section)
  }

  const startMove = (start: Point, anchorId: string, ids: string[]) => {
    const notes = currentNotes().filter((n) => ids.includes(n.id))
    const anchor = notes.find((n) => n.id === anchorId)
    if (!anchor) return
    const total = currentSteps()
    drag.current = {
      mode: 'move',
      start,
      anchorId,
      origin: new Map(notes.map((n) => [n.id, { start: n.start, pitch: n.pitch }])),
      bounds: {
        minStart: -Math.min(...notes.map((n) => n.start)),
        maxStart: total - Math.max(...notes.map((n) => n.start + n.length)),
        minPitch: MIN_PITCH - Math.min(...notes.map((n) => n.pitch)),
        maxPitch: MAX_PITCH - Math.max(...notes.map((n) => n.pitch)),
      },
      lastPitch: anchor.pitch,
    }
  }

  const deleteAt = (id: string) => {
    const { selectedNoteIds, setSelection } = useUiStore.getState()
    const ids = selectedNoteIds.includes(id) ? selectedNoteIds : [id]
    useSongStore.getState().deleteNotes(part, ids)
    setSelection(selectedNoteIds.filter((x) => !ids.includes(x)))
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const p = local(e)
    const noteId = noteIdAt(e.target)
    const ui = useUiStore.getState()
    const store = useSongStore.getState()

    if (e.button === 2) {
      if (noteId) deleteAt(noteId)
      return
    }
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)

    if (noteId) {
      let selection = ui.selectedNoteIds
      if (e.shiftKey) {
        selection = selection.includes(noteId) ? selection.filter((x) => x !== noteId) : [...selection, noteId]
        ui.setSelection(selection)
        if (!selection.includes(noteId)) return
      } else if (!selection.includes(noteId)) {
        selection = [noteId]
        ui.setSelection(selection)
      }
      const notes = currentNotes()
      const note = notes.find((n) => n.id === noteId)
      if (note) void engine.preview(track.id, note.pitch, note.velocity)

      store.beginTransaction()
      if ((e.target as HTMLElement).dataset.handle === 'resize') {
        const origin = new Map(notes.filter((n) => selection.includes(n.id)).map((n) => [n.id, n.length]))
        drag.current = { mode: 'resize', start: p, origin }
      } else {
        startMove(p, noteId, selection)
      }
      return
    }

    if (ui.tool === 'draw' && !e.shiftKey) {
      const step = Math.floor(p.x / zoom / ui.snap) * ui.snap
      const { pitches, chord } = pitchesToPlace(yToPitch(p.y), store.song.key, ui)
      if (pitches.length === 0) return
      store.beginTransaction()
      const ids = store.addNotes(
        part,
        pitches.map((pitch) => ({ pitch, start: step, length: ui.noteLength, velocity: 0.8 })),
      )
      ui.setSelection(ids)
      ui.setLastChord(chord)
      pitches.forEach((pitch) => void engine.preview(track.id, pitch))
      // Dragging right after placing moves the new note(s).
      startMove(p, ids[0], ids)
      return
    }

    drag.current = { mode: 'marquee', start: p, base: e.shiftKey ? ui.selectedNoteIds : [], moved: false }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const p = local(e)
    const { snap, snapToScale: scaleSnap } = useUiStore.getState()
    const store = useSongStore.getState()

    if (d.mode === 'move') {
      const dStart = clamp(Math.round((p.x - d.start.x) / zoom / snap) * snap, d.bounds.minStart, d.bounds.maxStart)
      const rows = Math.round((d.start.y - p.y) / ROW_HEIGHT)
      const key = store.song.key
      let movePitch: (pitch: number) => number
      if (scaleSnap && key.scale !== 'chromatic') {
        const anchorPitch = d.origin.get(d.anchorId)!.pitch
        // Snap in the direction of travel so a one-row drag onto an out-of-key row still moves the note.
        const direction = rows > 0 ? 'up' : rows < 0 ? 'down' : 'nearest'
        const target = snapToScale(clamp(anchorPitch + rows, MIN_PITCH, MAX_PITCH), key, direction)
        const steps = scaleStepsBetween(anchorPitch, target, key)
        movePitch = (pitch) => moveByScaleSteps(pitch, steps, key)
      } else {
        const dPitch = clamp(rows, d.bounds.minPitch, d.bounds.maxPitch)
        movePitch = (pitch) => pitch + dPitch
      }

      const patches: Record<string, NotePatch> = {}
      for (const [id, o] of d.origin) patches[id] = { start: o.start + dStart, pitch: movePitch(o.pitch) }
      store.updateNotes(part, patches)

      const anchorPitch = patches[d.anchorId].pitch!
      if (anchorPitch !== d.lastPitch) {
        d.lastPitch = anchorPitch
        void engine.preview(track.id, anchorPitch)
      }
    } else if (d.mode === 'resize') {
      const dLength = Math.round((p.x - d.start.x) / zoom / snap) * snap
      const patches: Record<string, NotePatch> = {}
      for (const [id, length] of d.origin) {
        patches[id] = { length: Math.max(Math.min(snap, length), length + dLength) }
      }
      store.updateNotes(part, patches)
    } else {
      const box = {
        left: Math.min(d.start.x, p.x),
        top: Math.min(d.start.y, p.y),
        width: Math.abs(p.x - d.start.x),
        height: Math.abs(p.y - d.start.y),
      }
      if (box.width + box.height > 4) d.moved = true
      if (!d.moved) return
      setMarquee(box)
      const hits = currentNotes()
        .filter((n: Note) => {
          const x0 = n.start * zoom
          const x1 = (n.start + n.length) * zoom
          const y0 = pitchToY(n.pitch)
          return x1 > box.left && x0 < box.left + box.width && y0 + ROW_HEIGHT > box.top && y0 < box.top + box.height
        })
        .map((n) => n.id)
      useUiStore.getState().setSelection([...new Set([...d.base, ...hits])])
    }
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.mode === 'marquee') {
      if (!d.moved && d.base.length === 0) useUiStore.getState().setSelection([])
      setMarquee(null)
    } else {
      useSongStore.getState().endTransaction()
    }
  }

  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const noteId = noteIdAt(e.target)
    if (noteId) deleteAt(noteId)
  }

  const onContextMenu = (e: MouseEvent) => e.preventDefault()

  return {
    marquee,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick, onContextMenu },
  }
}
