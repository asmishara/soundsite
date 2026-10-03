import { useSongStore } from '../../state/songStore'
import { useUiStore } from '../../state/uiStore'
import { Fader } from '../common/Fader'
import { formatDb } from '../common/format'
import { ChevronDownIcon, ChevronUpIcon } from '../common/icons'
import { ChannelStrip } from './ChannelStrip'
import { FxPanel } from './FxPanel'
import styles from './Mixer.module.css'

export function Mixer() {
  const open = useUiStore((s) => s.mixerOpen)
  const selectedTrackId = useUiStore((s) => s.selectedTrackId)
  const tracks = useSongStore((s) => s.song.tracks)
  const masterVolume = useSongStore((s) => s.song.masterVolume)

  return (
    <section className={styles.mixer} aria-label="Mixer">
      <button
        className={styles.toggle}
        onClick={() => useUiStore.getState().setMixerOpen(!open)}
        aria-expanded={open}
      >
        {open ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
        <span className="label">Mixer &amp; effects</span>
      </button>
      {open && (
        <div className={styles.content}>
          <div className={styles.strips}>
            {tracks.map((t) => (
              <ChannelStrip key={t.id} track={t} selected={t.id === selectedTrackId} />
            ))}
          </div>
          <div className={styles.fx}>
            <FxPanel />
          </div>
          <div className={`${styles.strip} ${styles.master}`}>
            <div className={styles.stripName}>Master</div>
            <div className={styles.masterSpacer} />
            <Fader
              label="Master volume"
              value={masterVolume}
              min={-60}
              max={6}
              defaultValue={-3}
              format={formatDb}
              onChange={useSongStore.getState().setMasterVolume}
            />
          </div>
        </div>
      )}
    </section>
  )
}
