import { useLayoutEffect, useMemo, useRef } from 'react'
import { keyPrefersFlats } from '../../model/music'
import { STEPS_PER_BAR, type InstrumentTrack } from '../../model/types'
import { useFollowPlayhead } from '../../hooks/useFollowPlayhead'
import { getTrack, useSongStore } from '../../state/songStore'
import { useUiStore } from '../../state/uiStore'
import { GridBackground } from './GridBackground'
import { GhostNote, NoteBlock } from './NoteBlock'
import { PianoKeys } from './PianoKeys'
import { Playhead } from './Playhead'
import { Ruler } from './Ruler'
import { KEYS_WIDTH, ROW_COUNT, ROW_HEIGHT, RULER_HEIGHT, pitchToY } from './layout'
import { usePianoRollPointer } from './usePianoRollPointer'
import styles from './PianoRoll.module.css'

export function PianoRoll({ track }: { track: InstrumentTrack }) {
  const zoom = useUiStore((s) => s.zoom)
  const tool = useUiStore((s) => s.tool)
  const selectedIds = useUiStore((s) => s.selectedNoteIds)
  const bars = useSongStore((s) => s.song.bars)
  const songKey = useSongStore((s) => s.song.key)
  const tracks = useSongStore((s) => s.song.tracks)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const { marquee, handlers } = usePianoRollPointer(gridRef, track, zoom)

  const width = bars * STEPS_PER_BAR * zoom
  const height = ROW_COUNT * ROW_HEIGHT
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const preferFlats = keyPrefersFlats(songKey)
  const ghostTracks = tracks.filter((t): t is InstrumentTrack => t.kind === 'instrument' && t.id !== track.id)

  // When switching tracks, scroll so the track's notes (or middle C) are in view.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    // Read notes from the store so this only runs on track switch, not on every note edit.
    const current = getTrack(useSongStore.getState().song, track.id)
    const notes = current?.kind === 'instrument' ? current.notes : []
    const pitches = notes.map((n) => n.pitch).sort((a, b) => a - b)
    const center = pitches.length ? pitches[Math.floor(pitches.length / 2)] : 66
    el.scrollTop = pitchToY(center) + RULER_HEIGHT - el.clientHeight / 2
    el.scrollLeft = 0
  }, [track.id])

  useFollowPlayhead(scrollerRef, zoom, KEYS_WIDTH)

  return (
    <div className={styles.roll}>
      <div className={styles.scroller} ref={scrollerRef}>
        <div className={styles.inner} style={{ width: KEYS_WIDTH + width }}>
          <div className={styles.header} style={{ height: RULER_HEIGHT }}>
            <div className={styles.corner} style={{ width: KEYS_WIDTH }} />
            <div className={styles.ruler} style={{ width }}>
              <Ruler bars={bars} zoom={zoom} />
              <Playhead zoom={zoom} variant="marker" />
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
                t.notes.map((n) => <GhostNote key={n.id} note={n} zoom={zoom} color={t.color} />),
              )}
              {track.notes.map((n) => (
                <NoteBlock
                  key={n.id}
                  note={n}
                  zoom={zoom}
                  color={track.color}
                  selected={selected.has(n.id)}
                  preferFlats={preferFlats}
                />
              ))}
              <Playhead zoom={zoom} />
              {marquee && <div className={styles.marquee} style={marquee} />}
            </div>
          </div>
        </div>
      </div>
      {track.notes.length === 0 && (
        <div className={styles.emptyHint}>
          {tool === 'draw' ? 'Click the grid to draw notes' : 'Switch to the Draw tool (D) to add notes'}
        </div>
      )}
    </div>
  )
}
