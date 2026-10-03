import { create } from 'zustand'

/** Kept apart from the song store: these change several times per second during playback. */
type PlayheadState = {
  isPlaying: boolean
  /** The section currently sounding, or null when stopped */
  sectionId: string | null
  /** The arrangement entry currently sounding (song mode), or null */
  entryId: string | null
  /** Current step within the playing section, or -1 when stopped */
  step: number
  /** Current step from the start of the song in song mode, otherwise -1 */
  songStep: number
}

export const STOPPED: Omit<PlayheadState, 'isPlaying'> = { sectionId: null, entryId: null, step: -1, songStep: -1 }

export const usePlayheadStore = create<PlayheadState>()(() => ({ isPlaying: false, ...STOPPED }))
