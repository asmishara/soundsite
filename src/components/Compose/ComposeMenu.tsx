import { useMemo, useRef, useState } from 'react'
import { useDismiss } from '../../hooks/useDismiss'
import { partNotes, sectionSteps } from '../../model/arrangement'
import { arpeggiate, type ArpPattern, type ArpSettings } from '../../model/compose/arpeggiate'
import {
  PROGRESSIONS,
  keyMode,
  progressionChords,
  writeProgression,
  type BassStyle,
  type ChordRhythm,
} from '../../model/compose/progressions'
import type { InstrumentTrack, Section } from '../../model/types'
import { useComposeStore } from '../../state/composeStore'
import { useSongStore } from '../../state/songStore'
import { useUiStore } from '../../state/uiStore'
import { SparkleIcon } from '../common/icons'
import styles from './Compose.module.css'

type Choice<T> = { value: T; label: string }

/** A row of toggle buttons for picking one option. */
function Choices<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Choice<T>[]
  onChange: (value: T) => void
}) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.choices} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={o.value === value}
            className={styles.choice}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const CHORD_LENGTHS: Choice<number>[] = [
  { value: 8, label: '½ bar' },
  { value: 16, label: '1 bar' },
  { value: 32, label: '2 bars' },
]
const RHYTHMS: Choice<ChordRhythm>[] = [
  { value: 'held', label: 'Held' },
  { value: 'half', label: 'Halves' },
  { value: 'quarter', label: 'Stabs' },
  { value: 'offbeat', label: 'Off-beat' },
  { value: 'arp8', label: 'Arp ⅛' },
  { value: 'arp16', label: 'Arp 1/16' },
]
const OCTAVES: Choice<number>[] = [
  { value: 48, label: 'Low' },
  { value: 60, label: 'Middle' },
  { value: 72, label: 'High' },
]
const BASS_STYLES: Choice<BassStyle>[] = [
  { value: 'none', label: 'None' },
  { value: 'roots', label: 'Roots' },
  { value: 'eighths', label: 'Eighths' },
  { value: 'octaves', label: 'Octaves' },
]
const ARP_PATTERNS: Choice<ArpPattern>[] = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'upDown', label: 'Up & down' },
  { value: 'random', label: 'Random' },
]

function undoAction() {
  return { label: 'Undo', run: () => useSongStore.getState().undo() }
}

function ProgressionTool({ track, section }: { track: InstrumentTrack; section: Section }) {
  const key = useSongStore((s) => s.song.key)
  const tracks = useSongStore((s) => s.song.tracks)
  const mode = keyMode(key)
  const { chordSteps, rhythm, center, bass, set } = useComposeStore()
  const progressionId = useComposeStore((s) => s.progressionId) ?? (mode === 'minor' ? 'epic' : 'pop')
  const bassTracks = tracks.filter((t): t is InstrumentTrack => t.kind === 'instrument' && t.id !== track.id)
  // Default the bass line to a Bass track if there is one.
  const chosenBassId = useComposeStore((s) => s.bassTrackId)
  const bassTrack =
    bassTracks.find((t) => t.id === chosenBassId) ?? bassTracks.find((t) => t.preset === 'bass') ?? bassTracks[0] ?? null

  // Progressions written in the key's own mode come first.
  const progressions = useMemo(
    () => [...PROGRESSIONS].sort((a, b) => Number(b.mode === mode) - Number(a.mode === mode)),
    [mode],
  )

  const write = () => {
    const progression = PROGRESSIONS.find((p) => p.id === progressionId)
    if (!progression) return
    const { chords, bass: bassLine, names } = writeProgression(progression, key, {
      steps: sectionSteps(section),
      chordSteps,
      rhythm,
      center,
      bass: bassTrack ? bass : 'none',
    })
    const store = useSongStore.getState()
    store.beginTransaction()
    store.replaceNotes({ trackId: track.id, sectionId: section.id }, null, chords)
    if (bassTrack && bass !== 'none') store.replaceNotes({ trackId: bassTrack.id, sectionId: section.id }, null, bassLine)
    store.endTransaction()
    const ui = useUiStore.getState()
    ui.setSelection([])
    const where = bassTrack && bass !== 'none' ? `${track.name} and ${bassTrack.name}` : track.name
    ui.showNotice(`Wrote ${progression.name} (${names.join(' ')}) on ${where} in ${section.name}`, 'info', undoAction())
  }

  return (
    <>
      <div className={styles.list} role="radiogroup" aria-label="Progression">
        {progressions.map((p) => {
          const chords = progressionChords(p, key.root)
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={p.id === progressionId}
              className={styles.option}
              onClick={() => set({ progressionId: p.id })}
              onDoubleClick={write}
              title={`${p.name}: ${chords.map((c) => c.roman).join('–')} (${chords.map((c) => c.name).join(' ')}). Double-click to write it.`}
            >
              <span className={styles.optionName}>{p.name}</span>
              <span className={styles.roman}>{chords.map((c) => c.roman).join('–')}</span>
              <span className={styles.chordNames}>{chords.map((c) => c.name).join('  ')}</span>
            </button>
          )
        })}
      </div>
      <Choices label="Each chord" value={chordSteps} options={CHORD_LENGTHS} onChange={(v) => set({ chordSteps: v })} />
      <Choices label="Rhythm" value={rhythm} options={RHYTHMS} onChange={(v) => set({ rhythm: v })} />
      <Choices label="Register" value={center} options={OCTAVES} onChange={(v) => set({ center: v })} />
      {bassTracks.length > 0 && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Bass line</span>
          <div className={styles.inline}>
            <div className={styles.choices} role="radiogroup" aria-label="Bass line">
              {BASS_STYLES.map((o) => (
                <button
                  key={o.value}
                  role="radio"
                  aria-checked={o.value === bass}
                  className={styles.choice}
                  onClick={() => set({ bass: o.value })}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {bass !== 'none' && (
              <select
                className="control"
                value={bassTrack?.id ?? ''}
                aria-label="Bass line track"
                onChange={(e) => set({ bassTrackId: e.target.value })}
              >
                {bassTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    on {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}
      <div className={styles.footer}>
        <span className={styles.note}>
          Replaces {track.name}
          {bassTrack && bass !== 'none' ? ` and ${bassTrack.name}` : ''} in {section.name}. Undo brings it back.
        </span>
        <button className={`btn ${styles.primary}`} onClick={write}>
          Write chords
        </button>
      </div>
    </>
  )
}

function ArpTool({ track, section }: { track: InstrumentTrack; section: Section }) {
  const selectedIds = useUiStore((s) => s.selectedNoteIds)
  const settings = useComposeStore((s) => s.arp)
  const notes = partNotes(track, section.id)
  const selected = notes.filter((n) => selectedIds.includes(n.id))
  const target = selected.length > 0 ? selected : notes
  const update = (patch: Partial<ArpSettings>) => useComposeStore.getState().set({ arp: { ...settings, ...patch } })

  const apply = () => {
    const { remove, add } = arpeggiate(target, settings)
    const ids = useSongStore.getState().replaceNotes({ trackId: track.id, sectionId: section.id }, remove, add)
    const ui = useUiStore.getState()
    ui.setSelection(ids)
    ui.showNotice(`Arpeggiated ${target.length} notes on ${track.name}`, 'info', undoAction())
  }

  return (
    <>
      <p className={styles.intro}>
        Turns chords into broken chords: notes that start together play one after another for as long as the
        chord lasts.
      </p>
      <Choices label="Pattern" value={settings.pattern} options={ARP_PATTERNS} onChange={(pattern) => update({ pattern })} />
      <Choices
        label="Speed"
        value={settings.rate}
        options={[
          { value: 2, label: '⅛ notes' },
          { value: 1, label: '1/16 notes' },
        ]}
        onChange={(rate) => update({ rate })}
      />
      <Choices
        label="Range"
        value={settings.octaves}
        options={[
          { value: 1, label: '1 octave' },
          { value: 2, label: '2 octaves' },
        ]}
        onChange={(octaves) => update({ octaves })}
      />
      <div className={styles.footer}>
        <span className={styles.note}>
          {selected.length > 0
            ? `${selected.length} selected note${selected.length === 1 ? '' : 's'}`
            : notes.length > 0
              ? `No notes selected, so this uses all ${notes.length} in ${section.name}`
              : `${track.name} has no notes in ${section.name} yet`}
        </span>
        <button className={`btn ${styles.primary}`} onClick={apply} disabled={target.length === 0}>
          Arpeggiate
        </button>
      </div>
    </>
  )
}

/** Composing helpers for instrument tracks: chord progressions and an arpeggiator. */
export function ComposeMenu({ track, section }: { track: InstrumentTrack; section: Section }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'chords' | 'arp'>('chords')
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, () => setOpen(false))

  return (
    <div className={styles.wrap} ref={ref}>
      <button className="btn" aria-expanded={open} aria-pressed={open} onClick={() => setOpen((o) => !o)}>
        <SparkleIcon size={14} /> Compose
      </button>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Compose">
          <div className={styles.tabs} role="tablist">
            <button role="tab" aria-selected={tab === 'chords'} className={styles.tab} onClick={() => setTab('chords')}>
              Chord progression
            </button>
            <button role="tab" aria-selected={tab === 'arp'} className={styles.tab} onClick={() => setTab('arp')}>
              Arpeggiate
            </button>
          </div>
          {tab === 'chords' ? <ProgressionTool track={track} section={section} /> : <ArpTool track={track} section={section} />}
        </div>
      )}
    </div>
  )
}
