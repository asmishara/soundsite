import { setLoop, togglePlay } from '../audio/scheduler'
import { useGestureTransaction } from '../hooks/useGestureTransaction'
import { findSection, hiddenContentCount, layoutArrangement, sectionSteps, visibleNotes } from '../model/arrangement'
import { loopBounds } from '../audio/loop'
import { SCALES, SCALE_IDS, pitchClassName } from '../model/music'
import { MAX_BARS, MAX_BPM, MIN_BARS, MIN_BPM, STEPS_PER_BAR, STEPS_PER_BEAT, type ScaleId } from '../model/types'
import { usePlayheadStore } from '../state/playheadStore'
import { useSongStore } from '../state/songStore'
import { useUiStore } from '../state/uiStore'
import { Fader } from './common/Fader'
import { formatDb } from './common/format'
import { NumberField } from './common/NumberField'
import { Select } from './common/Select'
import { CloseIcon, LoopIcon, PlayIcon, RedoIcon, StopIcon, UndoIcon, WaveIcon } from './common/icons'
import styles from './TransportBar.module.css'

const ROOT_LABELS = Array.from({ length: 12 }, (_, pc) => {
  const sharp = pitchClassName(pc, false)
  const flat = pitchClassName(pc, true)
  return sharp === flat ? sharp : `${sharp}/${flat}`
})

/** Bar.beat.sixteenth: from the start of the song in song mode, otherwise within the looping section. */
function Position() {
  const step = usePlayheadStore((s) => (s.songStep >= 0 ? s.songStep : s.step))
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

/** Shows the active loop range, with a button to clear it. */
function LoopChip() {
  const loop = useUiStore((s) => s.loop)
  const sectionName = useSongStore((s) => (loop?.scope === 'section' ? findSection(s.song, loop.sectionId)?.name : null))
  // Show the range the scheduler actually loops: shortening the section or song can clip or void it.
  const span = useSongStore((s) => {
    if (loop?.scope === 'section') {
      const section = findSection(s.song, loop.sectionId)
      return section ? sectionSteps(section) : 0
    }
    return layoutArrangement(s.song).totalSteps
  })
  const bounds = loopBounds(loop, span)
  if (!loop || !bounds) return null
  const first = bounds.start / STEPS_PER_BAR + 1
  const last = Math.ceil(bounds.end / STEPS_PER_BAR)
  const bars = first === last ? `bar ${first}` : `bars ${first}–${last}`
  const where = loop.scope === 'section' ? `of ${sectionName ?? 'the section'}` : 'of the song'
  return (
    <div className={styles.loopChip} title={`Looping ${bars} ${where}`}>
      <LoopIcon size={13} />
      <span>
        {first === last ? `Bar ${first}` : `${first}–${last}`}
        <span className={styles.loopWhere}> {loop.scope === 'section' ? sectionName : 'song'}</span>
      </span>
      <button className={styles.loopClear} onClick={() => setLoop(null)} aria-label="Clear loop" title="Clear loop">
        <CloseIcon size={11} />
      </button>
    </div>
  )
}

/**
 * Sets a section's length. Shortening hides what's past the new end rather than deleting it, and a
 * notice says so whenever more content becomes hidden. Hidden notes drop out of the selection.
 */
function changeSectionLength(sectionId: string, bars: number) {
  const store = useSongStore.getState()
  const before = hiddenContentCount(store.song, sectionId)
  store.setSectionBars(sectionId, bars)
  const song = useSongStore.getState().song
  const section = findSection(song, sectionId)
  if (!section) return
  const ui = useUiStore.getState()
  if (ui.selectedSectionId === sectionId && ui.selectedNoteIds.length > 0) {
    const visible = new Set(song.tracks.flatMap((t) => (t.kind === 'instrument' ? visibleNotes(t, section) : [])).map((n) => n.id))
    const kept = ui.selectedNoteIds.filter((id) => visible.has(id))
    if (kept.length < ui.selectedNoteIds.length) ui.setSelection(kept)
  }
  if (hiddenContentCount(song, sectionId) > before) {
    ui.showNotice(`Notes after bar ${section.bars} of ${section.name} are hidden, not deleted. Make the section longer to bring them back.`)
  }
}

export function TransportBar() {
  const swingGesture = useGestureTransaction()
  const isPlaying = usePlayheadStore((s) => s.isPlaying)
  const bpm = useSongStore((s) => s.song.bpm)
  const swing = useSongStore((s) => s.song.swing)
  const selectedSectionId = useUiStore((s) => s.selectedSectionId)
  const section = useSongStore((s) => findSection(s.song, selectedSectionId))
  const key = useSongStore((s) => s.song.key)
  const masterVolume = useSongStore((s) => s.song.masterVolume)
  const canUndo = useSongStore((s) => s.past.length > 0)
  const canRedo = useSongStore((s) => s.future.length > 0)
  const audioReady = useUiStore((s) => s.audioReady)
  const { setBpm, setSwing, setKey, setMasterVolume, undo, redo } = useSongStore.getState()

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
        <LoopChip />
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
            {...swingGesture.rangeHandlers}
            onChange={(e) => {
              swingGesture.keepOpen()
              setSwing(Number(e.target.value))
            }}
          />
          <span className={styles.value}>{Math.round((swing / 0.6) * 100)}%</span>
        </label>
        <label className={styles.field} title="Length of the selected section, in bars">
          <span className="label">Bars</span>
          <NumberField
            value={section?.bars ?? 4}
            min={MIN_BARS}
            max={MAX_BARS}
            onCommit={(n) => section && changeSectionLength(section.id, n)}
            label={`Length of ${section?.name ?? 'the section'} in bars`}
            width={44}
          />
        </label>
      </div>

      <div className={styles.group}>
        <label className={styles.field}>
          <span className="label">Key</span>
          <Select
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
          </Select>
          <Select
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
          </Select>
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
