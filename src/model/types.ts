export type ScaleId =
  | 'major'
  | 'minor'
  | 'harmonicMinor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'majorPentatonic'
  | 'minorPentatonic'
  | 'blues'
  | 'chromatic'

export type Key = {
  /** Pitch class of the tonic, 0 = C … 11 = B */
  root: number
  scale: ScaleId
}

export type InstrumentPresetId = 'lead' | 'bass' | 'pad' | 'keys' | 'pluck' | 'bell'

export type DrumVoiceId =
  | 'kick'
  | 'snare'
  | 'clap'
  | 'hatClosed'
  | 'hatOpen'
  | 'tomLow'
  | 'tomHigh'
  | 'rim'
  | 'crash'

export type Note = {
  id: string
  /** MIDI note number (60 = C4) */
  pitch: number
  /** Start position in 16th-note steps */
  start: number
  /** Length in 16th-note steps */
  length: number
  /** 0–1 */
  velocity: number
}

/** A note that hasn't been given an id yet. */
export type NewNote = Omit<Note, 'id'>

export type Mixer = {
  /** dB, -60 … +6 */
  volume: number
  /** -1 (left) … 1 (right) */
  pan: number
  mute: boolean
  solo: boolean
  /** 0–1 */
  reverbSend: number
  /** 0–1 */
  delaySend: number
}

type TrackBase = {
  id: string
  name: string
  color: string
  mixer: Mixer
}

/** Velocity per step for each drum voice; 0 = off. */
export type DrumPattern = Record<DrumVoiceId, number[]>

export type InstrumentTrack = TrackBase & {
  kind: 'instrument'
  preset: InstrumentPresetId
  /** The track's notes in each section, keyed by section id. Every section has an entry. */
  notes: Record<string, Note[]>
}

export type DrumTrack = TrackBase & {
  kind: 'drums'
  /** The track's pattern in each section, keyed by section id. Arrays are `section.bars * STEPS_PER_BAR` long. */
  steps: Record<string, DrumPattern>
}

export type Track = InstrumentTrack | DrumTrack

export type DelayTime = '16n' | '8n' | '8n.' | '4n'

export type FxSettings = {
  /** Seconds */
  reverbDecay: number
  /** 0–1 */
  reverbWet: number
  delayTime: DelayTime
  /** 0–0.9 */
  delayFeedback: number
}

/** A part of the song (e.g. Intro, Verse, Chorus) with its own notes and patterns on every track. */
export type Section = {
  id: string
  name: string
  /** 1–16 */
  bars: number
  color: string
}

/** One slot in the song order. Several entries may play the same section (linked repeats). */
export type ArrangementEntry = {
  id: string
  sectionId: string
}

export type Song = {
  name: string
  bpm: number
  /** 0–1 */
  swing: number
  key: Key
  /** Every section is referenced by at least one arrangement entry. */
  sections: Section[]
  /** The order sections play in. Never empty. */
  arrangement: ArrangementEntry[]
  tracks: Track[]
  /** dB */
  masterVolume: number
  fx: FxSettings
}

export const STEPS_PER_BAR = 16
export const STEPS_PER_BEAT = 4
export const MIN_BARS = 1
export const MAX_BARS = 16
export const MIN_BPM = 40
export const MAX_BPM = 240
/** C1 */
export const MIN_PITCH = 24
/** C7 */
export const MAX_PITCH = 96
