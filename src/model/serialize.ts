import { nextSectionColor, nextSectionName } from './arrangement'
import { SECTION_COLORS, createEmptySong, createEntry, createSection, emptyDrumSteps } from './factory'
import { newId } from './ids'
import { SCALE_IDS } from './music'
import { DRUM_COLOR, DRUM_VOICE_IDS, INSTRUMENT_PRESETS, INSTRUMENT_PRESET_IDS, defaultMixer } from './presets'
import { MAX_NAME_LENGTH, clamp, sanitizeNote } from './rules'
import {
  MAX_BARS,
  MAX_BPM,
  MIN_BARS,
  MIN_BPM,
  STEPS_PER_BAR,
  type ArrangementEntry,
  type DelayTime,
  type DrumPattern,
  type InstrumentPresetId,
  type Mixer,
  type Note,
  type ScaleId,
  type Section,
  type Song,
  type Track,
} from './types'

export const FILE_FORMAT = 'soundsite-song'
/** v1: a single loop. v2: sections and an arrangement. */
export const FILE_VERSION = 2
export const FILE_EXTENSION = '.soundsite.json'

const MAX_TRACKS = 64
const MAX_SECTIONS = 64
const MAX_ENTRIES = 256
const MAX_NOTES_PER_PART = 20_000
const DELAY_TIMES: DelayTime[] = ['16n', '8n', '8n.', '4n']

type Raw = Record<string, unknown>

export type SongFile = {
  format: typeof FILE_FORMAT
  version: number
  savedAt: string
  song: Song
}

/** Thrown for files that can't be read as a song; `message` is written for the user. */
export class SongFileError extends Error {}

export function serializeSong(song: Song): string {
  const file: SongFile = { format: FILE_FORMAT, version: FILE_VERSION, savedAt: new Date().toISOString(), song }
  return JSON.stringify(file)
}

/**
 * Parses a song file (or a bare song object) into a valid Song. Older versions are upgraded,
 * anything missing or out of range is repaired rather than rejected, and every id is regenerated
 * so ids are always unique.
 */
export function parseSong(input: string | unknown): Song {
  let data: unknown = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch {
      throw new SongFileError("This file isn't valid JSON, so it can't be a Soundsite song.")
    }
  }
  if (!isObject(data)) throw new SongFileError("This file doesn't contain a Soundsite song.")

  if ('format' in data) {
    if (data.format !== FILE_FORMAT) throw new SongFileError("This file isn't a Soundsite song.")
    if (typeof data.version === 'number' && data.version > FILE_VERSION) {
      throw new SongFileError('This song was saved by a newer version of Soundsite. Refresh the page and try again.')
    }
    data = data.song
  }
  if (!isObject(data) || !Array.isArray(data.tracks)) {
    throw new SongFileError("This file doesn't contain a Soundsite song.")
  }
  return normalizeSong(Array.isArray(data.sections) ? data : upgradeV1(data))
}

/** v1 songs were one loop: `bars` on the song, and notes/steps directly on each track. They become one section. */
function upgradeV1(raw: Raw): Raw {
  const sectionId = 'v1'
  return {
    ...raw,
    sections: [{ id: sectionId, name: 'Section A', bars: raw.bars, color: SECTION_COLORS[0] }],
    arrangement: [{ sectionId }],
    tracks: (raw.tracks as unknown[]).map((t) =>
      isObject(t) ? { ...t, notes: { [sectionId]: t.notes }, steps: { [sectionId]: t.steps } } : t,
    ),
  }
}

function normalizeSong(raw: Raw): Song {
  const defaults = createEmptySong()
  const key = isObject(raw.key) ? raw.key : {}
  const fx = isObject(raw.fx) ? raw.fx : {}

  // Sections get new ids; remember the file's ids so track parts and entries can be re-keyed.
  const sections: Section[] = []
  const byFileId = new Map<string, Section>()
  const fileIdOf = new Map<string, string>()
  for (const rawSection of list(raw.sections).slice(0, MAX_SECTIONS)) {
    if (!isObject(rawSection)) continue
    const fileId = typeof rawSection.id === 'string' ? rawSection.id : null
    if (fileId !== null && byFileId.has(fileId)) continue
    const section: Section = {
      id: newId('section'),
      name: str(rawSection.name, nextSectionName(sections)),
      bars: Math.round(num(rawSection.bars, 4, MIN_BARS, MAX_BARS)),
      color: color(rawSection.color, nextSectionColor(sections)),
    }
    sections.push(section)
    if (fileId !== null) {
      byFileId.set(fileId, section)
      fileIdOf.set(section.id, fileId)
    }
  }
  if (sections.length === 0) sections.push(createSection('Section A', 4))

  const arrangement: ArrangementEntry[] = []
  for (const rawEntry of list(raw.arrangement).slice(0, MAX_ENTRIES)) {
    const section = isObject(rawEntry) && typeof rawEntry.sectionId === 'string' ? byFileId.get(rawEntry.sectionId) : undefined
    if (section) arrangement.push(createEntry(section.id))
  }
  // Keep every section reachable: ones the arrangement never plays are added at the end.
  for (const section of sections) {
    if (!arrangement.some((e) => e.sectionId === section.id)) arrangement.push(createEntry(section.id))
  }

  return {
    name: str(raw.name, defaults.name),
    bpm: Math.round(num(raw.bpm, defaults.bpm, MIN_BPM, MAX_BPM)),
    swing: num(raw.swing, defaults.swing, 0, 1),
    key: {
      root: Math.round(num(key.root, 0, 0, 11)),
      scale: oneOf<ScaleId>(key.scale, SCALE_IDS, defaults.key.scale),
    },
    sections,
    arrangement,
    masterVolume: num(raw.masterVolume, defaults.masterVolume, -60, 6),
    fx: {
      reverbDecay: num(fx.reverbDecay, defaults.fx.reverbDecay, 0.2, 10),
      reverbWet: num(fx.reverbWet, defaults.fx.reverbWet, 0, 1),
      delayTime: oneOf<DelayTime>(fx.delayTime, DELAY_TIMES, defaults.fx.delayTime),
      delayFeedback: num(fx.delayFeedback, defaults.fx.delayFeedback, 0, 0.9),
    },
    tracks: list(raw.tracks)
      .slice(0, MAX_TRACKS)
      .map((t) => normalizeTrack(t, sections, fileIdOf))
      .filter((t): t is Track => t !== null),
  }
}

function normalizeTrack(raw: unknown, sections: Section[], fileIdOf: Map<string, string>): Track | null {
  if (!isObject(raw)) return null
  const mixer = normalizeMixer(raw.mixer)
  /** The file's content for a section, if any. */
  const partIn = (parts: unknown, section: Section): unknown => {
    const fileId = fileIdOf.get(section.id)
    return isObject(parts) && fileId !== undefined ? parts[fileId] : undefined
  }

  if (raw.kind === 'drums') {
    const steps: Record<string, DrumPattern> = {}
    for (const section of sections) steps[section.id] = normalizePattern(partIn(raw.steps, section), section.bars)
    return { id: newId('track'), kind: 'drums', name: str(raw.name, 'Drums'), color: color(raw.color, DRUM_COLOR), steps, mixer }
  }

  if (raw.kind === 'instrument') {
    const preset = oneOf<InstrumentPresetId>(raw.preset, INSTRUMENT_PRESET_IDS, 'lead')
    const notes: Record<string, Note[]> = {}
    for (const section of sections) {
      notes[section.id] = list(partIn(raw.notes, section))
        .slice(0, MAX_NOTES_PER_PART)
        .map((n) => normalizeNote(n, section.bars))
        .filter((n): n is Note => n !== null)
    }
    return {
      id: newId('track'),
      kind: 'instrument',
      name: str(raw.name, INSTRUMENT_PRESETS[preset].label),
      color: color(raw.color, INSTRUMENT_PRESETS[preset].color),
      preset,
      notes,
      mixer,
    }
  }

  return null
}

function normalizePattern(raw: unknown, bars: number): DrumPattern {
  const pattern = emptyDrumSteps(bars)
  if (!isObject(raw)) return pattern
  for (const voice of DRUM_VOICE_IDS) {
    const source = raw[voice]
    if (Array.isArray(source)) pattern[voice] = pattern[voice].map((_, i) => num(source[i], 0, 0, 1))
  }
  return pattern
}

function normalizeNote(raw: unknown, bars: number): Note | null {
  if (!isObject(raw)) return null
  const { pitch, start } = raw
  if (!isFiniteNumber(pitch) || !isFiniteNumber(start)) return null
  // Notes that start after the section ends would be clamped onto its last step; drop them instead.
  if (start < 0 || start >= bars * STEPS_PER_BAR) return null
  const note: Note = {
    id: newId('note'),
    pitch,
    start,
    length: isFiniteNumber(raw.length) ? raw.length : 1,
    velocity: isFiniteNumber(raw.velocity) ? raw.velocity : 0.8,
  }
  sanitizeNote(note, bars)
  return note
}

function normalizeMixer(raw: unknown): Mixer {
  const d = defaultMixer()
  if (!isObject(raw)) return d
  return {
    volume: num(raw.volume, d.volume, -60, 6),
    pan: num(raw.pan, d.pan, -1, 1),
    mute: typeof raw.mute === 'boolean' ? raw.mute : d.mute,
    solo: typeof raw.solo === 'boolean' ? raw.solo : d.solo,
    reverbSend: num(raw.reverbSend, d.reverbSend, 0, 1),
    delaySend: num(raw.delaySend, d.delaySend, 0, 1),
  }
}

function isObject(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function num(v: unknown, fallback: number, lo: number, hi: number): number {
  return isFiniteNumber(v) ? clamp(v, lo, hi) : fallback
}

function str(v: unknown, fallback: string): string {
  const s = typeof v === 'string' ? v.trim().slice(0, MAX_NAME_LENGTH) : ''
  return s || fallback
}

function color(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}

/** "Night drive (demo)" → "night-drive-demo" */
export function songSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'song'
}

/** "Night drive (demo)" → "night-drive-demo.soundsite.json" */
export function songFileName(name: string): string {
  return songSlug(name) + FILE_EXTENSION
}
