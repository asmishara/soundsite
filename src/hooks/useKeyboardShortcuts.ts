import { useEffect } from 'react'
import { togglePlay } from '../audio/scheduler'
import { findSection, partNotes, sectionSteps } from '../model/arrangement'
import { moveByScaleSteps } from '../model/music'
import { MAX_PITCH, MIN_PITCH, type InstrumentTrack } from '../model/types'
import { pickSongFile, saveSongToFile } from '../state/songFiles'
import { getTrack, useSongStore } from '../state/songStore'
import { useUiStore } from '../state/uiStore'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
}

/** Global editor shortcuts. Ignored while typing in a form field. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      // File shortcuts work everywhere and replace the browser's own Save page / Open file.
      if (mod && !e.shiftKey && !e.altKey && (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'o')) {
        e.preventDefault()
        // Blurring commits any half-typed field (e.g. the song name) before saving.
        if (document.activeElement instanceof HTMLElement && isTyping(document.activeElement)) {
          document.activeElement.blur()
        }
        if (e.key.toLowerCase() === 's') saveSongToFile()
        else pickSongFile()
        return
      }
      if (isTyping(e.target)) return
      const songStore = useSongStore.getState()
      const ui = useUiStore.getState()
      const track = getTrack(songStore.song, ui.selectedTrackId)
      const section = findSection(songStore.song, ui.selectedSectionId)
      const instrument = track?.kind === 'instrument' && section ? (track as InstrumentTrack) : null
      const part = instrument && section ? { trackId: instrument.id, sectionId: section.id } : null
      const partNoteList = instrument && section ? partNotes(instrument, section.id) : []
      const selected = ui.selectedNoteIds
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

        if (!part || !section) return false

        if (mod && k === 'a') {
          ui.setSelection(partNoteList.map((n) => n.id))
          return true
        }
        if (selected.length === 0) return false

        if (e.key === 'Delete' || e.key === 'Backspace') {
          songStore.deleteNotes(part, selected)
          ui.setSelection([])
          return true
        }
        if (mod && k === 'd') {
          ui.setSelection(songStore.duplicateNotes(part, selected))
          return true
        }

        const notes = partNoteList.filter((n) => selected.includes(n.id))
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
          if (notes.every((n) => n.start + delta >= 0 && n.start + n.length + delta <= total)) {
            songStore.transformNotes(part, selected, (n) => ({ start: n.start + delta }))
          }
          return true
        }
        return false
      })()

      if (handled) e.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
