import { create } from 'zustand'

/** Kept apart from the song store: `step` changes several times per second during playback. */
type PlayheadState = {
  isPlaying: boolean
  /** Current 16th-note step, or -1 when stopped */
  step: number
}

export const usePlayheadStore = create<PlayheadState>()(() => ({
  isPlaying: false,
  step: -1,
}))
