import { buildChord, diatonicChord, snapToScale, type ChordInfo } from '../../model/music'
import { MAX_PITCH, MIN_PITCH, type Key } from '../../model/types'
import type { ChordMode } from '../../state/uiStore'

type PlacementOptions = { chordMode: ChordMode; chordInversion: number; snapToScale: boolean }

/** The pitches a click on `pitch` should create, given the chord and scale helpers. */
export function pitchesToPlace(
  pitch: number,
  key: Key,
  { chordMode, chordInversion, snapToScale: snap }: PlacementOptions,
): { pitches: number[]; chord: ChordInfo | null } {
  const root = snap ? snapToScale(pitch, key) : pitch
  if (chordMode === 'off') return { pitches: [root], chord: null }

  const chord =
    chordMode === 'diatonic3'
      ? diatonicChord(pitch, key, 3, chordInversion)
      : chordMode === 'diatonic4'
        ? diatonicChord(pitch, key, 4, chordInversion)
        : buildChord(root, chordMode, key, chordInversion)

  return { pitches: chord.pitches.filter((p) => p >= MIN_PITCH && p <= MAX_PITCH), chord }
}
