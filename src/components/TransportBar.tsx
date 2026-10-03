import { togglePlay } from '../audio/scheduler'
import { SCALES, SCALE_IDS, pitchClassName } from '../model/music'
import { MAX_BARS, MAX_BPM, MIN_BARS, MIN_BPM, STEPS_PER_BAR, STEPS_PER_BEAT, type ScaleId } from '../model/types'
import { usePlayheadStore } from '../state/playheadStore'
import { useSongStore } from '../state/songStore'
import { useUiStore } from '../state/uiStore'
import { Fader } from './common/Fader'
import { formatDb } from './common/format'
import { NumberField } from './common/NumberField'
import { PlayIcon, RedoIcon, StopIcon, UndoIcon, WaveIcon } from './common/icons'
import styles from './TransportBar.module.css'

const ROOT_LABELS = Array.from({ length: 12 }, (_, pc) => {
  const sharp = pitchClassName(pc, false)
  const flat = pitchClassName(pc, true)
  return sharp === flat ? sharp : `${sharp}/${flat}`
})

function Position() {
  const step = usePlayheadStore((s) => s.step)
  const s = Math.max(step, 0)
  const bar = Math.floor(s / STEPS_PER_BAR) + 1
  const beat = Math.floor((s % STEPS_PER_BAR) / STEPS_PER_BEAT) + 1
  const sixteenth = (s % STEPS_PER_BEAT) + 1
  return (
    <div className={styles.position} aria-label="Playback position">
      {bar}.{beat}.{sixteenth}
    </div>
  )
}

export function TransportBar() {
  const isPlaying = usePlayheadStore((s) => s.isPlaying)
  const bpm = useSongStore((s) => s.song.bpm)
  const swing = useSongStore((s) => s.song.swing)
  const bars = useSongStore((s) => s.song.bars)
  const key = useSongStore((s) => s.song.key)
  const masterVolume = useSongStore((s) => s.song.masterVolume)
  const canUndo = useSongStore((s) => s.past.length > 0)
  const canRedo = useSongStore((s) => s.future.length > 0)
  const audioReady = useUiStore((s) => s.audioReady)
  const { setBpm, setSwing, setBars, setKey, setMasterVolume, undo, redo } = useSongStore.getState()

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <WaveIcon size={20} />
        <span>Soundsite</span>
      </div>

      <div className={styles.group}>
        <button
          className={`${styles.play} ${isPlaying ? styles.playing : ''}`}
          onClick={togglePlay}
          aria-label={isPlaying ? 'Stop' : 'Play'}
          title={isPlaying ? 'Stop (Space)' : 'Play (Space)'}
        >
          {isPlaying ? <StopIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        <Position />
        {!audioReady && <span className={styles.hint}>Press play to enable audio</span>}
      </div>

      <div className={styles.group}>
        <label className={styles.field}>
          <span className="label">BPM</span>
          <NumberField value={bpm} min={MIN_BPM} max={MAX_BPM} onCommit={setBpm} label="Tempo (BPM)" />
        </label>
        <label className={styles.field}>
          <span className="label">Swing</span>
          <input
            type="range"
            className={styles.slider}
            min={0}
            max={0.6}
            step={0.01}
            value={swing}
            aria-label="Swing"
            onPointerDown={() => useSongStore.getState().beginTransaction()}
            onPointerUp={() => useSongStore.getState().endTransaction()}
            onChange={(e) => setSwing(Number(e.target.value))}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <span className={styles.value}>{Math.round((swing / 0.6) * 100)}%</span>
        </label>
        <label className={styles.field}>
          <span className="label">Bars</span>
          <NumberField value={bars} min={MIN_BARS} max={MAX_BARS} onCommit={setBars} label="Song length in bars" width={44} />
        </label>
      </div>

      <div className={styles.group}>
        <label className={styles.field}>
          <span className="label">Key</span>
          <select
            className="control"
            value={key.root}
            aria-label="Key root"
            onChange={(e) => setKey({ root: Number(e.target.value) })}
          >
            {ROOT_LABELS.map((label, pc) => (
              <option key={pc} value={pc}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="control"
            value={key.scale}
            aria-label="Scale"
            onChange={(e) => setKey({ scale: e.target.value as ScaleId })}
          >
            {SCALE_IDS.map((id) => (
              <option key={id} value={id}>
                {SCALES[id].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.spacer} />

      <div className={styles.group}>
        <button className="btn" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
          <UndoIcon />
        </button>
        <button className="btn" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
          <RedoIcon />
        </button>
      </div>

      <div className={`${styles.group} ${styles.master}`}>
        <span className="label">Master</span>
        <Fader
          orientation="horizontal"
          value={masterVolume}
          min={-60}
          max={6}
          defaultValue={-3}
          onChange={setMasterVolume}
          label="Master volume"
          format={formatDb}
        />
      </div>
    </header>
  )
}
