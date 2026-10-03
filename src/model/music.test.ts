import { describe, expect, it } from 'vitest'
import {
  buildChord,
  diatonicChord,
  invertChord,
  isBlackKey,
  isInScale,
  keyPrefersFlats,
  midiToName,
  moveByScaleSteps,
  scaleStepsBetween,
  snapToScale,
} from './music'
import type { Key } from './types'

const C_MAJOR: Key = { root: 0, scale: 'major' }
const C_MINOR: Key = { root: 0, scale: 'minor' }
const A_MINOR: Key = { root: 9, scale: 'minor' }
const G_MAJOR: Key = { root: 7, scale: 'major' }

describe('note names', () => {
  it('names MIDI pitches', () => {
    expect(midiToName(60)).toBe('C4')
    expect(midiToName(69)).toBe('A4')
    expect(midiToName(61)).toBe('C#4')
    expect(midiToName(61, true)).toBe('Db4')
    expect(midiToName(24)).toBe('C1')
  })

  it('detects black keys', () => {
    expect(isBlackKey(60)).toBe(false)
    expect(isBlackKey(61)).toBe(true)
    expect(isBlackKey(70)).toBe(true)
  })

  it('prefers flats for flat keys', () => {
    expect(keyPrefersFlats(C_MINOR)).toBe(true) // relative of Eb major
    expect(keyPrefersFlats(C_MAJOR)).toBe(false)
    expect(keyPrefersFlats(G_MAJOR)).toBe(false)
    expect(keyPrefersFlats({ root: 5, scale: 'major' })).toBe(true) // F major
    expect(keyPrefersFlats({ root: 2, scale: 'dorian' })).toBe(false) // D dorian = C major
  })
})

describe('scales', () => {
  it('checks scale membership', () => {
    expect(isInScale(60, C_MAJOR)).toBe(true)
    expect(isInScale(61, C_MAJOR)).toBe(false)
    expect(isInScale(63, C_MINOR)).toBe(true) // Eb
    expect(isInScale(64, C_MINOR)).toBe(false) // E
    expect(isInScale(66, G_MAJOR)).toBe(true) // F#
    expect(isInScale(65, G_MAJOR)).toBe(false) // F
    expect(isInScale(61, { root: 0, scale: 'chromatic' })).toBe(true)
  })

  it('snaps to the nearest scale tone, ties go down', () => {
    expect(snapToScale(61, C_MAJOR)).toBe(60)
    expect(snapToScale(61, C_MAJOR, 'up')).toBe(62)
    expect(snapToScale(64, C_MINOR)).toBe(63)
    expect(snapToScale(64, C_MINOR, 'up')).toBe(65)
    expect(snapToScale(62, C_MAJOR)).toBe(62)
    // C minor pentatonic: C Eb F G Bb — D (62) is 1 below Eb and 2 above C
    expect(snapToScale(62, { root: 0, scale: 'minorPentatonic' })).toBe(63)
  })

  it('moves by scale degrees across octaves', () => {
    expect(moveByScaleSteps(60, 1, C_MAJOR)).toBe(62)
    expect(moveByScaleSteps(71, 1, C_MAJOR)).toBe(72)
    expect(moveByScaleSteps(60, -1, C_MAJOR)).toBe(59)
    expect(moveByScaleSteps(60, 7, C_MAJOR)).toBe(72)
    expect(moveByScaleSteps(61, 1, C_MAJOR)).toBe(62) // out of key: snaps up as the first step
    expect(moveByScaleSteps(61, -1, C_MAJOR)).toBe(60)
    expect(moveByScaleSteps(69, 2, A_MINOR)).toBe(72) // A → C
  })

  it('counts scale steps between pitches and round-trips with moveByScaleSteps', () => {
    expect(scaleStepsBetween(60, 67, C_MAJOR)).toBe(4)
    expect(scaleStepsBetween(67, 60, C_MAJOR)).toBe(-4)
    expect(scaleStepsBetween(61, 62, C_MAJOR)).toBe(1)
    for (const [from, to] of [
      [60, 72],
      [64, 57],
      [61, 65],
      [63, 55],
    ]) {
      expect(moveByScaleSteps(from, scaleStepsBetween(from, to, C_MAJOR), C_MAJOR)).toBe(to)
    }
  })
})

describe('chords', () => {
  it('builds chords by quality', () => {
    expect(buildChord(60, 'maj', C_MAJOR).pitches).toEqual([60, 64, 67])
    expect(buildChord(62, 'm7', C_MAJOR).pitches).toEqual([62, 65, 69, 72])
    expect(buildChord(62, 'm7', C_MAJOR).name).toBe('Dm7')
    expect(buildChord(62, 'm7', C_MAJOR).roman).toBe('ii7')
    expect(buildChord(61, 'maj', C_MAJOR).roman).toBeNull()
  })

  it('inverts chords', () => {
    expect(invertChord([60, 64, 67], 1)).toEqual([64, 67, 72])
    expect(invertChord([60, 64, 67], 2)).toEqual([67, 72, 76])
    expect(invertChord([60, 64, 67], 3)).toEqual([60, 64, 67])
  })

  it('builds diatonic triads in major', () => {
    const names = [60, 62, 64, 65, 67, 69, 71].map((p) => diatonicChord(p, C_MAJOR, 3))
    expect(names.map((c) => c.name)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'])
    expect(names.map((c) => c.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
  })

  it('builds diatonic sevenths', () => {
    expect(diatonicChord(67, C_MAJOR, 4).name).toBe('G7')
    expect(diatonicChord(67, C_MAJOR, 4).pitches).toEqual([67, 71, 74, 77])
    expect(diatonicChord(60, C_MAJOR, 4).name).toBe('Cmaj7')
    expect(diatonicChord(71, C_MAJOR, 4).name).toBe('Bm7♭5')
  })

  it('builds diatonic triads in minor with flat spelling', () => {
    const names = [60, 62, 63, 65, 67, 68, 70].map((p) => diatonicChord(p, C_MINOR, 3).name)
    expect(names).toEqual(['Cm', 'Ddim', 'Eb', 'Fm', 'Gm', 'Ab', 'Bb'])
    expect(diatonicChord(65, C_MINOR, 3).roman).toBe('iv')
  })

  it('snaps an out-of-key click to the scale before building', () => {
    expect(diatonicChord(61, C_MAJOR, 3).name).toBe('C')
  })
})
