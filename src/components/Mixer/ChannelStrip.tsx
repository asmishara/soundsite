import { memo } from 'react'
import type { Track } from '../../model/types'
import { useSongStore } from '../../state/songStore'
import { useUiStore } from '../../state/uiStore'
import { Fader } from '../common/Fader'
import { formatDb } from '../common/format'
import { Knob } from '../common/Knob'
import styles from './Mixer.module.css'

const formatPan = (v: number) => (Math.abs(v) < 0.02 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`)
const formatPercent = (v: number) => `${Math.round(v * 100)}%`

export const ChannelStrip = memo(function ChannelStrip({ track, selected }: { track: Track; selected: boolean }) {
  const setMixer = useSongStore.getState().setMixer
  const m = track.mixer
  return (
    <div
      className={`${styles.strip} ${selected ? styles.stripSelected : ''}`}
      style={{ ['--track-color' as string]: track.color }}
      onPointerDown={() => useUiStore.getState().selectTrack(track.id)}
    >
      <div className={styles.stripName} title={track.name}>
        {track.name}
      </div>
      <Knob
        label="Pan"
        size={30}
        value={m.pan}
        min={-1}
        max={1}
        defaultValue={0}
        bipolar
        format={formatPan}
        color={track.color}
        onChange={(pan) => setMixer(track.id, { pan })}
      />
      <div className={styles.sends}>
        <Knob
          label="Verb"
          size={26}
          value={m.reverbSend}
          min={0}
          max={1}
          defaultValue={0.15}
          format={formatPercent}
          color="#a78bfa"
          onChange={(reverbSend) => setMixer(track.id, { reverbSend })}
        />
        <Knob
          label="Delay"
          size={26}
          value={m.delaySend}
          min={0}
          max={1}
          defaultValue={0}
          format={formatPercent}
          color="#22d3ee"
          onChange={(delaySend) => setMixer(track.id, { delaySend })}
        />
      </div>
      <Fader
        label={`${track.name} volume`}
        value={m.volume}
        min={-60}
        max={6}
        defaultValue={-6}
        format={formatDb}
        onChange={(volume) => setMixer(track.id, { volume })}
      />
      <div className={styles.msRow}>
        <button
          className={`${styles.ms} ${m.mute ? styles.muted : ''}`}
          aria-pressed={m.mute}
          aria-label={`Mute ${track.name}`}
          onClick={() => setMixer(track.id, { mute: !m.mute })}
        >
          M
        </button>
        <button
          className={`${styles.ms} ${m.solo ? styles.soloed : ''}`}
          aria-pressed={m.solo}
          aria-label={`Solo ${track.name}`}
          onClick={() => setMixer(track.id, { solo: !m.solo })}
        >
          S
        </button>
      </div>
    </div>
  )
})
