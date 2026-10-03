import { produce, type Draft } from 'immer'
import { create } from 'zustand'
import { copyName, nextSectionColor, nextSectionName, sectionSteps } from '../model/arrangement'
import { createDemoSong } from '../model/demoSong'
import { createDrumTrack, createEntry, createInstrumentTrack, createSection, emptyDrumSteps } from '../model/factory'
import { newId } from '../model/ids'
import { MAX_NAME_LENGTH, clamp, sanitizeNote } from '../model/rules'
import {
  MAX_BARS,
  MAX_BPM,
  MIN_BARS,
  MIN_BPM,
  STEPS_PER_BAR,
  type DrumPattern,
  type DrumVoiceId,
  type FxSettings,
  type InstrumentPresetId,
  type Key,
  type Mixer,
  type Note,
  type Section,
  type Song,
  type Track,
} from '../model/types'

const HISTORY_LIMIT = 100

export type NoteInput = Omit<Note, 'id'> & { id?: string }
export type NotePatch = Partial<Omit<Note, 'id'>>
/** Addresses one track's content in one section. */
export type PartRef = { trackId: string; sectionId: string }

type SongState = {
  song: Song
  past: Song[]
  future: Song[]
  /** Snapshot taken by beginTransaction(); edits made while set don't create history entries. */
  txBase: Song | null

  /** Replaces the song and clears history (used when restoring a session). */
  loadSong: (song: Song) => void
  /** Replaces the song as an undoable edit (New song, Open file). */
  replaceSong: (song: Song) => void
  undo: () => void
  redo: () => void
  beginTransaction: () => void
  endTransaction: () => void
  cancelTransaction: () => void

  setName: (name: string) => void
  setBpm: (bpm: number) => void
  setSwing: (swing: number) => void
  setKey: (key: Partial<Key>) => void
  setMasterVolume: (db: number) => void
  setFx: (patch: Partial<FxSettings>) => void

  setSectionBars: (sectionId: string, bars: number) => void
  renameSection: (sectionId: string, name: string) => void
  /** Adds an empty section, placed after `afterEntryId` (or at the end). */
  addSection: (afterEntryId: string | null) => { sectionId: string; entryId: string }
  /** Copies an entry's section into a new, independent section placed right after it. */
  duplicateSection: (entryId: string) => { sectionId: string; entryId: string } | null
  /** Plays an entry's section again right after it (a linked repeat). */
  repeatEntry: (entryId: string) => string | null
  /** Removes an entry; its section goes too once nothing plays it. The last entry can't be removed. */
  removeEntry: (entryId: string) => boolean
  moveEntry: (entryId: string, toIndex: number) => void

  addInstrumentTrack: (preset: InstrumentPresetId) => string
  addDrumTrack: () => string
  removeTrack: (id: string) => void
  updateTrack: (id: string, patch: { name?: string; color?: string; preset?: InstrumentPresetId }) => void
  moveTrack: (id: string, direction: -1 | 1) => void
  setMixer: (id: string, patch: Partial<Mixer>) => void

  addNotes: (part: PartRef, notes: NoteInput[]) => string[]
  updateNotes: (part: PartRef, patches: Record<string, NotePatch>) => void
  transformNotes: (part: PartRef, ids: string[], fn: (note: Note) => NotePatch) => void
  deleteNotes: (part: PartRef, ids: string[]) => void
  duplicateNotes: (part: PartRef, ids: string[]) => string[]

  setDrumStep: (part: PartRef, voice: DrumVoiceId, step: number, velocity: number) => void
}

/** The notes of an instrument part inside a draft, created if missing. */
function draftNotes(song: Draft<Song>, part: PartRef): { notes: Draft<Note>[]; section: Draft<Section> } | null {
  const track = song.tracks.find((t) => t.id === part.trackId)
  const section = song.sections.find((s) => s.id === part.sectionId)
  if (track?.kind !== 'instrument' || !section) return null
  track.notes[section.id] ??= []
  return { notes: track.notes[section.id], section }
}

function draftPattern(song: Draft<Song>, part: PartRef): Draft<DrumPattern> | null {
  const track = song.tracks.find((t) => t.id === part.trackId)
  const section = song.sections.find((s) => s.id === part.sectionId)
  if (track?.kind !== 'drums' || !section) return null
  track.steps[section.id] ??= emptyDrumSteps(section.bars)
  return track.steps[section.id]
}

function liveNotes(song: Song, part: PartRef): Note[] {
  const track = song.tracks.find((t) => t.id === part.trackId)
  return track?.kind === 'instrument' ? (track.notes[part.sectionId] ?? []) : []
}

export const useSongStore = create<SongState>()((set, get) => {
  /** Applies an immer recipe to the song, recording one undo step unless inside a transaction or nothing changed. */
  const edit = (recipe: (song: Draft<Song>) => void) => {
    const { song, txBase } = get()
    const next = produce(song, recipe)
    if (next === song) return
    if (txBase) {
      set({ song: next })
    } else {
      set((s) => ({ song: next, past: [...s.past, song].slice(-HISTORY_LIMIT), future: [] }))
    }
  }

  /** Inserts a new entry for `sectionId` right after `afterEntryId` (or at the end). */
  const insertEntry = (song: Draft<Song>, sectionId: string, afterEntryId: string | null) => {
    const entry = createEntry(sectionId)
    const i = afterEntryId ? song.arrangement.findIndex((e) => e.id === afterEntryId) : -1
    if (i < 0) song.arrangement.push(entry)
    else song.arrangement.splice(i + 1, 0, entry)
    return entry.id
  }

  return {
    song: createDemoSong(),
    past: [],
    future: [],
    txBase: null,

    loadSong: (song) => set({ song, past: [], future: [], txBase: null }),

    replaceSong: (song) => {
      get().endTransaction()
      set((s) => ({ song, past: [...s.past, s.song].slice(-HISTORY_LIMIT), future: [] }))
    },

    undo: () => {
      get().endTransaction()
      const { past, song, future } = get()
      if (past.length === 0) return
      set({ song: past[past.length - 1], past: past.slice(0, -1), future: [song, ...future] })
    },

    redo: () => {
      get().endTransaction()
      const { past, song, future } = get()
      if (future.length === 0) return
      set({ song: future[0], past: [...past, song].slice(-HISTORY_LIMIT), future: future.slice(1) })
    },

    beginTransaction: () => {
      if (!get().txBase) set({ txBase: get().song })
    },

    endTransaction: () => {
      const { txBase, song } = get()
      if (!txBase) return
      if (txBase === song) {
        set({ txBase: null })
      } else {
        set((s) => ({ txBase: null, past: [...s.past, txBase].slice(-HISTORY_LIMIT), future: [] }))
      }
    },

    cancelTransaction: () => {
      const { txBase } = get()
      if (txBase) set({ song: txBase, txBase: null })
    },

    setName: (name) =>
      edit((s) => {
        const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)
        if (trimmed) s.name = trimmed
      }),

    setBpm: (bpm) =>
      edit((s) => {
        s.bpm = clamp(Math.round(bpm), MIN_BPM, MAX_BPM)
      }),

    setSwing: (swing) =>
      edit((s) => {
        s.swing = clamp(swing, 0, 1)
      }),

    setKey: (key) =>
      edit((s) => {
        if (key.root !== undefined) s.key.root = ((Math.round(key.root) % 12) + 12) % 12
        if (key.scale !== undefined) s.key.scale = key.scale
      }),

    setMasterVolume: (db) =>
      edit((s) => {
        s.masterVolume = clamp(db, -60, 6)
      }),

    setFx: (patch) =>
      edit((s) => {
        if (patch.reverbDecay !== undefined) s.fx.reverbDecay = clamp(patch.reverbDecay, 0.2, 10)
        if (patch.reverbWet !== undefined) s.fx.reverbWet = clamp(patch.reverbWet, 0, 1)
        if (patch.delayTime !== undefined) s.fx.delayTime = patch.delayTime
        if (patch.delayFeedback !== undefined) s.fx.delayFeedback = clamp(patch.delayFeedback, 0, 0.9)
      }),

    setSectionBars: (sectionId, bars) =>
      edit((s) => {
        const section = s.sections.find((x) => x.id === sectionId)
        const n = clamp(Math.round(bars), MIN_BARS, MAX_BARS)
        if (!section || n === section.bars) return
        section.bars = n
        const total = n * STEPS_PER_BAR
        for (const track of s.tracks) {
          if (track.kind === 'drums') {
            const pattern = (track.steps[sectionId] ??= emptyDrumSteps(n))
            for (const voice of Object.keys(pattern) as DrumVoiceId[]) {
              const arr = pattern[voice]
              if (arr.length > total) arr.length = total
              while (arr.length < total) arr.push(0)
            }
          } else {
            const notes = (track.notes[sectionId] ?? []).filter((note) => note.start < total)
            for (const note of notes) note.length = Math.min(note.length, total - note.start)
            track.notes[sectionId] = notes
          }
        }
      }),

    renameSection: (sectionId, name) =>
      edit((s) => {
        const section = s.sections.find((x) => x.id === sectionId)
        const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)
        if (section && trimmed) section.name = trimmed
      }),

    addSection: (afterEntryId) => {
      const { song } = get()
      const after = song.arrangement.find((e) => e.id === afterEntryId)
      const bars = song.sections.find((x) => x.id === after?.sectionId)?.bars ?? 4
      const section = createSection(nextSectionName(song.sections), bars, nextSectionColor(song.sections))
      let entryId = ''
      edit((s) => {
        s.sections.push(section)
        for (const track of s.tracks) {
          if (track.kind === 'instrument') track.notes[section.id] = []
          else track.steps[section.id] = emptyDrumSteps(section.bars)
        }
        entryId = insertEntry(s, section.id, afterEntryId)
      })
      return { sectionId: section.id, entryId }
    },

    duplicateSection: (entryId) => {
      const { song } = get()
      const source = song.sections.find((x) => x.id === song.arrangement.find((e) => e.id === entryId)?.sectionId)
      if (!source) return null
      const section = createSection(copyName(source.name, song.sections), source.bars, nextSectionColor(song.sections))
      let newEntryId = ''
      edit((s) => {
        const at = s.sections.findIndex((x) => x.id === source.id)
        s.sections.splice(at + 1, 0, section)
        for (const track of s.tracks) {
          if (track.kind === 'instrument') {
            track.notes[section.id] = (track.notes[source.id] ?? []).map((n) => ({ ...n, id: newId('note') }))
          } else {
            const pattern = track.steps[source.id] ?? emptyDrumSteps(source.bars)
            track.steps[section.id] = Object.fromEntries(
              Object.entries(pattern).map(([voice, steps]) => [voice, [...steps]]),
            ) as DrumPattern
          }
        }
        newEntryId = insertEntry(s, section.id, entryId)
      })
      return { sectionId: section.id, entryId: newEntryId }
    },

    repeatEntry: (entryId) => {
      const entry = get().song.arrangement.find((e) => e.id === entryId)
      if (!entry) return null
      let newEntryId: string | null = null
      edit((s) => {
        newEntryId = insertEntry(s, entry.sectionId, entryId)
      })
      return newEntryId
    },

    removeEntry: (entryId) => {
      const { arrangement } = get().song
      const entry = arrangement.find((e) => e.id === entryId)
      if (!entry || arrangement.length <= 1) return false
      edit((s) => {
        s.arrangement = s.arrangement.filter((e) => e.id !== entryId)
        if (s.arrangement.some((e) => e.sectionId === entry.sectionId)) return
        // Nothing plays this section any more, so it and its content go too (undo brings them back).
        s.sections = s.sections.filter((x) => x.id !== entry.sectionId)
        for (const track of s.tracks) {
          if (track.kind === 'instrument') delete track.notes[entry.sectionId]
          else delete track.steps[entry.sectionId]
        }
      })
      return true
    },

    moveEntry: (entryId, toIndex) =>
      edit((s) => {
        const from = s.arrangement.findIndex((e) => e.id === entryId)
        const to = clamp(Math.round(toIndex), 0, s.arrangement.length - 1)
        if (from < 0 || from === to) return
        const [entry] = s.arrangement.splice(from, 1)
        s.arrangement.splice(to, 0, entry)
      }),

    addInstrumentTrack: (preset) => {
      const { song } = get()
      const track = createInstrumentTrack(preset, song.sections)
      const sameKind = song.tracks.filter((t) => t.kind === 'instrument' && t.preset === preset).length
      if (sameKind > 0) track.name = `${track.name} ${sameKind + 1}`
      edit((s) => {
        s.tracks.push(track)
      })
      return track.id
    },

    addDrumTrack: () => {
      const { song } = get()
      const drumCount = song.tracks.filter((t) => t.kind === 'drums').length
      const track = createDrumTrack(song.sections, drumCount > 0 ? `Drums ${drumCount + 1}` : 'Drums')
      edit((s) => {
        s.tracks.push(track)
      })
      return track.id
    },

    removeTrack: (id) =>
      edit((s) => {
        s.tracks = s.tracks.filter((t) => t.id !== id)
      }),

    updateTrack: (id, patch) =>
      edit((s) => {
        const track = s.tracks.find((t) => t.id === id)
        if (!track) return
        if (patch.name !== undefined) track.name = patch.name.trim() || track.name
        if (patch.color !== undefined) track.color = patch.color
        if (patch.preset !== undefined && track.kind === 'instrument') track.preset = patch.preset
      }),

    moveTrack: (id, direction) =>
      edit((s) => {
        const i = s.tracks.findIndex((t) => t.id === id)
        const j = i + direction
        if (i < 0 || j < 0 || j >= s.tracks.length) return
        const [track] = s.tracks.splice(i, 1)
        s.tracks.splice(j, 0, track)
      }),

    setMixer: (id, patch) =>
      edit((s) => {
        const track = s.tracks.find((t) => t.id === id)
        if (!track) return
        const m = track.mixer
        if (patch.volume !== undefined) m.volume = clamp(patch.volume, -60, 6)
        if (patch.pan !== undefined) m.pan = clamp(patch.pan, -1, 1)
        if (patch.mute !== undefined) m.mute = patch.mute
        if (patch.solo !== undefined) m.solo = patch.solo
        if (patch.reverbSend !== undefined) m.reverbSend = clamp(patch.reverbSend, 0, 1)
        if (patch.delaySend !== undefined) m.delaySend = clamp(patch.delaySend, 0, 1)
      }),

    addNotes: (part, notes) => {
      const created: Note[] = notes.map((n) => ({ ...n, id: n.id ?? newId('note') }))
      edit((s) => {
        const target = draftNotes(s, part)
        if (!target) return
        for (const note of created) {
          sanitizeNote(note, target.section.bars)
          target.notes.push(note)
        }
      })
      return created.map((n) => n.id)
    },

    updateNotes: (part, patches) =>
      edit((s) => {
        const target = draftNotes(s, part)
        if (!target) return
        for (const note of target.notes) {
          const patch = patches[note.id]
          if (!patch) continue
          Object.assign(note, patch)
          sanitizeNote(note, target.section.bars)
        }
      }),

    transformNotes: (part, ids, fn) => {
      const wanted = new Set(ids)
      const patches: Record<string, NotePatch> = {}
      for (const note of liveNotes(get().song, part)) if (wanted.has(note.id)) patches[note.id] = fn(note)
      get().updateNotes(part, patches)
    },

    deleteNotes: (part, ids) =>
      edit((s) => {
        const track = s.tracks.find((t) => t.id === part.trackId)
        if (track?.kind !== 'instrument' || !track.notes[part.sectionId]) return
        const doomed = new Set(ids)
        track.notes[part.sectionId] = track.notes[part.sectionId].filter((n) => !doomed.has(n.id))
      }),

    duplicateNotes: (part, ids) => {
      const { song } = get()
      const section = song.sections.find((x) => x.id === part.sectionId)
      const wanted = new Set(ids)
      const source = liveNotes(song, part).filter((n) => wanted.has(n.id))
      if (!section || source.length === 0) return []
      const first = Math.min(...source.map((n) => n.start))
      const last = Math.max(...source.map((n) => n.start + n.length))
      const offset = last - first
      const total = sectionSteps(section)
      const copies = source
        .filter((n) => n.start + offset < total)
        .map(({ pitch, start, length, velocity }) => ({ pitch, start: start + offset, length, velocity }))
      return get().addNotes(part, copies)
    },

    setDrumStep: (part, voice, step, velocity) =>
      edit((s) => {
        const pattern = draftPattern(s, part)
        if (!pattern || step < 0 || step >= pattern[voice].length) return
        pattern[voice][step] = clamp(velocity, 0, 1)
      }),
  }
})

export function getTrack(song: Song, id: string | null): Track | undefined {
  return id ? song.tracks.find((t) => t.id === id) : undefined
}
