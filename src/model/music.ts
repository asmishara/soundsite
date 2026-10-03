import type { Key, ScaleId } from './types'

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

export const SCALES: Record<ScaleId, { label: string; intervals: readonly number[] }> = {
  major: { label: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { label: 'Harmonic minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
  dorian: { label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { label: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { label: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { label: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  majorPentatonic: { label: 'Major pentatonic', intervals: [0, 2, 4, 7, 9] },
  minorPentatonic: { label: 'Minor pentatonic', intervals: [0, 3, 5, 7, 10] },
  blues: { label: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
  chromatic: { label: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
}

export const SCALE_IDS = Object.keys(SCALES) as ScaleId[]

export function pitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12
}

/** Semitone distance from each scale's tonic to the tonic of its relative major key. */
const RELATIVE_MAJOR_OFFSET: Record<ScaleId, number> = {
  major: 0,
  lydian: 7,
  mixolydian: 5,
  majorPentatonic: 0,
  chromatic: 0,
  minor: 3,
  harmonicMinor: 3,
  minorPentatonic: 3,
  blues: 3,
  dorian: 10,
  phrygian: 8,
}

const FLAT_MAJOR_KEYS = new Set([5, 10, 3, 8, 1]) // F, Bb, Eb, Ab, Db

/** Whether note names in this key read better with flats (e.g. C minor → Eb, Ab, Bb). */
export function keyPrefersFlats(key: Key): boolean {
  return FLAT_MAJOR_KEYS.has(pitchClass(key.root + RELATIVE_MAJOR_OFFSET[key.scale]))
}

export function pitchClassName(pc: number, preferFlats = false): string {
  return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[pitchClass(pc)]
}

/** 60 → "C4" */
export function midiToName(pitch: number, preferFlats = false): string {
  return `${pitchClassName(pitch, preferFlats)}${Math.floor(pitch / 12) - 1}`
}

export function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitchClass(pitch))
}

function intervalsOf(key: Key): readonly number[] {
  return SCALES[key.scale].intervals
}

/** Index of the pitch within the scale (0 = tonic), or -1 if it's not in the scale. */
export function scaleDegree(pitch: number, key: Key): number {
  return intervalsOf(key).indexOf(pitchClass(pitch - key.root))
}

export function isInScale(pitch: number, key: Key): boolean {
  return scaleDegree(pitch, key) !== -1
}

export type SnapDirection = 'nearest' | 'up' | 'down'

/** Moves the pitch to the closest scale tone. Ties in 'nearest' resolve downward. */
export function snapToScale(pitch: number, key: Key, direction: SnapDirection = 'nearest'): number {
  if (isInScale(pitch, key)) return pitch
  for (let d = 1; d < 12; d++) {
    if (direction !== 'up' && isInScale(pitch - d, key)) return pitch - d
    if (direction !== 'down' && isInScale(pitch + d, key)) return pitch + d
  }
  return pitch
}

/** Pitch of an absolute scale-degree index relative to a tonic pitch (degree may be negative or exceed the scale length). */
function degreeToPitch(tonic: number, degree: number, key: Key): number {
  const intervals = intervalsOf(key)
  const n = intervals.length
  const octave = Math.floor(degree / n)
  return tonic + octave * 12 + intervals[((degree % n) + n) % n]
}

/** Moves a pitch by `steps` scale degrees. Out-of-scale pitches are snapped first, in the direction of travel. */
export function moveByScaleSteps(pitch: number, steps: number, key: Key): number {
  if (steps === 0) return pitch
  const start = isInScale(pitch, key) ? pitch : snapToScale(pitch, key, steps > 0 ? 'up' : 'down')
  const remaining = start === pitch ? steps : steps - Math.sign(steps)
  const tonic = start - pitchClass(start - key.root)
  return degreeToPitch(tonic, scaleDegree(start, key) + remaining, key)
}

/**
 * Number of scale degrees from `from` to `to` (signed), counting scale tones in (from, to].
 * Pairs with moveByScaleSteps: moveByScaleSteps(from, scaleStepsBetween(from, to)) === to when `to` is in the scale.
 */
export function scaleStepsBetween(from: number, to: number, key: Key): number {
  if (from === to) return 0
  const dir = Math.sign(to - from)
  let count = 0
  for (let p = from + dir; dir > 0 ? p <= to : p >= to; p += dir) {
    if (isInScale(p, key)) count++
  }
  return count * dir
}

export type ChordQuality = 'maj' | 'min' | 'dim' | 'aug' | 'sus2' | 'sus4' | '7' | 'maj7' | 'm7' | 'dim7' | 'm7b5'

export const CHORD_QUALITIES: Record<ChordQuality, { label: string; suffix: string; intervals: readonly number[] }> = {
  maj: { label: 'Major', suffix: '', intervals: [0, 4, 7] },
  min: { label: 'Minor', suffix: 'm', intervals: [0, 3, 7] },
  dim: { label: 'Diminished', suffix: 'dim', intervals: [0, 3, 6] },
  aug: { label: 'Augmented', suffix: 'aug', intervals: [0, 4, 8] },
  sus2: { label: 'Sus2', suffix: 'sus2', intervals: [0, 2, 7] },
  sus4: { label: 'Sus4', suffix: 'sus4', intervals: [0, 5, 7] },
  '7': { label: 'Dominant 7', suffix: '7', intervals: [0, 4, 7, 10] },
  maj7: { label: 'Major 7', suffix: 'maj7', intervals: [0, 4, 7, 11] },
  m7: { label: 'Minor 7', suffix: 'm7', intervals: [0, 3, 7, 10] },
  dim7: { label: 'Diminished 7', suffix: 'dim7', intervals: [0, 3, 6, 9] },
  m7b5: { label: 'Half-diminished', suffix: 'm7♭5', intervals: [0, 3, 6, 10] },
}

export const CHORD_QUALITY_IDS = Object.keys(CHORD_QUALITIES) as ChordQuality[]

export type ChordInfo = {
  /** Pitches, ascending, after inversion */
  pitches: number[]
  root: number
  quality: ChordQuality | null
  /** e.g. "Fm" */
  name: string
  /** e.g. "iv", or null when the root is outside the key */
  roman: string | null
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

function identifyQuality(intervals: number[]): ChordQuality | null {
  const key = intervals.join(',')
  return CHORD_QUALITY_IDS.find((q) => CHORD_QUALITIES[q].intervals.join(',') === key) ?? null
}

function romanNumeral(root: number, quality: ChordQuality | null, key: Key): string | null {
  const degree = scaleDegree(root, key)
  // Roman numerals only make sense for seven-note scales.
  if (degree === -1 || intervalsOf(key).length !== 7) return null
  const base = ROMAN[degree]
  switch (quality) {
    case 'min':
    case 'm7':
      return base.toLowerCase() + (quality === 'm7' ? '7' : '')
    case 'dim':
      return base.toLowerCase() + '°'
    case 'dim7':
      return base.toLowerCase() + '°7'
    case 'm7b5':
      return base.toLowerCase() + 'ø7'
    case 'aug':
      return base + '+'
    case '7':
      return base + '7'
    case 'maj7':
      return base + 'maj7'
    default:
      return base
  }
}

/** Rotates the lowest note up an octave `inversion` times. */
export function invertChord(pitches: number[], inversion: number): number[] {
  const out = [...pitches].sort((a, b) => a - b)
  for (let i = 0; i < inversion % Math.max(out.length, 1); i++) {
    out.push(out.shift()! + 12)
  }
  return out
}

function describe(rootPitch: number, uninverted: number[], inversion: number, key: Key): ChordInfo {
  const quality = identifyQuality(uninverted.map((p) => p - rootPitch))
  const rootName = pitchClassName(rootPitch, keyPrefersFlats(key))
  return {
    pitches: invertChord(uninverted, inversion),
    root: rootPitch,
    quality,
    name: rootName + (quality ? CHORD_QUALITIES[quality].suffix : '?'),
    roman: romanNumeral(rootPitch, quality, key),
  }
}

export function buildChord(root: number, quality: ChordQuality, key: Key, inversion = 0): ChordInfo {
  return describe(
    root,
    CHORD_QUALITIES[quality].intervals.map((i) => root + i),
    inversion,
    key,
  )
}

/**
 * Stacks scale thirds on the clicked degree (the root is snapped into the key first),
 * so every degree gets its in-key chord: in C major, D → Dm, G → G7 (size 4), B → Bdim.
 */
export function diatonicChord(clicked: number, key: Key, size: 3 | 4, inversion = 0): ChordInfo {
  if (key.scale === 'chromatic') {
    return buildChord(clicked, size === 4 ? '7' : 'maj', key, inversion)
  }
  const root = snapToScale(clicked, key)
  const tonic = root - pitchClass(root - key.root)
  const degree = scaleDegree(root, key)
  const pitches = Array.from({ length: size }, (_, i) => degreeToPitch(tonic, degree + i * 2, key))
  return describe(root, pitches, inversion, key)
}
