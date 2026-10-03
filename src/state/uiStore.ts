import { create } from 'zustand'
import type { ChordInfo, ChordQuality } from '../model/music'

export type Tool = 'draw' | 'select'
export type ChordMode = 'off' | 'diatonic3' | 'diatonic4' | ChordQuality

/** Grid options in 16th-note steps. */
export const SNAP_OPTIONS = [
  { steps: 1, label: '1/16' },
  { steps: 2, label: '1/8' },
  { steps: 4, label: '1/4' },
  { steps: 8, label: '1/2' },
  { steps: 16, label: 'Bar' },
] as const

export type Notice = {
  id: number
  message: string
  tone: 'info' | 'error'
  action?: { label: string; run: () => void }
}

export const MIN_ZOOM = 10
export const MAX_ZOOM = 56

type UiState = {
  selectedTrackId: string | null
  tool: Tool
  /** Grid snap in steps */
  snap: number
  /** Length of newly drawn notes, in steps */
  noteLength: number
  chordMode: ChordMode
  chordInversion: number
  snapToScale: boolean
  selectedNoteIds: string[]
  /** Pixels per 16th-note step */
  zoom: number
  mixerOpen: boolean
  audioReady: boolean
  /** Last chord placed with chord mode, shown in the toolbar */
  lastChord: ChordInfo | null
  /** Transient message shown as a toast */
  notice: Notice | null

  selectTrack: (id: string | null) => void
  setTool: (tool: Tool) => void
  setSnap: (steps: number) => void
  setNoteLength: (steps: number) => void
  setChordMode: (mode: ChordMode) => void
  setChordInversion: (inversion: number) => void
  setSnapToScale: (on: boolean) => void
  setSelection: (ids: string[]) => void
  setZoom: (zoom: number) => void
  setMixerOpen: (open: boolean) => void
  setAudioReady: (ready: boolean) => void
  setLastChord: (chord: ChordInfo | null) => void
  showNotice: (message: string, tone?: Notice['tone'], action?: Notice['action']) => void
  dismissNotice: () => void
}

let noticeId = 0

export const useUiStore = create<UiState>()((set) => ({
  selectedTrackId: null,
  tool: 'draw',
  snap: 1,
  noteLength: 4,
  chordMode: 'off',
  chordInversion: 0,
  snapToScale: false,
  selectedNoteIds: [],
  zoom: 28,
  // Start collapsed on short screens so the editor gets the room.
  mixerOpen: typeof window === 'undefined' || window.innerHeight >= 860,
  audioReady: false,
  lastChord: null,
  notice: null,

  selectTrack: (id) => set((s) => (s.selectedTrackId === id ? s : { selectedTrackId: id, selectedNoteIds: [] })),
  setTool: (tool) => set({ tool }),
  setSnap: (snap) => set({ snap }),
  setNoteLength: (noteLength) => set({ noteLength }),
  setChordMode: (chordMode) => set({ chordMode, lastChord: null }),
  setChordInversion: (chordInversion) => set({ chordInversion }),
  setSnapToScale: (snapToScale) => set({ snapToScale }),
  setSelection: (selectedNoteIds) => set({ selectedNoteIds }),
  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  setMixerOpen: (mixerOpen) => set({ mixerOpen }),
  setAudioReady: (audioReady) => set({ audioReady }),
  setLastChord: (lastChord) => set({ lastChord }),
  showNotice: (message, tone = 'info', action) => set({ notice: { id: ++noticeId, message, tone, action } }),
  dismissNotice: () => set({ notice: null }),
}))
