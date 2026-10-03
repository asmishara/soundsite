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

export type InstrumentTrack = TrackBase & {
  kind: 'instrument'
  preset: InstrumentPresetId
  notes: Note[]
}

export type DrumTrack = TrackBase & {
  kind: 'drums'
  /** Velocity per step for each voice; 0 = off. Arrays are always `bars * STEPS_PER_BAR` long. */
  steps: Record<DrumVoiceId, number[]>
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

export type Song = {
  name: string
  bpm: number
  /** 0–1 */
  swing: number
  /** 1–16 */
  bars: number
  key: Key
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
