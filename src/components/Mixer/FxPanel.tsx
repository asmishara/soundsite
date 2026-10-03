import type { DelayTime } from '../../model/types'
import { useSongStore } from '../../state/songStore'
import { Knob } from '../common/Knob'
import styles from './Mixer.module.css'

const DELAY_TIMES: { value: DelayTime; label: string }[] = [
  { value: '16n', label: '1/16' },
  { value: '8n', label: '1/8' },
  { value: '8n.', label: '1/8 dotted' },
  { value: '4n', label: '1/4' },
]

export function FxPanel() {
  const fx = useSongStore((s) => s.song.fx)
  const setFx = useSongStore.getState().setFx
  return (
    <>
      <div className={styles.fxUnit}>
        <div className={styles.fxTitle} style={{ ['--fx-color' as string]: '#a78bfa' }}>
          Reverb
        </div>
        <div className={styles.fxControls}>
          <Knob
            label="Decay"
            value={fx.reverbDecay}
            min={0.3}
            max={8}
            defaultValue={2.5}
            format={(v) => `${v.toFixed(1)} s`}
            color="#a78bfa"
            onChange={(reverbDecay) => setFx({ reverbDecay })}
          />
          <Knob
            label="Level"
            value={fx.reverbWet}
            min={0}
            max={1}
            defaultValue={1}
            format={(v) => `${Math.round(v * 100)}%`}
            color="#a78bfa"
            onChange={(reverbWet) => setFx({ reverbWet })}
          />
        </div>
      </div>
      <div className={styles.fxUnit}>
        <div className={styles.fxTitle} style={{ ['--fx-color' as string]: '#22d3ee' }}>
          Delay
        </div>
        <div className={styles.fxControls}>
          <label className={styles.fxSelect}>
            <select
              className="control"
              value={fx.delayTime}
              aria-label="Delay time"
              onChange={(e) => setFx({ delayTime: e.target.value as DelayTime })}
            >
              {DELAY_TIMES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <span className={styles.fxCaption}>Time</span>
          </label>
          <Knob
            label="Feedback"
            value={fx.delayFeedback}
            min={0}
            max={0.9}
            defaultValue={0.35}
            format={(v) => `${Math.round(v * 100)}%`}
            color="#22d3ee"
            onChange={(delayFeedback) => setFx({ delayFeedback })}
          />
        </div>
      </div>
    </>
  )
}
