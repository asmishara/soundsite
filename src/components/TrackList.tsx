import { useEffect, useRef, useState } from 'react'
import { INSTRUMENT_PRESETS, INSTRUMENT_PRESET_IDS } from '../model/presets'
import type { Track } from '../model/types'
import { useDismiss } from '../hooks/useDismiss'
import { useSongStore } from '../state/songStore'
import { useUiStore } from '../state/uiStore'
import { ChevronDownIcon, ChevronUpIcon, DrumIcon, KeysIcon, PlusIcon, TrashIcon } from './common/icons'
import styles from './TrackList.module.css'

/** Previews the color live while the picker is open and commits once (one undo step) when it closes. */
function ColorSwatch({ color, label, onCommit }: { color: string; label: string; onCommit: (color: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  })

  useEffect(() => {
    const input = ref.current
    if (!input) return
    // React's onChange fires on every input event; the native change event fires once when the picker closes.
    const onChange = () => {
      commit.current(input.value)
      setPreview(null)
    }
    input.addEventListener('change', onChange)
    return () => input.removeEventListener('change', onChange)
  }, [])

  return (
    <label
      className={styles.swatch}
      style={{ background: preview ?? color }}
      title="Track color"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input ref={ref} type="color" value={preview ?? color} onChange={(e) => setPreview(e.target.value)} aria-label={label} />
    </label>
  )
}

function TrackRow({ track, index, count }: { track: Track; index: number; count: number }) {
  const selected = useUiStore((s) => s.selectedTrackId === track.id)
  const [editing, setEditing] = useState(false)
  const { setMixer, updateTrack, removeTrack, moveTrack } = useSongStore.getState()

  const subtitle =
    track.kind === 'drums'
      ? 'Drum kit'
      : `${INSTRUMENT_PRESETS[track.preset].label} · ${track.notes.length} note${track.notes.length === 1 ? '' : 's'}`

  return (
    <li
      className={`${styles.row} ${selected ? styles.selected : ''}`}
      style={{ ['--track-color' as string]: track.color }}
      onPointerDown={() => useUiStore.getState().selectTrack(track.id)}
    >
      <ColorSwatch
        color={track.color}
        label={`${track.name} color`}
        onCommit={(color) => updateTrack(track.id, { color })}
      />
      <span className={styles.icon}>{track.kind === 'drums' ? <DrumIcon size={14} /> : <KeysIcon size={14} />}</span>
      <div className={styles.names} onDoubleClick={() => setEditing(true)} title="Double-click to rename">
        {editing ? (
          <input
            className={styles.rename}
            defaultValue={track.name}
            autoFocus
            aria-label="Track name"
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              updateTrack(track.id, { name: e.target.value })
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span className={styles.name}>{track.name}</span>
        )}
        <span className={styles.subtitle}>{subtitle}</span>
      </div>
      <div className={styles.actions} onPointerDown={(e) => e.stopPropagation()}>
        <div className={styles.hoverActions}>
          <button
            className={styles.mini}
            onClick={() => moveTrack(track.id, -1)}
            disabled={index === 0}
            aria-label="Move track up"
          >
            <ChevronUpIcon size={12} />
          </button>
          <button
            className={styles.mini}
            onClick={() => moveTrack(track.id, 1)}
            disabled={index === count - 1}
            aria-label="Move track down"
          >
            <ChevronDownIcon size={12} />
          </button>
          <button className={styles.mini} onClick={() => removeTrack(track.id)} aria-label={`Delete ${track.name}`}>
            <TrashIcon size={12} />
          </button>
        </div>
        <button
          className={`${styles.ms} ${track.mixer.mute ? styles.muted : ''}`}
          aria-pressed={track.mixer.mute}
          onClick={() => setMixer(track.id, { mute: !track.mixer.mute })}
          title="Mute"
        >
          M
        </button>
        <button
          className={`${styles.ms} ${track.mixer.solo ? styles.soloed : ''}`}
          aria-pressed={track.mixer.solo}
          onClick={() => setMixer(track.id, { solo: !track.mixer.solo })}
          title="Solo"
        >
          S
        </button>
      </div>
    </li>
  )
}

function AddTrackMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, () => setOpen(false))

  const add = (id: string) => {
    useUiStore.getState().selectTrack(id)
    setOpen(false)
  }

  return (
    <div className={styles.addWrap} ref={ref}>
      <button className={`btn ${styles.add}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <PlusIcon size={14} /> Add track
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuLabel}>Instruments</div>
          {INSTRUMENT_PRESET_IDS.map((id) => (
            <button
              key={id}
              role="menuitem"
              className={styles.menuItem}
              onClick={() => add(useSongStore.getState().addInstrumentTrack(id))}
            >
              <span className={styles.dot} style={{ background: INSTRUMENT_PRESETS[id].color }} />
              <span>{INSTRUMENT_PRESETS[id].label}</span>
              <span className={styles.menuHint}>{INSTRUMENT_PRESETS[id].description}</span>
            </button>
          ))}
          <div className={styles.menuLabel}>Rhythm</div>
          <button
            role="menuitem"
            className={styles.menuItem}
            onClick={() => add(useSongStore.getState().addDrumTrack())}
          >
            <DrumIcon size={12} />
            <span>Drums</span>
            <span className={styles.menuHint}>Step sequencer</span>
          </button>
        </div>
      )}
    </div>
  )
}

export function TrackList() {
  const tracks = useSongStore((s) => s.song.tracks)
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className="label">Tracks</span>
      </div>
      <ul className={styles.list}>
        {tracks.map((t, i) => (
          <TrackRow key={t.id} track={t} index={i} count={tracks.length} />
        ))}
      </ul>
      {tracks.length === 0 && <p className={styles.empty}>No tracks yet. Add one to start composing.</p>}
      <AddTrackMenu />
    </div>
  )
}
