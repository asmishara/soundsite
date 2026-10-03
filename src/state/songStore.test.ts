import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptySong } from '../model/factory'
import type { DrumTrack, InstrumentTrack } from '../model/types'
import { useSongStore } from './songStore'

const store = () => useSongStore.getState()
const instrument = (id: string) => store().song.tracks.find((t) => t.id === id) as InstrumentTrack
const drums = (id: string) => store().song.tracks.find((t) => t.id === id) as DrumTrack

let trackId: string

beforeEach(() => {
  store().loadSong(createEmptySong())
  trackId = store().addInstrumentTrack('lead')
  // Start each test with a clean history.
  useSongStore.setState({ past: [], future: [] })
})

describe('notes', () => {
  it('adds, moves, resizes and deletes notes', () => {
    const [id] = store().addNotes(trackId, [{ pitch: 60, start: 0, length: 4, velocity: 0.8 }])
    expect(instrument(trackId).notes).toHaveLength(1)

    store().updateNotes(trackId, { [id]: { pitch: 64, start: 8 } })
    store().updateNotes(trackId, { [id]: { length: 2 } })
    expect(instrument(trackId).notes[0]).toMatchObject({ pitch: 64, start: 8, length: 2 })

    store().deleteNotes(trackId, [id])
    expect(instrument(trackId).notes).toHaveLength(0)
  })

  it('clamps notes to the song length and pitch range', () => {
    const total = store().song.bars * 16
    const [a, b] = store().addNotes(trackId, [
      { pitch: 200, start: total - 2, length: 10, velocity: 0.8 },
      { pitch: 0, start: -5, length: 0, velocity: 0.8 },
    ])
    const notes = instrument(trackId).notes
    expect(notes.find((n) => n.id === a)).toMatchObject({ pitch: 96, start: total - 2, length: 2 })
    expect(notes.find((n) => n.id === b)).toMatchObject({ pitch: 24, start: 0, length: 1 })
  })

  it('duplicates a selection right after itself', () => {
    const ids = store().addNotes(trackId, [
      { pitch: 60, start: 0, length: 4, velocity: 0.8 },
      { pitch: 64, start: 4, length: 4, velocity: 0.8 },
    ])
    const copies = store().duplicateNotes(trackId, ids)
    expect(copies).toHaveLength(2)
    const starts = instrument(trackId)
      .notes.filter((n) => copies.includes(n.id))
      .map((n) => n.start)
      .sort((x, y) => x - y)
    expect(starts).toEqual([8, 12])
  })

  it('transforms notes with a function', () => {
    const ids = store().addNotes(trackId, [
      { pitch: 60, start: 0, length: 4, velocity: 0.8 },
      { pitch: 62, start: 4, length: 4, velocity: 0.8 },
    ])
    store().transformNotes(trackId, ids, (n) => ({ pitch: n.pitch + 12 }))
    expect(instrument(trackId).notes.map((n) => n.pitch)).toEqual([72, 74])
  })
})

describe('bars', () => {
  it('trims notes and resizes drum steps when bars change', () => {
    const drumId = store().addDrumTrack()
    store().addNotes(trackId, [
      { pitch: 60, start: 10, length: 30, velocity: 0.8 },
      { pitch: 62, start: 40, length: 4, velocity: 0.8 },
    ])
    store().setDrumStep(drumId, 'kick', 40, 1)

    store().setBars(2)
    expect(instrument(trackId).notes).toHaveLength(1)
    expect(instrument(trackId).notes[0].length).toBe(22)
    expect(drums(drumId).steps.kick).toHaveLength(32)

    store().setBars(3)
    expect(drums(drumId).steps.kick).toHaveLength(48)
    expect(drums(drumId).steps.kick[40]).toBe(0)

    store().undo()
    store().undo()
    expect(store().song.bars).toBe(4)
    expect(instrument(trackId).notes).toHaveLength(2)
    expect(drums(drumId).steps.kick[40]).toBe(1)
  })
})

describe('drums', () => {
  it('sets and clears steps', () => {
    const drumId = store().addDrumTrack()
    store().setDrumStep(drumId, 'snare', 4, 0.7)
    expect(drums(drumId).steps.snare[4]).toBe(0.7)
    store().setDrumStep(drumId, 'snare', 4, 0)
    expect(drums(drumId).steps.snare[4]).toBe(0)
  })
})

describe('history', () => {
  it('undoes and redoes edits', () => {
    store().setBpm(90)
    store().setBpm(100)
    expect(store().song.bpm).toBe(100)
    store().undo()
    expect(store().song.bpm).toBe(90)
    store().undo()
    expect(store().song.bpm).toBe(120)
    store().redo()
    expect(store().song.bpm).toBe(90)
  })

  it('clears redo after a new edit', () => {
    store().setBpm(90)
    store().undo()
    store().setBpm(130)
    expect(store().future).toHaveLength(0)
  })

  it('does not record no-op edits', () => {
    store().setBpm(120)
    expect(store().past).toHaveLength(0)
  })

  it('records a transaction as a single entry', () => {
    const [id] = store().addNotes(trackId, [{ pitch: 60, start: 0, length: 4, velocity: 0.8 }])
    const before = store().past.length
    store().beginTransaction()
    for (let i = 1; i <= 5; i++) store().updateNotes(trackId, { [id]: { start: i } })
    store().endTransaction()
    expect(store().past.length).toBe(before + 1)
    expect(instrument(trackId).notes[0].start).toBe(5)
    store().undo()
    expect(instrument(trackId).notes[0].start).toBe(0)
  })

  it('replaces the whole song as one undoable step', () => {
    const original = store().song
    store().setBpm(90)
    const replacement = { ...createEmptySong(), name: 'Other song' }
    store().replaceSong(replacement)
    expect(store().song.name).toBe('Other song')
    store().undo()
    expect(store().song.name).toBe(original.name)
    expect(store().song.bpm).toBe(90)
    store().redo()
    expect(store().song).toBe(replacement)
  })

  it('renames the song, ignoring blank names', () => {
    store().setName('  My tune  ')
    expect(store().song.name).toBe('My tune')
    store().setName('   ')
    expect(store().song.name).toBe('My tune')
  })

  it('records nothing for an empty transaction and can cancel', () => {
    const before = store().past.length
    store().beginTransaction()
    store().endTransaction()
    expect(store().past.length).toBe(before)

    store().beginTransaction()
    store().setBpm(150)
    store().cancelTransaction()
    expect(store().song.bpm).toBe(120)
    expect(store().past.length).toBe(before)
  })
})
