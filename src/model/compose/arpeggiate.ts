import type { NewNote, Note } from '../types'

export type ArpPattern = 'up' | 'down' | 'upDown' | 'random'

export type ArpSettings = {
  pattern: ArpPattern
  /** Steps between arpeggio notes: 2 = 1/8 notes, 1 = 1/16 notes */
  rate: 1 | 2
  /** How many octaves the arpeggio climbs through */
  octaves: 1 | 2
}

/** The repeating order of pitches for a pattern (not used for random). */
export function arpCycle(pitches: number[], { pattern, octaves }: Pick<ArpSettings, 'pattern' | 'octaves'>): number[] {
  const base = [...new Set(pitches)].sort((a, b) => a - b)
  const up = octaves === 2 ? [...base, ...base.map((p) => p + 12)] : base
  if (pattern === 'down') return [...up].reverse()
  // Up and down without repeating the top and bottom notes: C E G E | C E G E …
  if (pattern === 'upDown' && up.length > 2) return [...up, ...up.slice(1, -1).reverse()]
  return up
}

/** One chord spread out as an arpeggio from `start` for `span` steps. */
export function arpLine(
  pitches: number[],
  start: number,
  span: number,
  velocity: number,
  settings: ArpSettings,
  random: () => number = Math.random,
): NewNote[] {
  const cycle = arpCycle(pitches, settings)
  if (cycle.length === 0) return []
  const out: NewNote[] = []
  let previous = -1
  for (let i = 0, t = start; t < start + span; i++, t += settings.rate) {
    let pitch: number
    if (settings.pattern === 'random') {
      // Random, but never the same note twice in a row when there's a choice.
      do pitch = cycle[Math.floor(random() * cycle.length)]
      while (cycle.length > 1 && pitch === previous)
    } else {
      pitch = cycle[i % cycle.length]
    }
    previous = pitch
    out.push({ pitch, start: t, length: Math.min(settings.rate, start + span - t), velocity })
  }
  return out
}

/**
 * Turns chords into arpeggios: notes that start together form a chord, which is replaced by an
 * arpeggio lasting as long as its longest note.
 */
export function arpeggiate(
  notes: Note[],
  settings: ArpSettings,
  random: () => number = Math.random,
): { remove: string[]; add: NewNote[] } {
  const groups = new Map<number, Note[]>()
  for (const note of notes) {
    const group = groups.get(note.start)
    if (group) group.push(note)
    else groups.set(note.start, [note])
  }
  const add: NewNote[] = []
  for (const [start, group] of groups) {
    const end = Math.max(...group.map((n) => n.start + n.length))
    const velocity = Math.max(...group.map((n) => n.velocity))
    add.push(...arpLine(group.map((n) => n.pitch), start, end - start, velocity, settings, random))
  }
  return { remove: notes.map((n) => n.id), add }
}
