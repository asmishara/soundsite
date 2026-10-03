import { beforeEach, describe, expect, it } from 'vitest'
import { partNotes, partPattern } from '../model/arrangement'
import { createEmptySong } from '../model/factory'
import type { DrumTrack, InstrumentTrack } from '../model/types'
import { useSongStore, type PartRef } from './songStore'

const store = () => useSongStore.getState()
const song = () => store().song
const instrument = (id: string) => song().tracks.find((t) => t.id === id) as InstrumentTrack
const drums = (id: string) => song().tracks.find((t) => t.id === id) as DrumTrack
const firstSection = () => song().sections[0]

let trackId: string
let part: PartRef
const notes = () => partNotes(instrument(trackId), part.sectionId)

beforeEach(() => {
  store().loadSong(createEmptySong())
  trackId = store().addInstrumentTrack('lead')
  part = { trackId, sectionId: firstSection().id }
  // Start each test with a clean history.
  useSongStore.setState({ past: [], future: [] })
})

describe('notes', () => {
  it('adds, moves, resizes and deletes notes', () => {
    const [id] = store().addNotes(part, [{ pitch: 60, start: 0, length: 4, velocity: 0.8 }])
    expect(notes()).toHaveLength(1)

    store().updateNotes(part, { [id]: { pitch: 64, start: 8 } })
    store().updateNotes(part, { [id]: { length: 2 } })
    expect(notes()[0]).toMatchObject({ pitch: 64, start: 8, length: 2 })

    store().deleteNotes(part, [id])
    expect(notes()).toHaveLength(0)
  })

  it('clamps notes to the section length and pitch range', () => {
    const total = firstSection().bars * 16
    const [a, b] = store().addNotes(part, [
      { pitch: 200, start: total - 2, length: 10, velocity: 0.8 },
      { pitch: 0, start: -5, length: 0, velocity: 0.8 },
    ])
    expect(notes().find((n) => n.id === a)).toMatchObject({ pitch: 96, start: total - 2, length: 2 })
    expect(notes().find((n) => n.id === b)).toMatchObject({ pitch: 24, start: 0, length: 1 })
  })

  it('duplicates a selection right after itself', () => {
    const ids = store().addNotes(part, [
      { pitch: 60, start: 0, length: 4, velocity: 0.8 },
      { pitch: 64, start: 4, length: 4, velocity: 0.8 },
    ])
    const copies = store().duplicateNotes(part, ids)
    expect(copies).toHaveLength(2)
    const starts = notes()
      .filter((n) => copies.includes(n.id))
      .map((n) => n.start)
      .sort((x, y) => x - y)
    expect(starts).toEqual([8, 12])
  })

  it('transforms notes with a function', () => {
    const ids = store().addNotes(part, [
      { pitch: 60, start: 0, length: 4, velocity: 0.8 },
      { pitch: 62, start: 4, length: 4, velocity: 0.8 },
    ])
    store().transformNotes(part, ids, (n) => ({ pitch: n.pitch + 12 }))
    expect(notes().map((n) => n.pitch)).toEqual([72, 74])
  })

  it('keeps each section’s notes separate', () => {
    const { sectionId } = store().addSection(null)
    store().addNotes(part, [{ pitch: 60, start: 0, length: 4, velocity: 0.8 }])
    store().addNotes({ trackId, sectionId }, [
      { pitch: 67, start: 0, length: 4, velocity: 0.8 },
      { pitch: 69, start: 4, length: 4, velocity: 0.8 },
    ])
    expect(notes().map((n) => n.pitch)).toEqual([60])
    expect(partNotes(instrument(trackId), sectionId).map((n) => n.pitch)).toEqual([67, 69])
  })
})

describe('section length', () => {
  it('trims notes and resizes drum steps in that section only', () => {
    const drumId = store().addDrumTrack()
    const other = store().addSection(null).sectionId
    const drumPart = { trackId: drumId, sectionId: part.sectionId }
    store().addNotes(part, [
      { pitch: 60, start: 10, length: 30, velocity: 0.8 },
      { pitch: 62, start: 40, length: 4, velocity: 0.8 },
    ])
    store().setDrumStep(drumPart, 'kick', 40, 1)

    store().setSectionBars(part.sectionId, 2)
    expect(notes()).toHaveLength(1)
    expect(notes()[0].length).toBe(22)
    expect(partPattern(drums(drumId), part.sectionId)!.kick).toHaveLength(32)
    expect(partPattern(drums(drumId), other)!.kick).toHaveLength(64)

    store().setSectionBars(part.sectionId, 3)
    expect(partPattern(drums(drumId), part.sectionId)!.kick).toHaveLength(48)
    expect(partPattern(drums(drumId), part.sectionId)!.kick[40]).toBe(0)

    store().undo()
    store().undo()
    expect(firstSection().bars).toBe(4)
    expect(notes()).toHaveLength(2)
    expect(partPattern(drums(drumId), part.sectionId)!.kick[40]).toBe(1)
  })
})

describe('arrangement', () => {
  it('adds an empty section with content slots for every track', () => {
    const drumId = store().addDrumTrack()
    const { sectionId, entryId } = store().addSection(null)
    const section = song().sections.find((s) => s.id === sectionId)!
    expect(section.name).toBe('Section B')
    expect(song().arrangement.at(-1)).toEqual({ id: entryId, sectionId })
    expect(instrument(trackId).notes[sectionId]).toEqual([])
    expect(partPattern(drums(drumId), sectionId)!.snare).toHaveLength(section.bars * 16)
  })

  it('creates content slots in every section for new tracks', () => {
    const { sectionId } = store().addSection(null)
    const drumId = store().addDrumTrack()
    const keysId = store().addInstrumentTrack('keys')
    expect(Object.keys(drums(drumId).steps).sort()).toEqual([part.sectionId, sectionId].sort())
    expect(Object.keys(instrument(keysId).notes).sort()).toEqual([part.sectionId, sectionId].sort())
  })

  it('repeats an entry as a linked copy right after it', () => {
    const first = song().arrangement[0]
    const repeatId = store().repeatEntry(first.id)!
    expect(song().arrangement.map((e) => e.id)).toEqual([first.id, repeatId])
    expect(song().arrangement[1].sectionId).toBe(first.sectionId)
    expect(song().sections).toHaveLength(1)
  })

  it('duplicates a section into an independent copy', () => {
    const [noteId] = store().addNotes(part, [{ pitch: 60, start: 0, length: 4, velocity: 0.8 }])
    const first = song().arrangement[0]
    const copy = store().duplicateSection(first.id)!
    expect(song().sections.map((s) => s.name)).toEqual(['Section A', 'Section A 2'])
    expect(song().arrangement[1]).toEqual({ id: copy.entryId, sectionId: copy.sectionId })

    const copied = partNotes(instrument(trackId), copy.sectionId)
    expect(copied.map((n) => n.pitch)).toEqual([60])
    expect(copied[0].id).not.toBe(noteId)

    // Editing the copy leaves the original alone.
    store().updateNotes({ trackId, sectionId: copy.sectionId }, { [copied[0].id]: { pitch: 72 } })
    expect(notes()[0].pitch).toBe(60)
  })

  it('removes an entry, and its section once nothing plays it', () => {
    const first = song().arrangement[0]
    const repeatId = store().repeatEntry(first.id)!
    const { sectionId, entryId } = store().addSection(null)

    expect(store().removeEntry(repeatId)).toBe(true)
    expect(song().sections).toHaveLength(2) // Section A is still played by the first entry

    expect(store().removeEntry(entryId)).toBe(true)
    expect(song().sections.map((s) => s.id)).toEqual([first.sectionId])
    expect(sectionId in instrument(trackId).notes).toBe(false)

    expect(store().removeEntry(first.id)).toBe(false) // the last entry stays
    expect(song().arrangement).toHaveLength(1)

    store().undo()
    expect(song().sections.map((s) => s.id)).toContain(sectionId)
    expect(sectionId in instrument(trackId).notes).toBe(true)
  })

  it('reorders entries', () => {
    const a = song().arrangement[0].id
    const b = store().addSection(null).entryId
    const c = store().addSection(null).entryId
    store().moveEntry(c, 0)
    expect(song().arrangement.map((e) => e.id)).toEqual([c, a, b])
    store().moveEntry(c, 5) // clamped to the end
    expect(song().arrangement.map((e) => e.id)).toEqual([a, b, c])
  })

  it('renames sections, ignoring blank names', () => {
    store().renameSection(part.sectionId, '  Chorus ')
    expect(firstSection().name).toBe('Chorus')
    store().renameSection(part.sectionId, '  ')
    expect(firstSection().name).toBe('Chorus')
  })
})

describe('drums', () => {
  it('sets and clears steps', () => {
    const drumId = store().addDrumTrack()
    const drumPart = { trackId: drumId, sectionId: part.sectionId }
    store().setDrumStep(drumPart, 'snare', 4, 0.7)
    expect(partPattern(drums(drumId), part.sectionId)!.snare[4]).toBe(0.7)
    store().setDrumStep(drumPart, 'snare', 4, 0)
    expect(partPattern(drums(drumId), part.sectionId)!.snare[4]).toBe(0)
  })
})

describe('history', () => {
  it('undoes and redoes edits', () => {
    store().setBpm(90)
    store().setBpm(100)
    expect(song().bpm).toBe(100)
    store().undo()
    expect(song().bpm).toBe(90)
    store().undo()
    expect(song().bpm).toBe(120)
    store().redo()
    expect(song().bpm).toBe(90)
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
    const [id] = store().addNotes(part, [{ pitch: 60, start: 0, length: 4, velocity: 0.8 }])
    const before = store().past.length
    store().beginTransaction()
    for (let i = 1; i <= 5; i++) store().updateNotes(part, { [id]: { start: i } })
    store().endTransaction()
    expect(store().past.length).toBe(before + 1)
    expect(notes()[0].start).toBe(5)
    store().undo()
    expect(notes()[0].start).toBe(0)
  })

  it('replaces the whole song as one undoable step', () => {
    const original = song()
    store().setBpm(90)
    const replacement = { ...createEmptySong(), name: 'Other song' }
    store().replaceSong(replacement)
    expect(song().name).toBe('Other song')
    store().undo()
    expect(song().name).toBe(original.name)
    expect(song().bpm).toBe(90)
    store().redo()
    expect(song()).toBe(replacement)
  })

  it('renames the song, ignoring blank names', () => {
    store().setName('  My tune  ')
    expect(song().name).toBe('My tune')
    store().setName('   ')
    expect(song().name).toBe('My tune')
  })

  it('records nothing for an empty transaction and can cancel', () => {
    const before = store().past.length
    store().beginTransaction()
    store().endTransaction()
    expect(store().past.length).toBe(before)

    store().beginTransaction()
    store().setBpm(150)
    store().cancelTransaction()
    expect(song().bpm).toBe(120)
    expect(store().past.length).toBe(before)
  })
})
