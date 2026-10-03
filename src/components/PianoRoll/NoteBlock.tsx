import { memo } from 'react'
import { midiToName } from '../../model/music'
import type { Note } from '../../model/types'
import { ROW_HEIGHT, pitchToY } from './layout'
import styles from './PianoRoll.module.css'

type NoteBlockProps = {
  note: Note
  zoom: number
  color: string
  selected: boolean
  preferFlats: boolean
}

export const NoteBlock = memo(function NoteBlock({ note, zoom, color, selected, preferFlats }: NoteBlockProps) {
  const width = note.length * zoom
  return (
    <div
      data-note-id={note.id}
      className={`${styles.note} ${selected ? styles.noteSelected : ''}`}
      style={{
        left: note.start * zoom,
        top: pitchToY(note.pitch),
        width: width - 1,
        height: ROW_HEIGHT - 1,
        ['--note-color' as string]: color,
        ['--note-alpha' as string]: 0.55 + note.velocity * 0.45,
      }}
      title={`${midiToName(note.pitch, preferFlats)} · velocity ${Math.round(note.velocity * 100)}%`}
    >
      {width >= 30 && <span className={styles.noteLabel}>{midiToName(note.pitch, preferFlats)}</span>}
      <div data-handle="resize" className={styles.resizeHandle} />
    </div>
  )
})

export const GhostNote = memo(function GhostNote({ note, zoom, color }: { note: Note; zoom: number; color: string }) {
  return (
    <div
      className={styles.ghost}
      style={{
        left: note.start * zoom,
        top: pitchToY(note.pitch),
        width: note.length * zoom - 1,
        height: ROW_HEIGHT - 1,
        background: color,
      }}
    />
  )
})
