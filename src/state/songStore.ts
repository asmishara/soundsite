import { produce, type Draft } from 'immer'
import { create } from 'zustand'
import { createDemoSong } from '../model/demoSong'
import { createDrumTrack, createInstrumentTrack } from '../model/factory'
import { newId } from '../model/ids'
import { MAX_NAME_LENGTH, clamp, sanitizeNote } from '../model/rules'
import {
  MAX_BARS,
  MAX_BPM,
  MIN_BARS,
  MIN_BPM,
  STEPS_PER_BAR,
  type DrumTrack,
  type DrumVoiceId,
  type FxSettings,
  type InstrumentPresetId,
  type InstrumentTrack,
  type Key,
  type Mixer,
  type Note,
  type Song,
  type Track,
} from '../model/types'

const HISTORY_LIMIT = 100

export type NoteInput = Omit<Note, 'id'> & { id?: string }
export type NotePatch = Partial<Omit<Note, 'id'>>

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
  setBars: (bars: number) => void
  setKey: (key: Partial<Key>) => void
  setMasterVolume: (db: number) => void
  setFx: (patch: Partial<FxSettings>) => void

  addInstrumentTrack: (preset: InstrumentPresetId) => string
  addDrumTrack: () => string
  removeTrack: (id: string) => void
  updateTrack: (id: string, patch: { name?: string; color?: string; preset?: InstrumentPresetId }) => void
  moveTrack: (id: string, direction: -1 | 1) => void
  setMixer: (id: string, patch: Partial<Mixer>) => void

  addNotes: (trackId: string, notes: NoteInput[]) => string[]
  updateNotes: (trackId: string, patches: Record<string, NotePatch>) => void
  transformNotes: (trackId: string, ids: string[], fn: (note: Note) => NotePatch) => void
  deleteNotes: (trackId: string, ids: string[]) => void
  duplicateNotes: (trackId: string, ids: string[]) => string[]

  setDrumStep: (trackId: string, voice: DrumVoiceId, step: number, velocity: number) => void
}

export function totalSteps(song: Song): number {
  return song.bars * STEPS_PER_BAR
}

function findInstrumentTrack(song: Draft<Song>, id: string): Draft<InstrumentTrack> | undefined {
  const t = song.tracks.find((t) => t.id === id)
  return t?.kind === 'instrument' ? t : undefined
}

function findDrumTrack(song: Draft<Song>, id: string): Draft<DrumTrack> | undefined {
  const t = song.tracks.find((t) => t.id === id)
  return t?.kind === 'drums' ? t : undefined
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

    setBars: (bars) =>
      edit((s) => {
        const n = clamp(Math.round(bars), MIN_BARS, MAX_BARS)
        if (n === s.bars) return
        s.bars = n
        const total = n * STEPS_PER_BAR
        for (const track of s.tracks) {
          if (track.kind === 'drums') {
            for (const voice of Object.keys(track.steps) as DrumVoiceId[]) {
              const arr = track.steps[voice]
              if (arr.length > total) arr.length = total
              while (arr.length < total) arr.push(0)
            }
          } else {
            track.notes = track.notes.filter((note) => note.start < total)
            for (const note of track.notes) note.length = Math.min(note.length, total - note.start)
          }
        }
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

    addInstrumentTrack: (preset) => {
      const track = createInstrumentTrack(preset)
      const sameKind = get().song.tracks.filter((t) => t.kind === 'instrument' && t.preset === preset).length
      if (sameKind > 0) track.name = `${track.name} ${sameKind + 1}`
      edit((s) => {
        s.tracks.push(track)
      })
      return track.id
    },

    addDrumTrack: () => {
      const { song } = get()
      const drumCount = song.tracks.filter((t) => t.kind === 'drums').length
      const track = createDrumTrack(song.bars, drumCount > 0 ? `Drums ${drumCount + 1}` : 'Drums')
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

    addNotes: (trackId, notes) => {
      const created: Note[] = notes.map((n) => ({ ...n, id: n.id ?? newId('note') }))
      edit((s) => {
        const track = findInstrumentTrack(s, trackId)
        if (!track) return
        for (const note of created) {
          sanitizeNote(note, s.bars)
          track.notes.push(note)
        }
      })
      return created.map((n) => n.id)
    },

    updateNotes: (trackId, patches) =>
      edit((s) => {
        const track = findInstrumentTrack(s, trackId)
        if (!track) return
        for (const note of track.notes) {
          const patch = patches[note.id]
          if (!patch) continue
          Object.assign(note, patch)
          sanitizeNote(note, s.bars)
        }
      }),

    transformNotes: (trackId, ids, fn) => {
      const track = get().song.tracks.find((t): t is InstrumentTrack => t.id === trackId && t.kind === 'instrument')
      if (!track) return
      const wanted = new Set(ids)
      const patches: Record<string, NotePatch> = {}
      for (const note of track.notes) if (wanted.has(note.id)) patches[note.id] = fn(note)
      get().updateNotes(trackId, patches)
    },

    deleteNotes: (trackId, ids) =>
      edit((s) => {
        const track = findInstrumentTrack(s, trackId)
        if (!track) return
        const doomed = new Set(ids)
        track.notes = track.notes.filter((n) => !doomed.has(n.id))
      }),

    duplicateNotes: (trackId, ids) => {
      const track = get().song.tracks.find((t): t is InstrumentTrack => t.id === trackId && t.kind === 'instrument')
      if (!track) return []
      const wanted = new Set(ids)
      const source = track.notes.filter((n) => wanted.has(n.id))
      if (source.length === 0) return []
      const first = Math.min(...source.map((n) => n.start))
      const last = Math.max(...source.map((n) => n.start + n.length))
      const offset = last - first
      const total = totalSteps(get().song)
      const copies = source
        .filter((n) => n.start + offset < total)
        .map(({ pitch, start, length, velocity }) => ({ pitch, start: start + offset, length, velocity }))
      return get().addNotes(trackId, copies)
    },

    setDrumStep: (trackId, voice, step, velocity) =>
      edit((s) => {
        const track = findDrumTrack(s, trackId)
        if (!track || step < 0 || step >= track.steps[voice].length) return
        track.steps[voice][step] = clamp(velocity, 0, 1)
      }),
  }
})

export function getTrack(song: Song, id: string | null): Track | undefined {
  return id ? song.tracks.find((t) => t.id === id) : undefined
}
