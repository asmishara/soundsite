import { useEffect } from 'react'
import styles from './App.module.css'
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
import { getTrack, useSongStore } from './state/songStore'
import { useUiStore } from './state/uiStore'

function Editor() {
  const selectedTrackId = useUiStore((s) => s.selectedTrackId)
  const track = useSongStore((s) => getTrack(s.song, selectedTrackId))

  if (!track) {
    return (
      <div className={styles.placeholder}>
        <p>Add a track to start composing.</p>
      </div>
    )
  }

  return (
    <>
      <EditorToolbar track={track} />
      {track.kind === 'instrument' ? <PianoRoll track={track} /> : <StepSequencer track={track} />}
    </>
  )
}

export default function App() {
  const tracks = useSongStore((s) => s.song.tracks)
  const songName = useSongStore((s) => s.song.name)
  const selectedTrackId = useUiStore((s) => s.selectedTrackId)
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

  return (
    <div className={styles.app}>
      <TransportBar />
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
