import { describe, expect, it } from 'vitest'
import { createDemoSong } from './demoSong'
import { FILE_FORMAT, FILE_VERSION, SongFileError, parseSong, serializeSong, songFileName } from './serialize'
import type { DrumTrack, InstrumentTrack, Song } from './types'

/** Song with ids removed, for comparing structure across a round trip (ids are regenerated). */
function withoutIds(song: Song) {
  return {
    ...song,
    tracks: song.tracks.map(({ id: _id, ...t }) =>
      t.kind === 'instrument' ? { ...t, notes: t.notes.map(({ id: _nid, ...n }) => n) } : t,
    ),
  }
}

describe('song files', () => {
  it('round-trips a song', () => {
    const song = createDemoSong()
    const loaded = parseSong(serializeSong(song))
    expect(withoutIds(loaded)).toEqual(withoutIds(song))
  })

  it('wraps the song with format and version', () => {
    const file = JSON.parse(serializeSong(createDemoSong()))
    expect(file.format).toBe(FILE_FORMAT)
    expect(file.version).toBe(FILE_VERSION)
    expect(typeof file.savedAt).toBe('string')
  })

  it('regenerates ids so duplicates in a file never collide', () => {
    const song = createDemoSong()
    const lead = song.tracks[0] as InstrumentTrack
    lead.notes.forEach((n) => (n.id = 'same'))
    song.tracks.forEach((t) => (t.id = 'same'))
    const loaded = parseSong(serializeSong(song))
    const trackIds = loaded.tracks.map((t) => t.id)
    const noteIds = (loaded.tracks[0] as InstrumentTrack).notes.map((n) => n.id)
    expect(new Set(trackIds).size).toBe(trackIds.length)
    expect(new Set(noteIds).size).toBe(noteIds.length)
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
      version: 1,
      song: {
        name: '   ',
        bpm: 999,
        swing: -2,
        bars: 2,
        key: { root: 40, scale: 'klingon' },
        fx: { delayTime: '3n', delayFeedback: 5 },
        tracks: [
          {
            kind: 'instrument',
            preset: 'theremin',
            color: 'red',
            mixer: { volume: 50, pan: 'left', mute: 'yes' },
            notes: [
              { pitch: 200, start: 3, length: 999, velocity: 7 },
              { pitch: 60, start: 40 }, // past the end of a 2-bar song
              { pitch: 'C4', start: 0 }, // invalid
              { pitch: 62, start: 0 }, // missing length/velocity
            ],
          },
          { kind: 'drums', steps: { kick: [1, 0, 5, 'x'], bogus: [1] } },
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
    expect(song.tracks).toHaveLength(2)

    const inst = song.tracks[0] as InstrumentTrack
    expect(inst.preset).toBe('lead')
    expect(inst.color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(inst.mixer).toMatchObject({ volume: 6, pan: 0, mute: false })
    expect(inst.notes.map(({ pitch, start, length, velocity }) => ({ pitch, start, length, velocity }))).toEqual([
      { pitch: 96, start: 3, length: 29, velocity: 1 },
      { pitch: 62, start: 0, length: 1, velocity: 0.8 },
    ])

    const drums = song.tracks[1] as DrumTrack
    expect(drums.steps.kick).toHaveLength(32)
    expect(drums.steps.kick.slice(0, 4)).toEqual([1, 0, 1, 0])
    expect(drums.steps.snare.every((v) => v === 0)).toBe(true)
    expect('bogus' in drums.steps).toBe(false)
  })
})

describe('file names', () => {
  it('slugifies song names', () => {
    expect(songFileName('Night drive (demo)')).toBe('night-drive-demo.soundsite.json')
    expect(songFileName('Café Ünïcode!!')).toBe('cafe-unicode.soundsite.json')
    expect(songFileName('???')).toBe('song.soundsite.json')
  })
})
