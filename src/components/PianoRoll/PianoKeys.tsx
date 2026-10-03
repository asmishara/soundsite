import { memo } from 'react'
import { engine } from '../../audio/engine'
import { isBlackKey, isInScale, midiToName, pitchClass } from '../../model/music'
import type { Key } from '../../model/types'
import { PITCHES, ROW_HEIGHT } from './layout'
import styles from './PianoRoll.module.css'

/** The keyboard down the left edge; click a key to hear it. */
export const PianoKeys = memo(function PianoKeys({ trackId, songKey }: { trackId: string; songKey: Key }) {
  return (
    <div className={styles.keys}>
      {PITCHES.map((pitch) => {
        const black = isBlackKey(pitch)
        const isC = pitchClass(pitch) === 0
        const isRoot = pitchClass(pitch) === songKey.root
        return (
          <div
            key={pitch}
            className={`${styles.key} ${black ? styles.keyBlack : styles.keyWhite} ${isC ? styles.keyC : ''}`}
            style={{ height: ROW_HEIGHT }}
            onPointerDown={() => void engine.preview(trackId, pitch)}
            title={midiToName(pitch)}
          >
            {isRoot && <span className={styles.rootDot} title="Key root" />}
            {!isInScale(pitch, songKey) && <span className={styles.outOfKey} />}
            {isC && <span className={styles.keyLabel}>{midiToName(pitch)}</span>}
          </div>
        )
      })}
    </div>
  )
})
