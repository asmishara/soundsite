/** A range playback wraps within; `end` is exclusive. */
export type LoopBounds = { start: number; end: number }

/** Clamps a loop to a span of `total` steps, or returns null if nothing of it is left. */
export function loopBounds(loop: LoopBounds | null | undefined, total: number): LoopBounds | null {
  if (!loop) return null
  const start = Math.max(0, Math.min(loop.start, total))
  const end = Math.max(0, Math.min(loop.end, total))
  return end > start ? { start, end } : null
}

/**
 * The step to play next. Playback wraps to the loop start on reaching the loop end, or at the end of
 * the span. Starting past the loop end plays on to the end of the span first, the way a DAW does.
 */
export function wrapPosition(position: number, total: number, loop: LoopBounds | null): number {
  if (position >= total || (loop && position === loop.end)) return loop ? loop.start : 0
  return position
}

/** Where playback starts: the start marker if it's inside the loop, otherwise the loop start. */
export function startWithin(marker: number, loop: LoopBounds | null): number {
  if (!loop || (marker >= loop.start && marker < loop.end)) return marker
  return loop.start
}
