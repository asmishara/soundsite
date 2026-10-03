import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { createDemoSong } from '../model/demoSong'
import { createDrumTrack, createEmptySong, createEntry, createInstrumentTrack, createNote, createSection } from '../model/factory'
import type { Song } from '../model/types'
import { DRUM_CHANNEL, GM_DRUMS, GM_PROGRAMS, songToMidi } from './midi'

function song(): Song {
  const a = createSection('A', 1)
  const b = createSection('B', 1)
  const s = createEmptySong()
  s.name = 'Test'
  s.bpm = 96
  s.sections = [a, b]
  s.arrangement = [a, b, a].map((x) => createEntry(x.id))
  const bass = createInstrumentTrack('bass', s.sections, 'Low end')
  bass.notes[a.id].push(createNote(36, 0, 4, 1))
  bass.notes[b.id].push(createNote(43, 2, 2, 0.5))
  const drums = createDrumTrack(s.sections)
  drums.steps[a.id].kick[0] = 1
  drums.steps[b.id].hatClosed[1] = 0.5
  s.tracks = [bass, drums]
  return s
}

const parse = (s: Song) => new Midi(songToMidi(s))

describe('MIDI export', () => {
  it('writes tempo, time signature and named tracks', () => {
    const midi = parse(song())
    expect(midi.header.tempos[0].bpm).toBeCloseTo(96)
    expect(midi.header.timeSignatures[0].timeSignature).toEqual([4, 4])
    expect(midi.tracks.map((t) => t.name)).toEqual(['Low end', 'Drums'])
  })

  it('uses General MIDI instruments and the drum channel', () => {
    const [bass, drums] = parse(song()).tracks
    expect(bass.instrument.number).toBe(GM_PROGRAMS.bass)
    expect(bass.channel).not.toBe(DRUM_CHANNEL)
    expect(drums.channel).toBe(DRUM_CHANNEL)
    expect(drums.instrument.percussion).toBe(true)
  })

  it('flattens the arrangement onto the timeline', () => {
    const midi = parse(song())
    const ppq = midi.header.ppq
    const step = ppq / 4
    const [bass, drums] = midi.tracks
    expect(bass.notes.map((n) => [n.midi, n.ticks, n.durationTicks])).toEqual([
      [36, 0, 4 * step],
      [43, (16 + 2) * step, 2 * step],
      [36, 32 * step, 4 * step],
    ])
    expect(bass.notes[1].velocity).toBeCloseTo(0.5, 1)
    expect(drums.notes.map((n) => [n.midi, n.ticks])).toEqual([
      [GM_DRUMS.kick, 0],
      [GM_DRUMS.hatClosed, (16 + 1) * step],
      [GM_DRUMS.kick, 32 * step],
    ])
  })

  it('applies swing to off-beat 16ths', () => {
    const s = song()
    s.swing = 0.6
    const [, drums] = parse(s).tracks
    const step = 480 / 4
    // Step 17 is an off-beat: delayed by 0.6 × 2/3 of a 16th.
    expect(drums.notes[1].ticks).toBe(Math.round((17 + 0.4) * step))
    expect(drums.notes[0].ticks).toBe(0)
  })

  it('exports the whole demo song', () => {
    const midi = parse(createDemoSong())
    expect(midi.tracks).toHaveLength(4)
    expect(midi.durationTicks).toBeGreaterThan(15 * 16 * (midi.header.ppq / 4))
  })
})
