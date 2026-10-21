import { beforeEach, describe, expect, it } from 'vitest'
import { hiddenContentCount, partNotes, partPattern, songEvents, visibleNotes } from '../model/arrangement'
import { createEmptySong } from '../model/factory'
import { MAX_NAME_LENGTH } from '../model/rules'
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
  it('hides content past the end when shortened and brings it back when lengthened', () => {
    const drumId = store().addDrumTrack()
    const other = store().addSection(null).sectionId
    const drumPart = { trackId: drumId, sectionId: part.sectionId }
    store().addNotes(part, [
      { pitch: 60, start: 10, length: 30, velocity: 0.8 },
      { pitch: 62, start: 40, length: 4, velocity: 0.8 },
    ])
    store().setDrumStep(drumPart, 'kick', 40, 1)

    store().setSectionBars(part.sectionId, 2)
    const section = firstSection()
    expect(notes()).toHaveLength(2) // nothing is deleted
    expect(visibleNotes(instrument(trackId), section).map((n) => n.pitch)).toEqual([60])
    // The note at step 40, the tail of the long note and the kick at step 40.
    expect(hiddenContentCount(song(), section.id)).toBe(3)
    expect(partPattern(drums(drumId), other)!.kick).toHaveLength(64) // other sections untouched

    // Hidden content isn't played or exported.
    const events = songEvents(song())
    expect(events.filter((e) => e.step >= 32 && e.step < 64 && e.type === 'note')).toHaveLength(0)
    expect(events.find((e) => e.type === 'note' && e.pitch === 60)).toMatchObject({ length: 22 })

    store().setSectionBars(part.sectionId, 4)
    expect(visibleNotes(instrument(trackId), firstSection())).toHaveLength(2)
    expect(notes().find((n) => n.pitch === 60)!.length).toBe(30) // the long note is whole again
    expect(partPattern(drums(drumId), part.sectionId)!.kick[40]).toBe(1)
    expect(hiddenContentCount(song(), section.id)).toBe(0)
  })

  it("keeps the hidden tail of a note that's moved or transposed while the section is short", () => {
    const [id] = store().addNotes(part, [{ pitch: 60, start: 20, length: 30, velocity: 0.8 }])
    store().setSectionBars(part.sectionId, 2)
    store().transformNotes(part, [id], (n) => ({ pitch: n.pitch + 1, start: n.start - 4 }))
    store().setSectionBars(part.sectionId, 4)
    expect(notes()[0]).toMatchObject({ pitch: 61, start: 16, length: 30 })
  })

  it("doesn't edit notes hidden past the end", () => {
    const [id] = store().addNotes(part, [{ pitch: 60, start: 40, length: 4, velocity: 0.8 }])
    store().setSectionBars(part.sectionId, 2)
    store().updateNotes(part, { [id]: { start: 39, pitch: 62 } })
    expect(notes()[0]).toMatchObject({ pitch: 60, start: 40 })
  })

  it('keeps hidden content when a section is filled with a new beat or chords', () => {
    const drumId = store().addDrumTrack()
    const drumPart = { trackId: drumId, sectionId: part.sectionId }
    store().setDrumStep(drumPart, 'kick', 40, 1)
    store().addNotes(part, [
      { pitch: 60, start: 0, length: 4, velocity: 0.8 },
      { pitch: 62, start: 40, length: 4, velocity: 0.8 },
    ])
    store().setSectionBars(part.sectionId, 2)

    const pattern = partPattern(drums(drumId), part.sectionId)!
    store().setDrumPattern(drumPart, { ...pattern, snare: Array.from({ length: 32 }, (_, i) => (i % 8 === 4 ? 1 : 0)) })
    store().replaceNotes(part, null, [{ pitch: 67, start: 0, length: 8, velocity: 0.8 }])

    store().setSectionBars(part.sectionId, 4)
    expect(partPattern(drums(drumId), part.sectionId)!.kick[40]).toBe(1)
    expect(partPattern(drums(drumId), part.sectionId)!.snare[4]).toBe(1)
    expect(notes().map((n) => n.pitch).sort()).toEqual([62, 67]) // the visible note was replaced
  })

  it('drops new notes that would start past the end instead of piling them onto the last step', () => {
    const total = firstSection().bars * 16
    const ids = store().replaceNotes(part, null, [
      { pitch: 60, start: total - 2, length: 2, velocity: 0.8 },
      { pitch: 62, start: total, length: 2, velocity: 0.8 },
      { pitch: 64, start: total + 6, length: 2, velocity: 0.8 },
    ])
    expect(ids).toHaveLength(1)
    expect(notes().map((n) => [n.pitch, n.start])).toEqual([[60, total - 2]])
    expect(store().addNotes(part, [{ pitch: 65, start: total, length: 1, velocity: 0.8 }])).toEqual([])
  })

  it('pads drum patterns when a section grows past anything it has stored', () => {
    const drumId = store().addDrumTrack()
    store().setSectionBars(part.sectionId, 8)
    expect(partPattern(drums(drumId), part.sectionId)!.snare).toHaveLength(128)
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

describe('replacing content', () => {
  it('replaces some or all of a part’s notes as one undo step', () => {
    const [a, b] = store().addNotes(part, [
      { pitch: 60, start: 0, length: 4, velocity: 0.8 },
      { pitch: 64, start: 0, length: 4, velocity: 0.8 },
    ])
    const before = store().past.length
    store().replaceNotes(part, [a], [{ pitch: 72, start: 8, length: 2, velocity: 0.5 }])
    expect(notes().map((n) => n.pitch).sort()).toEqual([64, 72])
    expect(notes().some((n) => n.id === b)).toBe(true)

    store().replaceNotes(part, null, [{ pitch: 48, start: 0, length: 999, velocity: 0.5 }])
    expect(notes().map((n) => [n.pitch, n.length])).toEqual([[48, 64]]) // clamped to the section
    expect(store().past.length).toBe(before + 2)
    store().undo()
    expect(notes().map((n) => n.pitch).sort()).toEqual([64, 72])
  })

  it('fits a drum pattern to the section', () => {
    const drumId = store().addDrumTrack()
    const drumPart = { trackId: drumId, sectionId: part.sectionId }
    const short = { ...partPattern(drums(drumId), part.sectionId)!, kick: [1, 0, 0, 0, 1] }
    store().setDrumPattern(drumPart, short)
    const kick = partPattern(drums(drumId), part.sectionId)!.kick
    expect(kick).toHaveLength(64)
    expect(kick.slice(0, 6)).toEqual([1, 0, 0, 0, 1, 0])
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
    const tx = store().beginTransaction()
    for (let i = 1; i <= 5; i++) store().updateNotes(part, { [id]: { start: i } })
    store().endTransaction(tx)
    expect(store().past.length).toBe(before + 1)
    expect(notes()[0].start).toBe(5)
    store().undo()
    expect(notes()[0].start).toBe(0)
  })

  it('joins nested transactions and ignores a stray end from another gesture', () => {
    const outer = store().beginTransaction()
    store().setBpm(90)
    store().transact(() => store().setBpm(95)) // a tool writing while a drag is open joins it
    store().endTransaction(12345) // not an open transaction: ignored
    store().setBpm(100)
    expect(store().past).toHaveLength(0)
    store().endTransaction(outer)
    expect(store().past).toHaveLength(1)
    store().undo()
    expect(song().bpm).toBe(120)
  })

  it('closes an open transaction on undo, so the interrupted drag stops editing', () => {
    store().setBpm(90)
    const tx = store().beginTransaction()
    store().setBpm(100)
    store().undo()
    expect(store().isTransactionOpen(tx)).toBe(false)
    expect(song().bpm).toBe(90) // the drag's change was committed as one step, then undone
    store().endTransaction(tx) // the gesture ending later is harmless
    store().redo()
    expect(song().bpm).toBe(100)
    expect(store().future).toHaveLength(0)
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
    store().endTransaction(store().beginTransaction())
    expect(store().past.length).toBe(before)

    const tx = store().beginTransaction()
    store().setBpm(150)
    store().cancelTransaction(tx)
    expect(song().bpm).toBe(120)
    expect(store().past.length).toBe(before)
    expect(store().isTransactionOpen(tx)).toBe(false)
  })
})

describe('track edits', () => {
  it('caps track names and ignores invalid colors', () => {
    store().updateTrack(trackId, { name: 'x'.repeat(200), color: 'red' })
    expect(instrument(trackId).name).toHaveLength(MAX_NAME_LENGTH)
    expect(instrument(trackId).color).toMatch(/^#[0-9a-f]{6}$/i)
    store().updateTrack(trackId, { color: '#123abc' })
    expect(instrument(trackId).color).toBe('#123abc')
  })
})
