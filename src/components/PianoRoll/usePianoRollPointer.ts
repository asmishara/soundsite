import { useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import { engine } from '../../audio/engine'
import { findSection, sectionSteps, visibleNotes } from '../../model/arrangement'
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
  | {
      mode: 'resize'
      start: Point
      /** Each note's stored length, the part of it inside the section, and whether the drag has cut it. */
      origin: Map<string, { length: number; visible: number; cut: boolean }>
      resized: boolean
    }
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
  /** The pointer doing the current drag; other pointers (a second finger) are ignored until it ends. */
  const owner = useRef<number | null>(null)
  /** The undo transaction a move or resize drag runs in; undo closes it, which ends the drag. */
  const tx = useRef<number | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const part: PartRef = { trackId: track.id, sectionId: section.id }

  const beginEdit = () => {
    endEdit()
    tx.current = useSongStore.getState().beginTransaction()
  }
  const endEdit = () => {
    if (tx.current !== null) useSongStore.getState().endTransaction(tx.current)
    tx.current = null
  }

  const local = (e: { clientX: number; clientY: number }): Point => {
    const rect = gridRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const noteIdAt = (target: EventTarget) => (target as HTMLElement).closest<HTMLElement>('[data-note-id]')?.dataset.noteId

  const currentSection = () => findSection(useSongStore.getState().song, section.id) ?? section

  /**
   * Live notes from the store, so rapid input never acts on a stale render. Notes hidden past the
   * end of a shortened section are left out: they can't be edited, even if still selected.
   */
  const currentNotes = () => {
    const t = useSongStore.getState().song.tracks.find((t) => t.id === track.id)
    return t?.kind === 'instrument' ? visibleNotes(t, currentSection()) : []
  }

  const currentSteps = () => sectionSteps(currentSection())

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
        // Only the part of a note inside the section counts, so a note running past a shortened end
        // doesn't jump when it's grabbed.
        maxStart: total - Math.max(...notes.map((n) => n.start + Math.min(n.length, total - n.start))),
        minPitch: MIN_PITCH - Math.min(...notes.map((n) => n.pitch)),
        maxPitch: MAX_PITCH - Math.max(...notes.map((n) => n.pitch)),
      },
      lastPitch: anchor.pitch,
    }
  }

  const deleteAt = (id: string) => {
    const { selectedNoteIds, setSelection } = useUiStore.getState()
    const editable = new Set(currentNotes().map((n) => n.id))
    const ids = (selectedNoteIds.includes(id) ? selectedNoteIds : [id]).filter((x) => editable.has(x))
    useSongStore.getState().deleteNotes(part, ids)
    setSelection(selectedNoteIds.filter((x) => !ids.includes(x)))
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // One gesture at a time: a second finger mustn't start another edit over the first.
    if (!e.isPrimary || drag.current) return
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
    owner.current = e.pointerId

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

      beginEdit()
      if ((e.target as HTMLElement).dataset.handle === 'resize') {
        // Resize from what's on screen, so a note running past a shortened end follows the group.
        const total = currentSteps()
        const origin = new Map(
          notes
            .filter((n) => selection.includes(n.id))
            .map((n) => [n.id, { length: n.length, visible: Math.min(n.length, total - n.start), cut: false }]),
        )
        drag.current = { mode: 'resize', start: p, origin, resized: false }
      } else {
        startMove(p, noteId, selection)
      }
      return
    }

    if (ui.tool === 'draw' && !e.shiftKey) {
      const step = Math.floor(p.x / zoom / ui.snap) * ui.snap
      const { pitches, chord } = pitchesToPlace(yToPitch(p.y), store.song.key, ui)
      if (pitches.length === 0) return
      beginEdit()
      const ids = store.addNotes(
        part,
        pitches.map((pitch) => ({ pitch, start: step, length: ui.noteLength, velocity: 0.8 })),
      )
      if (ids.length === 0) {
        endEdit()
        return
      }
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
    if (!d || e.pointerId !== owner.current) return
    const store = useSongStore.getState()
    if (d.mode !== 'marquee' && (tx.current === null || !store.isTransactionOpen(tx.current))) {
      // Undo ran mid-drag and closed the transaction; the notes being dragged may be gone, so stop here.
      drag.current = null
      tx.current = null
      return
    }
    const p = local(e)
    const { snap, snapToScale: scaleSnap } = useUiStore.getState()

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
        // Back off until every note in the group stays in range, so chords don't pile up at the edge.
        const origins = [...d.origin.values()]
        const fits = (n: number) =>
          origins.every((o) => {
            const moved = moveByScaleSteps(o.pitch, n, key)
            return moved >= MIN_PITCH && moved <= MAX_PITCH
          })
        let steps = scaleStepsBetween(anchorPitch, target, key)
        while (steps !== 0 && !fits(steps)) steps -= Math.sign(steps)
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
      // A click or jitter on the handle changes nothing.
      if (dLength === 0 && !d.resized) return
      d.resized = true
      const patches: Record<string, NotePatch> = {}
      for (const [id, o] of d.origin) {
        const length = Math.max(Math.min(snap, o.visible), o.visible + dLength)
        // A tail hidden past a shortened end is only given up once the note is actually shortened.
        if (o.length > o.visible && length >= o.visible && !o.cut) continue
        if (length < o.visible) o.cut = true
        patches[id] = { length }
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
      const steps = currentSteps()
      const hits = currentNotes()
        .filter((n: Note) => {
          if (n.start >= steps) return false // hidden past the end of a shortened section
          const x0 = n.start * zoom
          const x1 = (n.start + n.length) * zoom
          const y0 = pitchToY(n.pitch)
          return x1 > box.left && x0 < box.left + box.width && y0 + ROW_HEIGHT > box.top && y0 < box.top + box.height
        })
        .map((n) => n.id)
      useUiStore.getState().setSelection([...new Set([...d.base, ...hits])])
    }
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== owner.current) return
    const d = drag.current
    drag.current = null
    owner.current = null
    if (!d) return
    if (d.mode === 'marquee') {
      if (!d.moved && d.base.length === 0) useUiStore.getState().setSelection([])
      setMarquee(null)
    } else {
      endEdit()
    }
  }

  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const noteId = noteIdAt(e.target)
    if (noteId) deleteAt(noteId)
  }

  const onContextMenu = (e: MouseEvent) => e.preventDefault()

  return {
    marquee,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onLostPointerCapture: onPointerUp,
      onDoubleClick,
      onContextMenu,
    },
  }
}
