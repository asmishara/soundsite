import { create } from 'zustand'
import type { ArpSettings } from '../model/compose/arpeggiate'
import type { BassStyle, ChordRhythm } from '../model/compose/progressions'

/** Choices in the composing tools, remembered while the page is open so trying variations is quick. */
type ComposeState = {
  /** null until the user picks one; a progression matching the key's mode is suggested */
  progressionId: string | null
  chordSteps: number
  rhythm: ChordRhythm
  center: number
  bass: BassStyle
  bassTrackId: string | null
  arp: ArpSettings
  drumCrash: boolean
  drumFill: boolean
  /** The drum style applied last, highlighted in the list */
  lastDrumStyle: string | null
  set: (patch: Partial<Omit<ComposeState, 'set'>>) => void
}

export const useComposeStore = create<ComposeState>()((set) => ({
  progressionId: null,
  chordSteps: 16,
  rhythm: 'held',
  center: 60,
  bass: 'none',
  bassTrackId: null,
  arp: { pattern: 'up', rate: 2, octaves: 1 },
  drumCrash: true,
  drumFill: true,
  lastDrumStyle: null,
  set: (patch) => set(patch),
}))
