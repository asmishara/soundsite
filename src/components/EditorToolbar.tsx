import { CHORD_QUALITIES, CHORD_QUALITY_IDS } from '../model/music'
import { INSTRUMENT_PRESETS, INSTRUMENT_PRESET_IDS } from '../model/presets'
import type { InstrumentPresetId, Track } from '../model/types'
import { useSongStore } from '../state/songStore'
import { SNAP_OPTIONS, useUiStore, type ChordMode } from '../state/uiStore'
import { CursorIcon, MagnetIcon, PencilIcon, ZoomInIcon, ZoomOutIcon } from './common/icons'
import styles from './EditorToolbar.module.css'

const LENGTH_OPTIONS = [
  { steps: 1, label: '1/16' },
  { steps: 2, label: '1/8' },
  { steps: 3, label: '3/16' },
  { steps: 4, label: '1/4' },
  { steps: 6, label: '3/8' },
  { steps: 8, label: '1/2' },
  { steps: 16, label: '1 bar' },
]

const INVERSIONS = ['Root', '1st inv', '2nd inv', '3rd inv']

function ZoomControls() {
  const zoom = useUiStore((s) => s.zoom)
  const setZoom = useUiStore((s) => s.setZoom)
  return (
    <div className={styles.group}>
      <button className="btn" onClick={() => setZoom(zoom - 4)} aria-label="Zoom out" title="Zoom out">
        <ZoomOutIcon size={15} />
      </button>
      <button className="btn" onClick={() => setZoom(zoom + 4)} aria-label="Zoom in" title="Zoom in">
        <ZoomInIcon size={15} />
      </button>
    </div>
  )
}

export function EditorToolbar({ track }: { track: Track }) {
  const ui = useUiStore()

  if (track.kind === 'drums') {
    return (
      <div className={styles.bar}>
        <div className={styles.title} style={{ ['--track-color' as string]: track.color }}>
          {track.name}
        </div>
        <span className={styles.help}>
          Click a cell to toggle · drag to paint · <kbd>Shift</kbd>+click for an accent · click a name to audition
        </span>
        <div className={styles.spacer} />
        <ZoomControls />
      </div>
    )
  }

  const chordOn = ui.chordMode !== 'off'

  return (
    <div className={styles.bar}>
      <div className={styles.title} style={{ ['--track-color' as string]: track.color }}>
        {track.name}
      </div>

      <select
        className="control"
        value={track.preset}
        aria-label="Instrument"
        title="Instrument"
        onChange={(e) => useSongStore.getState().updateTrack(track.id, { preset: e.target.value as InstrumentPresetId })}
      >
        {INSTRUMENT_PRESET_IDS.map((id) => (
          <option key={id} value={id}>
            {INSTRUMENT_PRESETS[id].label}
          </option>
        ))}
      </select>

      <div className={styles.divider} />

      <div className={styles.segmented} role="group" aria-label="Tool">
        <button
          className="btn"
          aria-pressed={ui.tool === 'draw'}
          onClick={() => ui.setTool('draw')}
          title="Draw (D)"
          aria-label="Draw tool"
        >
          <PencilIcon size={14} /> <span className={styles.toolLabel}>Draw</span>
        </button>
        <button
          className="btn"
          aria-pressed={ui.tool === 'select'}
          onClick={() => ui.setTool('select')}
          title="Select (S)"
          aria-label="Select tool"
        >
          <CursorIcon size={14} /> <span className={styles.toolLabel}>Select</span>
        </button>
      </div>

      <label className={styles.field}>
        <span className="label">Snap</span>
        <select className="control" value={ui.snap} onChange={(e) => ui.setSnap(Number(e.target.value))}>
          {SNAP_OPTIONS.map((o) => (
            <option key={o.steps} value={o.steps}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className="label">Length</span>
        <select className="control" value={ui.noteLength} onChange={(e) => ui.setNoteLength(Number(e.target.value))}>
          {LENGTH_OPTIONS.map((o) => (
            <option key={o.steps} value={o.steps}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.divider} />

      <label className={styles.field}>
        <span className="label">Chord</span>
        <select
          className="control"
          value={ui.chordMode}
          onChange={(e) => ui.setChordMode(e.target.value as ChordMode)}
          aria-label="Chord mode"
        >
          <option value="off">Off</option>
          <optgroup label="In key">
            <option value="diatonic3">Diatonic triad</option>
            <option value="diatonic4">Diatonic 7th</option>
          </optgroup>
          <optgroup label="Fixed quality">
            {CHORD_QUALITY_IDS.map((q) => (
              <option key={q} value={q}>
                {CHORD_QUALITIES[q].label}
              </option>
            ))}
          </optgroup>
        </select>
        <select
          className="control"
          value={ui.chordInversion}
          disabled={!chordOn}
          onChange={(e) => ui.setChordInversion(Number(e.target.value))}
          aria-label="Chord inversion"
        >
          {INVERSIONS.map((label, i) => (
            <option key={i} value={i}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <button
        className="btn"
        aria-pressed={ui.snapToScale}
        onClick={() => ui.setSnapToScale(!ui.snapToScale)}
        title="Snap to scale: keep new and moved notes in the song's key"
        aria-label="Snap to scale"
      >
        <MagnetIcon size={14} /> <span className={styles.toolLabel}>Snap to scale</span>
      </button>

      {chordOn && ui.lastChord && (
        <div className={styles.chord} aria-live="polite">
          <span className={styles.chordName}>{ui.lastChord.name}</span>
          {ui.lastChord.roman && <span className={styles.roman}>{ui.lastChord.roman}</span>}
        </div>
      )}

      <div className={styles.spacer} />
      <ZoomControls />
    </div>
  )
}
