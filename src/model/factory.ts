import { newId } from './ids'
import { DRUM_COLOR, DRUM_VOICE_IDS, INSTRUMENT_PRESETS, defaultMixer } from './presets'
import {
  STEPS_PER_BAR,
  type ArrangementEntry,
  type DrumPattern,
  type DrumTrack,
  type InstrumentPresetId,
  type InstrumentTrack,
  type Note,
  type Section,
  type Song,
} from './types'

/** Colors handed out to new sections in turn. */
export const SECTION_COLORS = ['#8b9dff', '#f472b6', '#34d399', '#fbbf24', '#22d3ee', '#fb923c', '#a78bfa', '#f87171']

export function emptyDrumSteps(bars: number): DrumPattern {
  return Object.fromEntries(DRUM_VOICE_IDS.map((v) => [v, new Array(bars * STEPS_PER_BAR).fill(0)])) as DrumPattern
}

export function createSection(name: string, bars: number, color: string = SECTION_COLORS[0]): Section {
  return { id: newId('section'), name, bars, color }
}

export function createEntry(sectionId: string): ArrangementEntry {
  return { id: newId('entry'), sectionId }
}

export function createInstrumentTrack(preset: InstrumentPresetId, sections: Section[], name?: string): InstrumentTrack {
  const meta = INSTRUMENT_PRESETS[preset]
  return {
    id: newId('track'),
    kind: 'instrument',
    name: name ?? meta.label,
    color: meta.color,
    preset,
    notes: Object.fromEntries(sections.map((s) => [s.id, []])),
    mixer: defaultMixer(),
  }
}

export function createDrumTrack(sections: Section[], name = 'Drums'): DrumTrack {
  return {
    id: newId('track'),
    kind: 'drums',
    name,
    color: DRUM_COLOR,
    steps: Object.fromEntries(sections.map((s) => [s.id, emptyDrumSteps(s.bars)])),
    mixer: defaultMixer({ volume: -4, reverbSend: 0.08 }),
  }
}

export function createNote(pitch: number, start: number, length: number, velocity = 0.8): Note {
  return { id: newId('note'), pitch, start, length, velocity }
}

/** A song with a single empty 4-bar section and no tracks. */
export function createEmptySong(): Song {
  const section = createSection('Section A', 4)
  return {
    name: 'Untitled song',
    bpm: 120,
    swing: 0,
    key: { root: 0, scale: 'major' },
    sections: [section],
    arrangement: [createEntry(section.id)],
    tracks: [],
    masterVolume: -3,
    fx: { reverbDecay: 2.5, reverbWet: 1, delayTime: '8n.', delayFeedback: 0.35 },
  }
}

/** A blank song with one instrument and one drum track, ready to write into. */
export function createNewSong(): Song {
  const song = createEmptySong()
  song.tracks = [createInstrumentTrack('keys', song.sections), createDrumTrack(song.sections)]
  return song
}
