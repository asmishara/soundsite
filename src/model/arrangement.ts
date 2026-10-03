import { SECTION_COLORS } from './factory'
import { DRUM_VOICE_IDS } from './presets'
import {
  STEPS_PER_BAR,
  STEPS_PER_BEAT,
  type ArrangementEntry,
  type DrumPattern,
  type DrumTrack,
  type DrumVoiceId,
  type InstrumentTrack,
  type Note,
  type Section,
  type Song,
  type Track,
} from './types'

/** Shared empty list so missing parts don't create new arrays on every render. */
const EMPTY_NOTES: Note[] = []

export function sectionSteps(section: Section): number {
  return section.bars * STEPS_PER_BAR
}

export function findSection(song: Pick<Song, 'sections'>, id: string | null | undefined): Section | undefined {
  return id ? song.sections.find((s) => s.id === id) : undefined
}

/** A track's notes in one section. */
export function partNotes(track: InstrumentTrack, sectionId: string): Note[] {
  return track.notes[sectionId] ?? EMPTY_NOTES
}

/** A drum track's pattern in one section. */
export function partPattern(track: DrumTrack, sectionId: string): DrumPattern | undefined {
  return track.steps[sectionId]
}

export type Placement = {
  entry: ArrangementEntry
  section: Section
  index: number
  /** Absolute start, in steps from the beginning of the song */
  start: number
}

export type ArrangementLayout = { placements: Placement[]; totalSteps: number }

const layoutCache = new WeakMap<ArrangementEntry[], { sections: Section[]; layout: ArrangementLayout }>()

/** Where each arrangement entry sits on the song timeline. Cached per (arrangement, sections) snapshot. */
export function layoutArrangement(song: Pick<Song, 'arrangement' | 'sections'>): ArrangementLayout {
  const cached = layoutCache.get(song.arrangement)
  if (cached && cached.sections === song.sections) return cached.layout

  const byId = new Map(song.sections.map((s) => [s.id, s]))
  const placements: Placement[] = []
  let start = 0
  song.arrangement.forEach((entry) => {
    const section = byId.get(entry.sectionId)
    if (!section) return
    placements.push({ entry, section, index: placements.length, start })
    start += sectionSteps(section)
  })
  const layout = { placements, totalSteps: start }
  layoutCache.set(song.arrangement, { sections: song.sections, layout })
  return layout
}

/** The placement playing at an absolute song step, and the step within its section. */
export function locate(layout: ArrangementLayout, songStep: number): { placement: Placement; localStep: number } | null {
  for (const placement of layout.placements) {
    const local = songStep - placement.start
    if (local >= 0 && local < sectionSteps(placement.section)) return { placement, localStep: local }
  }
  return null
}

export function placementOf(layout: ArrangementLayout, entryId: string | null | undefined): Placement | undefined {
  return entryId ? layout.placements.find((p) => p.entry.id === entryId) : undefined
}

export function secondsPerStep(bpm: number): number {
  return 60 / bpm / STEPS_PER_BEAT
}

/**
 * Swing delays every off-beat 16th by up to 2/3 of a step (swing 1), matching Tone.js's swing curve.
 * Applied by the scheduler and by exports, so playback and exported files groove the same.
 */
export function swingOffsetSteps(step: number, swing: number): number {
  return step % 2 === 1 ? swing * (2 / 3) : 0
}

/** Whether a track can be heard, given every track's mute and solo state. */
export function isAudible(track: Track, tracks: Track[]): boolean {
  if (track.mixer.mute) return false
  const anySolo = tracks.some((t) => t.mixer.solo)
  return !anySolo || track.mixer.solo
}

export type SongEvent =
  | { type: 'note'; trackId: string; step: number; pitch: number; length: number; velocity: number }
  | { type: 'drum'; trackId: string; step: number; voice: DrumVoiceId; velocity: number }

/** Every note and drum hit in the arrangement, with absolute step positions, sorted by time. */
export function songEvents(song: Song): SongEvent[] {
  const events: SongEvent[] = []
  for (const { section, start } of layoutArrangement(song).placements) {
    const steps = sectionSteps(section)
    for (const track of song.tracks) {
      if (track.kind === 'instrument') {
        for (const note of partNotes(track, section.id)) {
          if (note.start >= steps) continue
          events.push({
            type: 'note',
            trackId: track.id,
            step: start + note.start,
            pitch: note.pitch,
            length: Math.min(note.length, steps - note.start),
            velocity: note.velocity,
          })
        }
      } else {
        const pattern = partPattern(track, section.id)
        if (!pattern) continue
        for (const voice of DRUM_VOICE_IDS) {
          pattern[voice].forEach((velocity, i) => {
            if (velocity > 0 && i < steps) events.push({ type: 'drum', trackId: track.id, step: start + i, voice, velocity })
          })
        }
      }
    }
  }
  return events.sort((a, b) => a.step - b.step)
}

/** Length of the whole arrangement in seconds. */
export function songDurationSeconds(song: Song): number {
  return layoutArrangement(song).totalSteps * secondsPerStep(song.bpm)
}

/** "Section C": the first letter not used by an existing "Section X" name. */
export function nextSectionName(sections: Section[]): string {
  const used = new Set(sections.map((s) => s.name))
  for (let i = 0; i < 26; i++) {
    const name = `Section ${String.fromCharCode(65 + i)}`
    if (!used.has(name)) return name
  }
  return `Section ${sections.length + 1}`
}

/** "Verse" → "Verse 2"; "Verse 2" → "Verse 3" (skipping names already taken). */
export function copyName(name: string, sections: Section[]): string {
  const used = new Set(sections.map((s) => s.name))
  const match = /^(.*?)\s+(\d+)$/.exec(name)
  const base = match ? match[1] : name
  let n = match ? Number(match[2]) + 1 : 2
  while (used.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

/** The first palette color no section uses yet (cycling once all are taken). */
export function nextSectionColor(sections: Section[]): string {
  const used = new Set(sections.map((s) => s.color))
  return SECTION_COLORS.find((c) => !used.has(c)) ?? SECTION_COLORS[sections.length % SECTION_COLORS.length]
}
