import { createEmptySong, emptyDrumSteps } from './factory'
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
  type DelayTime,
  type InstrumentPresetId,
  type Mixer,
  type Note,
  type ScaleId,
  type Song,
  type Track,
} from './types'

export const FILE_FORMAT = 'soundsite-song'
export const FILE_VERSION = 1
export const FILE_EXTENSION = '.soundsite.json'

const MAX_TRACKS = 64
const MAX_NOTES_PER_TRACK = 20_000
const DELAY_TIMES: DelayTime[] = ['16n', '8n', '8n.', '4n']

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
 * Parses a song file (or a bare song object) into a valid Song. Anything missing or out of
 * range is repaired rather than rejected, and every id is regenerated so ids are always unique.
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
  return normalizeSong(data)
}

function normalizeSong(raw: Record<string, unknown>): Song {
  const defaults = createEmptySong()
  const key = isObject(raw.key) ? raw.key : {}
  const fx = isObject(raw.fx) ? raw.fx : {}
  const bars = Math.round(num(raw.bars, defaults.bars, MIN_BARS, MAX_BARS))

  return {
    name: str(raw.name, defaults.name),
    bpm: Math.round(num(raw.bpm, defaults.bpm, MIN_BPM, MAX_BPM)),
    swing: num(raw.swing, defaults.swing, 0, 1),
    bars,
    key: {
      root: Math.round(num(key.root, 0, 0, 11)),
      scale: oneOf<ScaleId>(key.scale, SCALE_IDS, defaults.key.scale),
    },
    masterVolume: num(raw.masterVolume, defaults.masterVolume, -60, 6),
    fx: {
      reverbDecay: num(fx.reverbDecay, defaults.fx.reverbDecay, 0.2, 10),
      reverbWet: num(fx.reverbWet, defaults.fx.reverbWet, 0, 1),
      delayTime: oneOf<DelayTime>(fx.delayTime, DELAY_TIMES, defaults.fx.delayTime),
      delayFeedback: num(fx.delayFeedback, defaults.fx.delayFeedback, 0, 0.9),
    },
    tracks: (raw.tracks as unknown[])
      .slice(0, MAX_TRACKS)
      .map((t) => normalizeTrack(t, bars))
      .filter((t): t is Track => t !== null),
  }
}

function normalizeTrack(raw: unknown, bars: number): Track | null {
  if (!isObject(raw)) return null
  const mixer = normalizeMixer(raw.mixer)

  if (raw.kind === 'drums') {
    const steps = emptyDrumSteps(bars)
    const rawSteps = isObject(raw.steps) ? raw.steps : {}
    for (const voice of DRUM_VOICE_IDS) {
      const source = rawSteps[voice]
      if (!Array.isArray(source)) continue
      steps[voice] = steps[voice].map((_, i) => num(source[i], 0, 0, 1))
    }
    return { id: newId('track'), kind: 'drums', name: str(raw.name, 'Drums'), color: color(raw.color, DRUM_COLOR), steps, mixer }
  }

  if (raw.kind === 'instrument') {
    const preset = oneOf<InstrumentPresetId>(raw.preset, INSTRUMENT_PRESET_IDS, 'lead')
    const notes = Array.isArray(raw.notes)
      ? raw.notes
          .slice(0, MAX_NOTES_PER_TRACK)
          .map((n) => normalizeNote(n, bars))
          .filter((n): n is Note => n !== null)
      : []
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

function normalizeNote(raw: unknown, bars: number): Note | null {
  if (!isObject(raw)) return null
  const { pitch, start } = raw
  if (!isFiniteNumber(pitch) || !isFiniteNumber(start)) return null
  // Notes that start after the song ends would be clamped onto the last step; drop them instead.
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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
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

/** "Night drive (demo)" → "night-drive-demo.soundsite.json" */
export function songFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return (slug || 'song') + FILE_EXTENSION
}
