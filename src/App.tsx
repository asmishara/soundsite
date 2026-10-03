import { useEffect } from 'react'
import styles from './App.module.css'
import { ArrangementStrip } from './components/Arrangement/ArrangementStrip'
import { EditorToolbar } from './components/EditorToolbar'
import { Mixer } from './components/Mixer/Mixer'
import { Notice } from './components/Notice'
import { PianoRoll } from './components/PianoRoll/PianoRoll'
import { SongPanel } from './components/SongPanel'
import { StepSequencer } from './components/StepSequencer/StepSequencer'
import { TrackList } from './components/TrackList'
import { TransportBar } from './components/TransportBar'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSongFileDrop } from './hooks/useSongFileDrop'
import { findSection } from './model/arrangement'
import { getTrack, useSongStore } from './state/songStore'
import { useUiStore } from './state/uiStore'

function Editor() {
  const selectedTrackId = useUiStore((s) => s.selectedTrackId)
  const selectedSectionId = useUiStore((s) => s.selectedSectionId)
  const track = useSongStore((s) => getTrack(s.song, selectedTrackId))
  const section = useSongStore((s) => findSection(s.song, selectedSectionId))

  if (!track || !section) {
    return (
      <div className={styles.placeholder}>
        <p>Add a track to start composing.</p>
      </div>
    )
  }

  return (
    <>
      <EditorToolbar track={track} section={section} />
      {track.kind === 'instrument' ? (
        <PianoRoll track={track} section={section} />
      ) : (
        <StepSequencer track={track} section={section} />
      )}
    </>
  )
}

export default function App() {
  const tracks = useSongStore((s) => s.song.tracks)
  const arrangement = useSongStore((s) => s.song.arrangement)
  const songName = useSongStore((s) => s.song.name)
  const selectedTrackId = useUiStore((s) => s.selectedTrackId)
  const selectedEntryId = useUiStore((s) => s.selectedEntryId)
  const selectedSectionId = useUiStore((s) => s.selectedSectionId)
  const draggingFile = useSongFileDrop()

  useKeyboardShortcuts()

  useEffect(() => {
    document.title = `${songName} · Soundsite`
  }, [songName])

  // Keep a valid track selected (on load, and after the selected track is deleted or undone away).
  useEffect(() => {
    if (!tracks.some((t) => t.id === selectedTrackId)) {
      useUiStore.getState().selectTrack(tracks[0]?.id ?? null)
    }
  }, [tracks, selectedTrackId])

  // Likewise keep a valid arrangement block selected, preferring one that plays the same section.
  useEffect(() => {
    const entry = arrangement.find((e) => e.id === selectedEntryId)
    if (entry && entry.sectionId === selectedSectionId) return
    const next = arrangement.find((e) => e.sectionId === selectedSectionId) ?? arrangement[0]
    if (next) useUiStore.getState().selectEntry(next.id, next.sectionId)
  }, [arrangement, selectedEntryId, selectedSectionId])

  return (
    <div className={styles.app}>
      <TransportBar />
      <ArrangementStrip />
      <div className={styles.main}>
        <aside className={styles.sidebar}>
          <SongPanel />
          <TrackList />
        </aside>
        <main className={styles.editor}>
          <Editor />
        </main>
      </div>
      <Mixer />
      <Notice />
      {draggingFile && (
        <div className={styles.dropOverlay}>
          <div className={styles.dropMessage}>Drop a song file to open it</div>
        </div>
      )}
    </div>
  )
}
