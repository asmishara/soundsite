import { useRef, useState } from 'react'
import { useDismiss } from '../../hooks/useDismiss'
import { DRUM_STYLES, buildDrumPattern } from '../../model/compose/drumPatterns'
import type { DrumTrack, Section } from '../../model/types'
import { useComposeStore } from '../../state/composeStore'
import { useSongStore } from '../../state/songStore'
import { useUiStore } from '../../state/uiStore'
import { SparkleIcon } from '../common/icons'
import styles from './Compose.module.css'

/** Ready-made beats for drum tracks. Applying one keeps the menu open so styles can be compared while playing. */
export function DrumPatternMenu({ track, section }: { track: DrumTrack; section: Section }) {
  const [open, setOpen] = useState(false)
  const { drumCrash: crash, drumFill: fill, lastDrumStyle: last, set } = useComposeStore()
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, () => setOpen(false))

  const apply = (styleId: string) => {
    const style = DRUM_STYLES.find((s) => s.id === styleId)
    if (!style) return
    useSongStore
      .getState()
      .setDrumPattern({ trackId: track.id, sectionId: section.id }, buildDrumPattern(style, section.bars, { crash, fill }))
    set({ lastDrumStyle: styleId })
    useUiStore.getState().showNotice(`${style.name} beat on ${track.name} in ${section.name}`, 'info', {
      label: 'Undo',
      run: () => useSongStore.getState().undo(),
    })
  }

  return (
    <div className={styles.wrap} ref={ref}>
      <button className="btn" aria-expanded={open} aria-pressed={open} onClick={() => setOpen((o) => !o)}>
        <SparkleIcon size={14} /> Patterns
      </button>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Drum patterns">
          <p className={styles.intro}>
            Pick a style to fill {section.name} ({section.bars} bar{section.bars === 1 ? '' : 's'}). It replaces this
            section&rsquo;s beat, and you can try several while it plays.
          </p>
          <div className={styles.list}>
            {DRUM_STYLES.map((style) => (
              <button
                key={style.id}
                className={styles.option}
                aria-current={style.id === last}
                onClick={() => apply(style.id)}
              >
                <span className={styles.optionName}>{style.name}</span>
                <span className={styles.chordNames}>{style.description}</span>
              </button>
            ))}
          </div>
          <div className={styles.checks}>
            <label>
              <input type="checkbox" checked={crash} onChange={(e) => set({ drumCrash: e.target.checked })} />
              Crash on the first beat
            </label>
            <label>
              <input type="checkbox" checked={fill} onChange={(e) => set({ drumFill: e.target.checked })} />
              Fill at the end
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
