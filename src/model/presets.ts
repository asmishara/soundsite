import type { DrumVoiceId, InstrumentPresetId, Mixer } from './types'

export const INSTRUMENT_PRESETS: Record<InstrumentPresetId, { label: string; color: string; description: string }> = {
  lead: { label: 'Lead', color: '#f472b6', description: 'Bright detuned saw' },
  bass: { label: 'Bass', color: '#60a5fa', description: 'Punchy filtered mono bass' },
  pad: { label: 'Pad', color: '#a78bfa', description: 'Slow, warm chorus pad' },
  keys: { label: 'Keys', color: '#fbbf24', description: 'Electric piano' },
  pluck: { label: 'Pluck', color: '#34d399', description: 'Short plucked tone' },
  bell: { label: 'Bell', color: '#22d3ee', description: 'Glassy FM bell' },
}

export const INSTRUMENT_PRESET_IDS = Object.keys(INSTRUMENT_PRESETS) as InstrumentPresetId[]

export const DRUM_COLOR = '#fb923c'

/** Top-to-bottom order in the step sequencer. */
export const DRUM_VOICES: { id: DrumVoiceId; label: string }[] = [
  { id: 'crash', label: 'Crash' },
  { id: 'hatOpen', label: 'Open hat' },
  { id: 'hatClosed', label: 'Closed hat' },
  { id: 'rim', label: 'Rim' },
  { id: 'tomHigh', label: 'High tom' },
  { id: 'tomLow', label: 'Low tom' },
  { id: 'clap', label: 'Clap' },
  { id: 'snare', label: 'Snare' },
  { id: 'kick', label: 'Kick' },
]

export const DRUM_VOICE_IDS = DRUM_VOICES.map((v) => v.id)

export const NORMAL_VELOCITY = 0.7
export const ACCENT_VELOCITY = 1

export function defaultMixer(overrides: Partial<Mixer> = {}): Mixer {
  return { volume: -6, pan: 0, mute: false, solo: false, reverbSend: 0.15, delaySend: 0, ...overrides }
}
