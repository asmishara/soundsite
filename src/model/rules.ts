import { MAX_PITCH, MIN_PITCH, STEPS_PER_BAR, type Note } from './types'

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const MAX_NAME_LENGTH = 60

/** Keeps a note inside the playable pitch range and a song of `bars` bars. Mutates in place. */
export function sanitizeNote(note: Note, bars: number): void {
  const total = bars * STEPS_PER_BAR
  note.pitch = clamp(Math.round(note.pitch), MIN_PITCH, MAX_PITCH)
  note.start = clamp(Math.round(note.start), 0, total - 1)
  note.length = clamp(Math.round(note.length), 1, total - note.start)
  note.velocity = clamp(note.velocity, 0.05, 1)
}
