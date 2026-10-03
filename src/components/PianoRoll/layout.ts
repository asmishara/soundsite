import { MAX_PITCH, MIN_PITCH } from '../../model/types'

export const ROW_HEIGHT = 18
export const KEYS_WIDTH = 64
export const RULER_HEIGHT = 26
export const ROW_COUNT = MAX_PITCH - MIN_PITCH + 1

/** Pitches from top row to bottom row. */
export const PITCHES = Array.from({ length: ROW_COUNT }, (_, i) => MAX_PITCH - i)

export const pitchToY = (pitch: number) => (MAX_PITCH - pitch) * ROW_HEIGHT
export const yToPitch = (y: number) => MAX_PITCH - Math.floor(y / ROW_HEIGHT)
