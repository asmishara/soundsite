import { emptyDrumSteps } from '../factory'
import { STEPS_PER_BAR, type DrumPattern, type DrumVoiceId } from '../types'

export type DrumStyle = {
  id: string
  name: string
  description: string
  /** One bar per voice, 16 characters: X accent, x normal, o soft, . rest */
  rows: Partial<Record<DrumVoiceId, string>>
}

export const DRUM_STYLES: DrumStyle[] = [
  {
    id: 'house',
    name: 'House',
    description: 'Four on the floor, off-beat open hats',
    rows: {
      kick: 'X...x...X...x...',
      clap: '....x.......x...',
      hatOpen: '..x...x...x...x.',
      hatClosed: '.o.o.o.o.o.o.o.o',
    },
  },
  {
    id: 'rock',
    name: 'Rock',
    description: 'Straight eighths, backbeat snare',
    rows: {
      kick: 'x.......x.x.....',
      snare: '....X.......X...',
      hatClosed: 'x.o.x.o.x.o.x.o.',
    },
  },
  {
    id: 'boombap',
    name: 'Hip-hop',
    description: 'Boom bap: lazy kick, hard snare (try some swing)',
    rows: {
      kick: 'x......x..x.....',
      snare: '....X.......X...',
      hatClosed: 'x.o.x.o.x.o.x.o.',
    },
  },
  {
    id: 'trap',
    name: 'Trap',
    description: 'Half-time clap and rolling hats',
    rows: {
      kick: 'x.....x...x.....',
      clap: '........X.......',
      hatClosed: 'xoxoxoxoxoxoxxxx',
      hatOpen: '..............o.',
    },
  },
  {
    id: 'breakbeat',
    name: 'Breakbeat',
    description: 'Syncopated kick with ghost snares',
    rows: {
      kick: 'x.x.......xx....',
      snare: '....X..o.o..X..o',
      hatClosed: 'x.x.x.x.x.x.x.x.',
    },
  },
  {
    id: 'dembow',
    name: 'Reggaeton',
    description: 'Dembow: steady kick, 3-3-2 snare',
    rows: {
      kick: 'x...x...x...x...',
      snare: '...x..x....x..x.',
      hatClosed: 'o.o.o.o.o.o.o.o.',
    },
  },
  {
    id: 'halftime',
    name: 'Half-time',
    description: 'Slow, heavy backbeat on 3',
    rows: {
      kick: 'x.....x.........',
      snare: '........X.......',
      hatClosed: 'x.o.x.o.x.o.x.o.',
    },
  },
  {
    id: 'disco',
    name: 'Disco',
    description: 'Four on the floor with open-hat offbeats',
    rows: {
      kick: 'x...x...x...x...',
      snare: '....x.......x...',
      hatClosed: 'o...o...o...o...',
      hatOpen: '..x...x...x...x.',
    },
  },
  {
    id: 'bossa',
    name: 'Bossa nova',
    description: 'Clave on the rim over a gentle pulse',
    rows: {
      kick: 'x..xx..xx..xx..x',
      rim: 'x..x..x...x..x..',
      hatClosed: 'o.o.o.o.o.o.o.o.',
    },
  },
]

const VELOCITY: Record<string, number> = { X: 1, x: 0.75, o: 0.45 }

export type DrumPatternOptions = {
  /** Crash cymbal on the very first beat */
  crash: boolean
  /** Replace the second half of the last bar with a tom-and-snare fill */
  fill: boolean
}

/** A style repeated across `bars` bars, with an optional crash and fill. */
export function buildDrumPattern(style: DrumStyle, bars: number, { crash, fill }: DrumPatternOptions): DrumPattern {
  const pattern = emptyDrumSteps(bars)
  for (const [voice, row] of Object.entries(style.rows) as [DrumVoiceId, string][]) {
    for (let bar = 0; bar < bars; bar++) {
      for (let s = 0; s < STEPS_PER_BAR; s++) pattern[voice][bar * STEPS_PER_BAR + s] = VELOCITY[row[s]] ?? 0
    }
  }
  if (crash) pattern.crash[0] = 0.8
  if (fill) {
    const from = (bars - 1) * STEPS_PER_BAR + 8
    for (const voice of Object.keys(pattern) as DrumVoiceId[]) {
      if (voice === 'kick') continue
      for (let s = from; s < from + 8; s++) pattern[voice][s] = 0
    }
    pattern.tomHigh[from] = 0.8
    pattern.tomHigh[from + 2] = 0.7
    pattern.tomLow[from + 4] = 0.8
    pattern.tomLow[from + 5] = 0.7
    pattern.snare[from + 6] = 0.8
    pattern.snare[from + 7] = 1
  }
  return pattern
}
