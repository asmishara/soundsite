import { useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { MAX_NAME_LENGTH } from '../model/rules'
import { useSaveStatus } from '../state/persistence'
import { newSong, pickSongFile, saveSongToFile } from '../state/songFiles'
import { useSongStore } from '../state/songStore'
import { AlertIcon, CheckIcon, DownloadIcon, FilePlusIcon, FolderOpenIcon } from './common/icons'
import styles from './SongPanel.module.css'

function SongName() {
  const name = useSongStore((s) => s.song.name)
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const commit = () => {
    if (draft !== null && !cancelled.current) useSongStore.getState().setName(draft)
    cancelled.current = false
    setDraft(null)
  }
  return (
    <input
      className={styles.name}
      value={draft ?? name}
      maxLength={MAX_NAME_LENGTH}
      aria-label="Song name"
      title="Song name (used as the file name when saving)"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
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

function NewSongMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, () => setOpen(false))

  const choose = (kind: 'blank' | 'demo') => {
    setOpen(false)
    newSong(kind)
  }

  return (
    <div className={styles.menuWrap} ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Start a new song">
        <FilePlusIcon size={14} /> New
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button role="menuitem" className={styles.menuItem} onClick={() => choose('blank')}>
            <span>Blank song</span>
            <span className={styles.menuHint}>Keys + drums</span>
          </button>
          <button role="menuitem" className={styles.menuItem} onClick={() => choose('demo')}>
            <span>Demo song</span>
            <span className={styles.menuHint}>4-bar loop</span>
          </button>
        </div>
      )}
    </div>
  )
}

function SaveStatus() {
  const { status, savedAt } = useSaveStatus()
  if (status === 'error') {
    return (
      <div className={`${styles.status} ${styles.statusError}`} role="status">
        <AlertIcon size={12} /> Autosave unavailable. Use Save to keep your work.
      </div>
    )
  }
  const time = savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
  return (
    <div className={styles.status} role="status" title="Your song is saved in this browser automatically">
      <CheckIcon size={12} />
      {status === 'pending' ? 'Saving…' : time ? `Autosaved ${time}` : 'Autosaves in this browser'}
    </div>
  )
}

export function SongPanel() {
  return (
    <section className={styles.panel} aria-label="Song">
      <span className="label">Song</span>
      <SongName />
      <div className={styles.actions}>
        <NewSongMenu />
        <button className="btn" onClick={pickSongFile} title="Open a song file (Ctrl+O)">
          <FolderOpenIcon size={14} /> Open
        </button>
        <button className="btn" onClick={saveSongToFile} title="Save the song as a file (Ctrl+S)">
          <DownloadIcon size={14} /> Save
        </button>
      </div>
      <SaveStatus />
    </section>
  )
}
