import { describe, expect, it } from 'vitest'
import {
  copyName,
  isAudible,
  layoutArrangement,
  locate,
  nextSectionName,
  songDurationSeconds,
  songEvents,
  swingOffsetSteps,
} from './arrangement'
import { createDemoSong } from './demoSong'
import { createDrumTrack, createEmptySong, createEntry, createInstrumentTrack, createNote, createSection } from './factory'
import type { Song } from './types'

/** Verse (2 bars) → Chorus (1 bar) → Verse again, with one lead note and one kick per section. */
function twoSectionSong(): Song {
  const verse = createSection('Verse', 2)
  const chorus = createSection('Chorus', 1)
  const song = createEmptySong()
  song.sections = [verse, chorus]
  song.arrangement = [verse, chorus, verse].map((s) => createEntry(s.id))
  const lead = createInstrumentTrack('lead', song.sections)
  lead.notes[verse.id].push(createNote(60, 4, 2))
  lead.notes[chorus.id].push(createNote(72, 0, 16))
  const drums = createDrumTrack(song.sections)
  drums.steps[verse.id].kick[0] = 1
  drums.steps[chorus.id].kick[8] = 0.5
  song.tracks = [lead, drums]
  return song
}

describe('layout', () => {
  it('places entries end to end', () => {
    const song = twoSectionSong()
    const layout = layoutArrangement(song)
    expect(layout.placements.map((p) => [p.section.name, p.start])).toEqual([
      ['Verse', 0],
      ['Chorus', 32],
      ['Verse', 48],
    ])
    expect(layout.totalSteps).toBe(80)
  })

  it('caches per snapshot', () => {
    const song = twoSectionSong()
    expect(layoutArrangement(song)).toBe(layoutArrangement(song))
    expect(layoutArrangement({ ...song, sections: [...song.sections] })).not.toBe(layoutArrangement(song))
  })

  it('locates song steps', () => {
    const layout = layoutArrangement(twoSectionSong())
    expect(locate(layout, 0)).toMatchObject({ localStep: 0, placement: { index: 0 } })
    expect(locate(layout, 35)).toMatchObject({ localStep: 3, placement: { index: 1 } })
    expect(locate(layout, 79)).toMatchObject({ localStep: 31, placement: { index: 2 } })
    expect(locate(layout, 80)).toBeNull()
  })
})

describe('song events', () => {
  it('lists every note and hit in play order, including repeats', () => {
    const song = twoSectionSong()
    const events = songEvents(song).map((e) => (e.type === 'note' ? `note ${e.pitch}@${e.step}` : `${e.voice}@${e.step}`))
    expect(events).toEqual(['kick@0', 'note 60@4', 'note 72@32', 'kick@40', 'kick@48', 'note 60@52'])
  })

  it('measures the song', () => {
    const song = twoSectionSong()
    song.bpm = 120 // a 16th is 0.125 s
    expect(songDurationSeconds(song)).toBe(80 * 0.125)
  })

  it('covers the demo song', () => {
    const song = createDemoSong()
    expect(layoutArrangement(song).totalSteps).toBe(16 * 16)
    expect(songEvents(song).length).toBeGreaterThan(100)
  })
})

describe('swing', () => {
  it('delays only off-beat 16ths', () => {
    expect(swingOffsetSteps(0, 0.6)).toBe(0)
    expect(swingOffsetSteps(2, 0.6)).toBe(0)
    expect(swingOffsetSteps(1, 0.6)).toBeCloseTo(0.4)
    expect(swingOffsetSteps(3, 0)).toBe(0)
  })
})

describe('mute and solo', () => {
  it('follows mute, then solo', () => {
    const song = twoSectionSong()
    const [lead, drums] = song.tracks
    expect(isAudible(lead, song.tracks)).toBe(true)
    lead.mixer = { ...lead.mixer, mute: true }
    expect(isAudible(lead, song.tracks)).toBe(false)
    lead.mixer = { ...lead.mixer, mute: false }
    drums.mixer = { ...drums.mixer, solo: true }
    expect(isAudible(lead, song.tracks)).toBe(false)
    expect(isAudible(drums, song.tracks)).toBe(true)
  })
})

describe('naming', () => {
  it('picks the next free section letter', () => {
    const sections = [createSection('Section A', 4), createSection('Section C', 4)]
    expect(nextSectionName(sections)).toBe('Section B')
  })

  it('numbers copies', () => {
    const sections = [createSection('Verse', 4), createSection('Verse 2', 4)]
    expect(copyName('Verse', sections)).toBe('Verse 3')
    expect(copyName('Verse 2', sections)).toBe('Verse 3')
    expect(copyName('Chorus', sections)).toBe('Chorus 2')
  })
})
