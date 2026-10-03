import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFollowPlayhead } from '../../hooks/useFollowPlayhead'
import { partNotes } from '../../model/arrangement'
import { keyPrefersFlats } from '../../model/music'
import { STEPS_PER_BAR, type InstrumentTrack, type Section } from '../../model/types'
import { getTrack, useSongStore } from '../../state/songStore'
import { useUiStore } from '../../state/uiStore'
import { GridBackground } from './GridBackground'
import { GhostNote, NoteBlock } from './NoteBlock'
import { PianoKeys } from './PianoKeys'
import { Playhead } from './Playhead'
import { LoopShade, Ruler } from './Ruler'
import { KEYS_WIDTH, ROW_COUNT, ROW_HEIGHT, RULER_HEIGHT, pitchToY } from './layout'
import { usePianoRollPointer } from './usePianoRollPointer'
import styles from './PianoRoll.module.css'

/** Note editor for one instrument track within one section. */
export function PianoRoll({ track, section }: { track: InstrumentTrack; section: Section }) {
  const zoom = useUiStore((s) => s.zoom)
  const tool = useUiStore((s) => s.tool)
  const selectedIds = useUiStore((s) => s.selectedNoteIds)
  const songKey = useSongStore((s) => s.song.key)
  const tracks = useSongStore((s) => s.song.tracks)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const { marquee, handlers } = usePianoRollPointer(gridRef, track, section, zoom)

  const notes = partNotes(track, section.id)
  const width = section.bars * STEPS_PER_BAR * zoom
  const height = ROW_COUNT * ROW_HEIGHT
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const preferFlats = keyPrefersFlats(songKey)
  const ghostTracks = tracks.filter((t): t is InstrumentTrack => t.kind === 'instrument' && t.id !== track.id)

  // When switching track or section, scroll so the notes (or middle C) are in view.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    // Read notes from the store so this only runs on a switch, not on every note edit.
    const current = getTrack(useSongStore.getState().song, track.id)
    const pitches = (current?.kind === 'instrument' ? partNotes(current, section.id) : [])
      .map((n) => n.pitch)
      .sort((a, b) => a - b)
    const center = pitches.length ? pitches[Math.floor(pitches.length / 2)] : 66
    el.scrollTop = pitchToY(center) + RULER_HEIGHT - el.clientHeight / 2
    el.scrollLeft = 0
  }, [track.id, section.id])

  useFollowPlayhead(scrollerRef, zoom, KEYS_WIDTH, section.id)

  return (
    <div className={styles.roll}>
      <div className={styles.scroller} ref={scrollerRef}>
        <div className={styles.inner} style={{ width: KEYS_WIDTH + width }}>
          <div className={styles.header} style={{ height: RULER_HEIGHT }}>
            <div className={styles.corner} style={{ width: KEYS_WIDTH }} />
            <div className={styles.ruler} style={{ width }}>
              <Ruler bars={section.bars} zoom={zoom} sectionId={section.id} />
              <Playhead zoom={zoom} sectionId={section.id} variant="marker" />
            </div>
          </div>
          <div className={styles.body}>
            <PianoKeys trackId={track.id} songKey={songKey} />
            <div
              ref={gridRef}
              className={`${styles.grid} ${tool === 'select' ? styles.gridSelect : ''}`}
              style={{ width, height }}
              {...handlers}
            >
              <GridBackground songKey={songKey} zoom={zoom} />
              {ghostTracks.map((t) =>
                partNotes(t, section.id).map((n) => <GhostNote key={n.id} note={n} zoom={zoom} color={t.color} />),
              )}
              {notes.map((n) => (
                <NoteBlock
                  key={n.id}
                  note={n}
                  zoom={zoom}
                  color={track.color}
                  selected={selected.has(n.id)}
                  preferFlats={preferFlats}
                />
              ))}
              <LoopShade sectionId={section.id} zoom={zoom} steps={section.bars * STEPS_PER_BAR} />
              <Playhead zoom={zoom} sectionId={section.id} />
              {marquee && <div className={styles.marquee} style={marquee} />}
            </div>
          </div>
        </div>
      </div>
      {notes.length === 0 && (
        <div className={styles.emptyHint}>
          {tool === 'draw' ? 'Click the grid to draw notes' : 'Switch to the Draw tool (D) to add notes'}
        </div>
      )}
    </div>
  )
}
