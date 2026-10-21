import { describe, expect, it } from 'vitest'
import { createEmptySong, createInstrumentTrack } from '../model/factory'
import type { Song } from '../model/types'
import { MAX_TAIL_SECONDS, exportTailSeconds, fadeOut } from './tail'

function song(patch: Partial<Song['fx']>, delaySend: number, bpm = 120): Song {
  const s = createEmptySong()
  s.bpm = bpm
  s.fx = { ...s.fx, ...patch }
  const lead = createInstrumentTrack('lead', s.sections)
  lead.mixer = { ...lead.mixer, delaySend }
  s.tracks = [lead]
  return s
}

describe('export tail', () => {
  it('follows the reverb when nothing uses the delay', () => {
    expect(exportTailSeconds(song({ reverbDecay: 2.5, delayFeedback: 0.9 }, 0))).toBe(3)
  })

  it('lasts until the echoes have died away', () => {
    // 1/8 dotted at 120 BPM repeats every 0.375 s; at 0.5 feedback it takes ~10 repeats to fall 60 dB.
    const tail = exportTailSeconds(song({ reverbDecay: 0.2, delayTime: '8n.', delayFeedback: 0.5 }, 0.3))
    expect(tail).toBeCloseTo(0.375 * (Math.log(0.001) / Math.log(0.5) + 1), 5)
  })

  it('is capped for very long echoes', () => {
    expect(exportTailSeconds(song({ delayTime: '4n', delayFeedback: 0.9 }, 0.5, 40))).toBe(MAX_TAIL_SECONDS)
  })

  it('ignores the delay on muted tracks', () => {
    const s = song({ reverbDecay: 1, delayFeedback: 0.9, delayTime: '4n' }, 0.5)
    s.tracks[0].mixer = { ...s.tracks[0].mixer, mute: true }
    expect(exportTailSeconds(s)).toBe(1.5)
  })
})

describe('fade out', () => {
  it('ramps the last samples down to silence', () => {
    const data = new Float32Array(10).fill(1)
    fadeOut([data], 100, 0.04) // the last 4 samples
    expect(Array.from(data.slice(0, 6))).toEqual([1, 1, 1, 1, 1, 1])
    expect(Array.from(data.slice(6)).map((v) => Math.round(v * 100) / 100)).toEqual([0.75, 0.5, 0.25, 0])
  })
})
