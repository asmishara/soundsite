import { describe, expect, it } from 'vitest'
import { partNotes, partPattern } from './arrangement'
import { createDemoSong } from './demoSong'
import { FILE_FORMAT, FILE_VERSION, SongFileError, parseSong, serializeSong, songFileName } from './serialize'
import type { DrumTrack, InstrumentTrack, Song } from './types'

/** Song structure with every id replaced by a position, for comparing across a round trip (ids are regenerated). */
function structure(song: Song) {
  const index = new Map(song.sections.map((s, i) => [s.id, i]))
  const byIndex = <T,>(parts: Record<string, T>) => Object.fromEntries(Object.entries(parts).map(([id, v]) => [index.get(id), v]))
  return {
    ...song,
    sections: song.sections.map(({ id: _id, ...s }) => s),
    arrangement: song.arrangement.map((e) => index.get(e.sectionId)),
    tracks: song.tracks.map(({ id: _id, ...t }) =>
      t.kind === 'instrument'
        ? { ...t, notes: byIndex(Object.fromEntries(Object.entries(t.notes).map(([k, ns]) => [k, ns.map(({ id: _n, ...n }) => n)]))) }
        : { ...t, steps: byIndex(t.steps) },
    ),
  }
}

const v1File = {
  format: FILE_FORMAT,
  version: 1,
  song: {
    name: 'Old loop',
    bpm: 100,
    swing: 0.2,
    bars: 2,
    key: { root: 9, scale: 'minor' },
    masterVolume: -3,
    fx: { reverbDecay: 2, reverbWet: 1, delayTime: '8n', delayFeedback: 0.3 },
    tracks: [
      {
        id: 't1',
        kind: 'instrument',
        name: 'Lead',
        color: '#f472b6',
        preset: 'pluck',
        notes: [{ id: 'n1', pitch: 69, start: 4, length: 4, velocity: 0.7 }],
        mixer: { volume: -10, pan: 0.2, mute: false, solo: false, reverbSend: 0.3, delaySend: 0 },
      },
      {
        id: 't2',
        kind: 'drums',
        name: 'Beat',
        color: '#fb923c',
        steps: { kick: [1, 0, 0, 0, 0.7], snare: [0, 0, 0, 0, 1] },
        mixer: { volume: -4, pan: 0, mute: true, solo: false, reverbSend: 0, delaySend: 0 },
      },
    ],
  },
}

describe('song files', () => {
  it('round-trips a song with sections and an arrangement', () => {
    const song = createDemoSong()
    expect(structure(parseSong(serializeSong(song)))).toEqual(structure(song))
  })

  it('wraps the song with format and version', () => {
    const file = JSON.parse(serializeSong(createDemoSong()))
    expect(file.format).toBe(FILE_FORMAT)
    expect(file.version).toBe(FILE_VERSION)
    expect(typeof file.savedAt).toBe('string')
  })

  it('upgrades version 1 files to a single section', () => {
    const song = parseSong(JSON.stringify(v1File))
    expect(song.sections).toHaveLength(1)
    expect(song.sections[0]).toMatchObject({ name: 'Section A', bars: 2 })
    expect(song.arrangement).toEqual([{ id: expect.any(String), sectionId: song.sections[0].id }])
    expect(song).toMatchObject({ name: 'Old loop', bpm: 100, swing: 0.2, key: { root: 9, scale: 'minor' } })

    const sectionId = song.sections[0].id
    const lead = song.tracks[0] as InstrumentTrack
    expect(lead.preset).toBe('pluck')
    expect(partNotes(lead, sectionId).map(({ pitch, start, length, velocity }) => ({ pitch, start, length, velocity }))).toEqual([
      { pitch: 69, start: 4, length: 4, velocity: 0.7 },
    ])
    const beat = song.tracks[1] as DrumTrack
    expect(beat.mixer.mute).toBe(true)
    expect(partPattern(beat, sectionId)!.kick.slice(0, 6)).toEqual([1, 0, 0, 0, 0.7, 0])
    expect(partPattern(beat, sectionId)!.kick).toHaveLength(32)
  })

  it('regenerates ids so duplicates in a file never collide', () => {
    const song = createDemoSong()
    const lead = song.tracks[0] as InstrumentTrack
    for (const notes of Object.values(lead.notes)) notes.forEach((n) => (n.id = 'same'))
    song.tracks.forEach((t) => (t.id = 'same'))
    const loaded = parseSong(serializeSong(song))
    const trackIds = loaded.tracks.map((t) => t.id)
    const noteIds = Object.values((loaded.tracks[0] as InstrumentTrack).notes).flat().map((n) => n.id)
    expect(new Set(trackIds).size).toBe(trackIds.length)
    expect(new Set(noteIds).size).toBe(noteIds.length)
  })

  it('keeps every section reachable and drops broken arrangement entries', () => {
    const raw = {
      format: FILE_FORMAT,
      version: 2,
      song: {
        sections: [
          { id: 'a', name: 'Verse', bars: 4 },
          { id: 'b', name: 'Chorus', bars: 2 },
          { id: 'a', name: 'Duplicate id', bars: 8 },
        ],
        arrangement: [{ sectionId: 'a' }, { sectionId: 'missing' }, { nope: true }, { sectionId: 'a' }],
        tracks: [{ kind: 'instrument', preset: 'keys', notes: { b: [{ pitch: 60, start: 0, length: 2 }] } }],
      },
    }
    const song = parseSong(JSON.stringify(raw))
    expect(song.sections.map((s) => s.name)).toEqual(['Verse', 'Chorus'])
    const names = song.arrangement.map((e) => song.sections.find((s) => s.id === e.sectionId)!.name)
    expect(names).toEqual(['Verse', 'Verse', 'Chorus']) // unreferenced Chorus is appended
    const keys = song.tracks[0] as InstrumentTrack
    expect(partNotes(keys, song.sections[1].id)).toHaveLength(1)
    expect(partNotes(keys, song.sections[0].id)).toHaveLength(0)
  })

  it('creates a section when a file has none', () => {
    const song = parseSong(JSON.stringify({ format: FILE_FORMAT, version: 2, song: { sections: [], tracks: [] } }))
    expect(song.sections).toHaveLength(1)
    expect(song.arrangement).toHaveLength(1)
  })

  it('accepts a bare song object without the file wrapper', () => {
    const song = createDemoSong()
    expect(parseSong(JSON.stringify(song)).tracks).toHaveLength(song.tracks.length)
  })

  it('rejects things that are not songs', () => {
    expect(() => parseSong('not json')).toThrow(SongFileError)
    expect(() => parseSong('[1, 2, 3]')).toThrow(SongFileError)
    expect(() => parseSong('{"hello": "world"}')).toThrow(SongFileError)
    expect(() => parseSong('{"format": "something-else", "song": {"tracks": []}}')).toThrow(SongFileError)
  })

  it('rejects files from a newer version', () => {
    const file = { format: FILE_FORMAT, version: FILE_VERSION + 1, song: createDemoSong() }
    expect(() => parseSong(JSON.stringify(file))).toThrow(/newer version/)
  })

  it('repairs out-of-range and missing values', () => {
    const raw = {
      format: FILE_FORMAT,
      version: 2,
      song: {
        name: '   ',
        bpm: 999,
        swing: -2,
        key: { root: 40, scale: 'klingon' },
        fx: { delayTime: '3n', delayFeedback: 5 },
        sections: [{ id: 's', name: '', bars: 2, color: 'blue' }],
        arrangement: [{ sectionId: 's' }],
        tracks: [
          {
            kind: 'instrument',
            preset: 'theremin',
            color: 'red',
            mixer: { volume: 50, pan: 'left', mute: 'yes' },
            notes: {
              s: [
                { pitch: 200, start: 3, length: 999, velocity: 7 },
                { pitch: 60, start: 40 }, // past the end of a 2-bar section
                { pitch: 'C4', start: 0 }, // invalid
                { pitch: 62, start: 0 }, // missing length/velocity
              ],
            },
          },
          { kind: 'drums', steps: { s: { kick: [1, 0, 5, 'x'], bogus: [1] } } },
          { kind: 'spaceship' },
          null,
        ],
      },
    }
    const song = parseSong(JSON.stringify(raw))
    expect(song.name).toBe('Untitled song')
    expect(song.bpm).toBe(240)
    expect(song.swing).toBe(0)
    expect(song.key).toEqual({ root: 11, scale: 'major' })
    expect(song.fx.delayTime).toBe('8n.')
    expect(song.fx.delayFeedback).toBe(0.9)
    expect(song.sections[0]).toMatchObject({ name: 'Section A', bars: 2 })
    expect(song.sections[0].color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(song.tracks).toHaveLength(2)

    const sectionId = song.sections[0].id
    const inst = song.tracks[0] as InstrumentTrack
    expect(inst.preset).toBe('lead')
    expect(inst.color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(inst.mixer).toMatchObject({ volume: 6, pan: 0, mute: false })
    expect(partNotes(inst, sectionId).map(({ pitch, start, length, velocity }) => ({ pitch, start, length, velocity }))).toEqual([
      { pitch: 96, start: 3, length: 29, velocity: 1 },
      { pitch: 62, start: 0, length: 1, velocity: 0.8 },
    ])

    const pattern = partPattern(song.tracks[1] as DrumTrack, sectionId)!
    expect(pattern.kick).toHaveLength(32)
    expect(pattern.kick.slice(0, 4)).toEqual([1, 0, 1, 0])
    expect(pattern.snare.every((v) => v === 0)).toBe(true)
    expect('bogus' in pattern).toBe(false)
  })
})

describe('file names', () => {
  it('slugifies song names', () => {
    expect(songFileName('Night drive (demo)')).toBe('night-drive-demo.soundsite.json')
    expect(songFileName('Café Ünïcode!!')).toBe('cafe-unicode.soundsite.json')
    expect(songFileName('???')).toBe('song.soundsite.json')
  })
})
