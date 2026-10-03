import { SCALES, buildChord, diatonicChord, invertChord, pitchClass, type ChordInfo, type ChordQuality } from '../music'
import { MAX_PITCH, MIN_PITCH, type Key, type NewNote, type ScaleId } from '../types'
import { arpLine } from './arpeggiate'

type ProgressionChord = {
  /** Scale degree, 0 = tonic */
  degree: number
  /** Use a seventh chord */
  seventh?: boolean
  /** Override the in-key chord quality (e.g. a major V in a minor key) */
  quality?: ChordQuality
}

export type Progression = {
  id: string
  name: string
  /** The mode the progression's numerals are written in; chords are built on the song's tonic. */
  mode: 'major' | 'minor'
  chords: ProgressionChord[]
}

const ch = (degree: number, extra: Omit<ProgressionChord, 'degree'> = {}): ProgressionChord => ({ degree, ...extra })
const seventh = (degree: number) => ch(degree, { seventh: true })
const dom7 = (degree: number) => ch(degree, { quality: '7' })

export const PROGRESSIONS: Progression[] = [
  { id: 'pop', name: 'Pop', mode: 'major', chords: [ch(0), ch(4), ch(5), ch(3)] },
  { id: 'ballad', name: 'Ballad', mode: 'major', chords: [ch(5), ch(3), ch(0), ch(4)] },
  { id: 'doowop', name: '50s doo-wop', mode: 'major', chords: [ch(0), ch(5), ch(3), ch(4)] },
  { id: 'canon', name: 'Canon', mode: 'major', chords: [ch(0), ch(4), ch(5), ch(2), ch(3), ch(0), ch(3), ch(4)] },
  { id: 'royal', name: 'Royal road', mode: 'major', chords: [seventh(3), seventh(4), seventh(2), seventh(5)] },
  { id: 'jazz', name: 'Jazz ii–V–I', mode: 'major', chords: [seventh(1), seventh(4), seventh(0), seventh(0)] },
  {
    id: 'blues',
    name: '12-bar blues',
    mode: 'major',
    chords: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4].map(dom7),
  },
  { id: 'epic', name: 'Epic', mode: 'minor', chords: [ch(0), ch(5), ch(2), ch(6)] },
  { id: 'andalusian', name: 'Andalusian', mode: 'minor', chords: [ch(0), ch(6), ch(5), ch(4, { quality: 'maj' })] },
  { id: 'vamp', name: 'Minor vamp', mode: 'minor', chords: [ch(0), ch(6), ch(5), ch(6)] },
  { id: 'cadence', name: 'Minor cadence', mode: 'minor', chords: [ch(0), ch(3), dom7(4), ch(0)] },
]

const MINOR_SCALES: ScaleId[] = ['minor', 'harmonicMinor', 'dorian', 'phrygian', 'minorPentatonic', 'blues']

/** Whether the song's key reads as major or minor, to suggest fitting progressions first. */
export function keyMode(key: Key): 'major' | 'minor' {
  return MINOR_SCALES.includes(key.scale) ? 'minor' : 'major'
}

/** The progression's chords, built on the song's tonic in the progression's own mode (root position). */
export function progressionChords(progression: Progression, tonic: number): ChordInfo[] {
  const key: Key = { root: pitchClass(tonic), scale: progression.mode === 'major' ? 'major' : 'minor' }
  const scale = SCALES[key.scale].intervals
  return progression.chords.map(({ degree, seventh: isSeventh, quality }) => {
    const root = 48 + key.root + scale[degree]
    return quality ? buildChord(root, quality, key) : diatonicChord(root, key, isSeventh ? 4 : 3)
  })
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Total distance each note of `next` has to move from the nearest note of `prev`. */
function movement(prev: number[], next: number[]): number {
  return next.reduce((sum, n) => sum + Math.min(...prev.map((p) => Math.abs(p - n))), 0)
}

/**
 * Picks an inversion and octave for each chord so the voices move as little as possible from chord
 * to chord, while staying near `center` (the first chord prefers root position).
 */
export function voiceLead(chords: number[][], center = 60): number[][] {
  const out: number[][] = []
  for (const chord of chords) {
    const prev = out[out.length - 1]
    let best: number[] = chord
    let bestScore = Infinity
    for (let inversion = 0; inversion < chord.length; inversion++) {
      for (const shift of [-24, -12, 0, 12, 24]) {
        const candidate = invertChord(chord, inversion).map((p) => p + shift)
        if (candidate[0] < MIN_PITCH || candidate[candidate.length - 1] > MAX_PITCH) continue
        const drift = Math.abs(mean(candidate) - center)
        const score = prev ? movement(prev, candidate) + drift * 0.35 : drift + inversion * 3
        if (score < bestScore) {
          best = candidate
          bestScore = score
        }
      }
    }
    out.push(best)
  }
  return out
}

export type ChordRhythm = 'held' | 'half' | 'quarter' | 'offbeat' | 'arp8' | 'arp16'
export type BassStyle = 'none' | 'roots' | 'eighths' | 'octaves'

export type ProgressionSettings = {
  /** Length of the section to fill, in steps */
  steps: number
  /** How long each chord lasts, in steps (8 = half a bar, 16 = a bar, 32 = two bars) */
  chordSteps: number
  rhythm: ChordRhythm
  /** Center pitch the voicing stays around */
  center: number
  bass: BassStyle
}

/** Low bass register: roots land between E1 and D#2. */
export function bassPitch(rootPitchClass: number): number {
  return 28 + pitchClass(rootPitchClass - 4)
}

function chordNotes(pitches: number[], start: number, span: number, rhythm: ChordRhythm): NewNote[] {
  const hits = (every: number, length: number, offset = 0) => {
    const out: NewNote[] = []
    for (let o = offset; o < span; o += every) {
      const velocity = o % 16 === 0 ? 0.75 : 0.66
      for (const pitch of pitches) out.push({ pitch, start: start + o, length: Math.min(length, span - o), velocity })
    }
    return out
  }
  switch (rhythm) {
    case 'held':
      return hits(span, span)
    case 'half':
      return hits(8, 8)
    case 'quarter':
      return hits(4, 3)
    case 'offbeat':
      return hits(4, 2, 2)
    case 'arp8':
      return arpLine(pitches, start, span, 0.72, { pattern: 'up', rate: 2, octaves: 1 })
    case 'arp16':
      return arpLine(pitches, start, span, 0.68, { pattern: 'upDown', rate: 1, octaves: 2 })
  }
}

function bassNotes(root: number, start: number, span: number, style: BassStyle): NewNote[] {
  const low = bassPitch(root)
  if (style === 'roots') return [{ pitch: low, start, length: span, velocity: 0.8 }]
  const out: NewNote[] = []
  for (let o = 0, i = 0; o < span; o += 2, i++) {
    const pitch = style === 'octaves' && i % 2 === 1 ? low + 12 : low
    out.push({ pitch, start: start + o, length: Math.min(2, span - o), velocity: o % 4 === 0 ? 0.85 : 0.7 })
  }
  return out
}

/**
 * Writes a progression across a section: chords (smoothly voiced, in the chosen rhythm) and,
 * optionally, a bass line on the roots. The progression repeats until the section is full.
 */
export function writeProgression(
  progression: Progression,
  key: Key,
  settings: ProgressionSettings,
): { chords: NewNote[]; bass: NewNote[]; names: string[] } {
  const infos = progressionChords(progression, key.root)
  const voiced = voiceLead(
    infos.map((c) => c.pitches),
    settings.center,
  )
  const chords: NewNote[] = []
  const bass: NewNote[] = []
  for (let t = 0, i = 0; t < settings.steps; t += settings.chordSteps, i++) {
    const n = i % infos.length
    const span = Math.min(settings.chordSteps, settings.steps - t)
    chords.push(...chordNotes(voiced[n], t, span, settings.rhythm))
    if (settings.bass !== 'none') bass.push(...bassNotes(infos[n].root, t, span, settings.bass))
  }
  return { chords, bass, names: infos.map((c) => c.name) }
}
