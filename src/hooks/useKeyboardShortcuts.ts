import { useEffect } from 'react'
import { togglePlay } from '../audio/scheduler'
import { findSection, sectionSteps, visibleNotes } from '../model/arrangement'
import { moveByScaleSteps } from '../model/music'
import { MAX_PITCH, MIN_PITCH, type InstrumentTrack } from '../model/types'
import { pickSongFile, saveSongToFile } from '../state/songFiles'
import { getTrack, useSongStore } from '../state/songStore'
import { useUiStore } from '../state/uiStore'
import { focusedByPointer, pointerIsDown, trackFocusOrigin } from './focusOrigin'

const NON_TEXT_INPUTS = ['range', 'checkbox', 'radio', 'color', 'button']

/** Fields that keys type into. Every shortcut but Save and Open is left to them. */
function isTextEntry(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true
  return el instanceof HTMLInputElement && !NON_TEXT_INPUTS.includes(el.type)
}

const ACTIVATES_ON_SPACE =
  'button, [role="button"], [role="menuitem"], [role="tab"], [role="radio"], summary, a[href], input[type="checkbox"], input[type="radio"], input[type="color"]'
/** Controls whose value the arrow keys (and, for a dropdown, letters) change. */
const VALUE_CONTROLS = 'select, input[type="range"], [role="slider"]'
const NAVIGATION_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']

/**
 * Whether a control reached with the keyboard uses this key itself: Space presses a button, arrows
 * move a slider, and a dropdown takes every plain key. A control that was clicked doesn't, so Space
 * still plays and stops the song after a mouse click.
 */
function keyBelongsToControl(el: Element | null, e: KeyboardEvent): boolean {
  if (!el || focusedByPointer(el)) return false
  if (e.key === ' ' && el.matches(ACTIVATES_ON_SPACE)) return true
  if (el instanceof HTMLSelectElement) return !e.ctrlKey && !e.metaKey
  return el.matches(VALUE_CONTROLS) && NAVIGATION_KEYS.includes(e.key)
}

/**
 * A dropdown or slider that was clicked keeps focus, and would also react to keys meant for the
 * editor (an arrow quietly changes its value). These are the keys to keep from it. Browser keys such
 * as F5 and Alt+Left are left alone, except where a slider would take them anyway: it steps on
 * navigation keys whatever modifiers are held (Ctrl+End jumps to its maximum).
 */
function isClickedControlKey(el: Element | null, e: KeyboardEvent): boolean {
  if (!(el instanceof HTMLElement) || !el.matches(VALUE_CONTROLS) || !focusedByPointer(el)) return false
  if (el instanceof HTMLInputElement && el.type === 'range' && NAVIGATION_KEYS.includes(e.key)) return true
  if (e.ctrlKey || e.metaKey || e.altKey) return false
  return (
    NAVIGATION_KEYS.includes(e.key) ||
    e.key === ' ' ||
    e.key === 'Enter' ||
    (el instanceof HTMLSelectElement && e.key.length === 1)
  )
}

/** Global editor shortcuts. Ignored while typing in a form field. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const stopTracking = trackFocusOrigin()
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const focus = document.activeElement
      // File shortcuts work everywhere and replace the browser's own Save page / Open file.
      if (mod && !e.shiftKey && !e.altKey && (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'o')) {
        e.preventDefault()
        // Blurring commits any half-typed field (e.g. the song name) before saving.
        if (focus instanceof HTMLElement && isTextEntry(focus)) focus.blur()
        if (e.key.toLowerCase() === 's') saveSongToFile()
        else pickSongFile()
        return
      }
      // Keys a focused control already handled or uses itself, and typing in a field, aren't editor
      // shortcuts. (A field that handles Escape by blurring has lost focus by now, but is still the target.)
      if (e.defaultPrevented || isTextEntry(e.target) || isTextEntry(focus) || keyBelongsToControl(focus, e)) return
      // Keep the key from a clicked control and hand focus back to the page, unless the control is
      // still being dragged (blurring a slider would end the drag's undo step).
      const clickedControl = isClickedControlKey(focus, e)
      const releaseControl = () => {
        e.preventDefault()
        if (!pointerIsDown()) (focus as HTMLElement).blur()
      }
      // No editor shortcut uses Alt; Alt combinations (Alt+Left is Back) belong to the browser.
      if (e.altKey) {
        if (clickedControl) releaseControl()
        return
      }
      const songStore = useSongStore.getState()
      const ui = useUiStore.getState()
      const track = getTrack(songStore.song, ui.selectedTrackId)
      const section = findSection(songStore.song, ui.selectedSectionId)
      const instrument = track?.kind === 'instrument' && section ? (track as InstrumentTrack) : null
      const part = instrument && section ? { trackId: instrument.id, sectionId: section.id } : null
      // Notes hidden past the end of a shortened section can't be edited, even if they were selected
      // before the section got shorter.
      const editable = instrument && section ? visibleNotes(instrument, section) : []
      const editableIds = new Set(editable.map((n) => n.id))
      const selected = ui.selectedNoteIds.filter((id) => editableIds.has(id))
      const k = e.key.toLowerCase()

      const handled = (() => {
        if (e.key === ' ') {
          togglePlay()
          return true
        }
        if (mod && k === 'z') {
          if (e.shiftKey) songStore.redo()
          else songStore.undo()
          return true
        }
        if (mod && k === 'y') {
          songStore.redo()
          return true
        }
        if (e.key === 'Escape') {
          ui.setSelection([])
          return true
        }
        if (!mod && k === 'd') {
          ui.setTool('draw')
          return true
        }
        if (!mod && k === 's') {
          ui.setTool('select')
          return true
        }

        // Always claim Ctrl+D, even with nothing to duplicate, so the browser doesn't open its bookmark dialog.
        if (mod && k === 'd') {
          if (part && selected.length > 0) ui.setSelection(songStore.duplicateNotes(part, selected))
          return true
        }

        if (!part || !section) return false

        if (mod && k === 'a') {
          ui.setSelection(editable.map((n) => n.id))
          return true
        }
        if (selected.length === 0) return false

        if (e.key === 'Delete' || e.key === 'Backspace') {
          songStore.deleteNotes(part, selected)
          ui.setSelection([])
          return true
        }

        const notes = editable.filter((n) => selected.includes(n.id))
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          const dir = e.key === 'ArrowUp' ? 1 : -1
          const key = songStore.song.key
          const transpose = (p: number) =>
            e.shiftKey ? p + 12 * dir : ui.snapToScale ? moveByScaleSteps(p, dir, key) : p + dir
          // Move the group only if every note stays in range, so chords keep their shape.
          if (notes.every((n) => transpose(n.pitch) >= MIN_PITCH && transpose(n.pitch) <= MAX_PITCH)) {
            songStore.transformNotes(part, selected, (n) => ({ pitch: transpose(n.pitch) }))
          }
          return true
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const delta = (e.key === 'ArrowRight' ? 1 : -1) * ui.snap
          const total = sectionSteps(section)
          // Only the part of a note inside the section counts, so a note running past a shortened end can still move left.
          const visibleEnd = (n: (typeof notes)[number]) => n.start + Math.min(n.length, total - n.start)
          if (notes.every((n) => n.start + delta >= 0 && visibleEnd(n) + delta <= total)) {
            songStore.transformNotes(part, selected, (n) => ({ start: n.start + delta }))
          }
          return true
        }
        return false
      })()

      if (clickedControl) releaseControl()
      else if (handled) e.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      stopTracking()
    }
  }, [])
}
