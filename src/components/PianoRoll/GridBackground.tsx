import { memo } from 'react'
import { isBlackKey, isInScale, pitchClass } from '../../model/music'
import type { Key } from '../../model/types'
import { PITCHES, ROW_HEIGHT } from './layout'
import styles from './PianoRoll.module.css'

/** Row shading (black keys, in-key rows, the tonic) plus step/beat/bar lines. */
export const GridBackground = memo(function GridBackground({ songKey, zoom }: { songKey: Key; zoom: number }) {
  const showKey = songKey.scale !== 'chromatic'
  return (
    <>
      <div className={styles.rows}>
        {PITCHES.map((pitch) => {
          const classes = [styles.row, isBlackKey(pitch) ? styles.rowBlack : styles.rowWhite]
          if (showKey && isInScale(pitch, songKey)) classes.push(styles.rowInScale)
          if (showKey && pitchClass(pitch) === songKey.root) classes.push(styles.rowRoot)
          if (pitchClass(pitch) === 0) classes.push(styles.rowC)
          return <div key={pitch} className={classes.join(' ')} style={{ height: ROW_HEIGHT }} />
        })}
      </div>
      <div className={styles.lines} style={{ ['--step' as string]: `${zoom}px` }} />
    </>
  )
})
