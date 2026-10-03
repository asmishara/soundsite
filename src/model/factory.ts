import { newId } from './ids'
import { DRUM_COLOR, DRUM_VOICE_IDS, INSTRUMENT_PRESETS, defaultMixer } from './presets'
import {
  STEPS_PER_BAR,
  type DrumTrack,
  type DrumVoiceId,
  type InstrumentPresetId,
  type InstrumentTrack,
  type Note,
  type Song,
} from './types'

export function emptyDrumSteps(bars: number): Record<DrumVoiceId, number[]> {
  return Object.fromEntries(DRUM_VOICE_IDS.map((v) => [v, new Array(bars * STEPS_PER_BAR).fill(0)])) as Record<
    DrumVoiceId,
    number[]
  >
}

export function createInstrumentTrack(preset: InstrumentPresetId, name?: string): InstrumentTrack {
  const meta = INSTRUMENT_PRESETS[preset]
  return {
    id: newId('track'),
    kind: 'instrument',
    name: name ?? meta.label,
    color: meta.color,
    preset,
    notes: [],
    mixer: defaultMixer(),
  }
}

export function createDrumTrack(bars: number, name = 'Drums'): DrumTrack {
  return {
    id: newId('track'),
    kind: 'drums',
    name,
    color: DRUM_COLOR,
    steps: emptyDrumSteps(bars),
    mixer: defaultMixer({ volume: -4, reverbSend: 0.08 }),
  }
}

export function createNote(pitch: number, start: number, length: number, velocity = 0.8): Note {
  return { id: newId('note'), pitch, start, length, velocity }
}

export function createEmptySong(): Song {
  return {
    name: 'Untitled song',
    bpm: 120,
    swing: 0,
    bars: 4,
    key: { root: 0, scale: 'major' },
    tracks: [],
    masterVolume: -3,
    fx: { reverbDecay: 2.5, reverbWet: 1, delayTime: '8n.', delayFeedback: 0.35 },
  }
}

/** A blank song with one instrument and one drum track, ready to write into. */
export function createNewSong(): Song {
  const song = createEmptySong()
  song.tracks = [createInstrumentTrack('keys'), createDrumTrack(song.bars)]
  return song
}
