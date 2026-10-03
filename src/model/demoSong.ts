import { createDrumTrack, createEmptySong, createInstrumentTrack, createNote } from './factory'
import { NORMAL_VELOCITY } from './presets'
import { STEPS_PER_BAR, type Song } from './types'

/** A 4-bar loop in C minor (i–VI–III–VII) so there's something to hear on first load. */
export function createDemoSong(): Song {
  const song = createEmptySong()
  song.name = 'Night drive (demo)'
  song.bpm = 110
  song.swing = 0.1
  song.bars = 4
  song.key = { root: 0, scale: 'minor' }

  const chords = [
    [60, 63, 67], // Cm
    [60, 63, 68], // Ab/C
    [58, 63, 67], // Eb/Bb
    [58, 62, 65], // Bb
  ]
  const bassRoots = [36, 32, 39, 34] // C2 Ab1 Eb2 Bb1

  const pad = createInstrumentTrack('pad')
  pad.mixer = { ...pad.mixer, volume: -15, reverbSend: 0.45 }
  chords.forEach((chord, bar) => {
    chord.forEach((pitch) => pad.notes.push(createNote(pitch, bar * STEPS_PER_BAR, STEPS_PER_BAR, 0.6)))
  })

  const bass = createInstrumentTrack('bass')
  bass.mixer = { ...bass.mixer, volume: -7, reverbSend: 0 }
  const bassRhythm: [step: number, length: number, octave: number][] = [
    [0, 2, 0],
    [3, 1, 0],
    [6, 2, 0],
    [8, 2, 0],
    [11, 1, 0],
    [12, 2, 0],
    [14, 2, 12],
  ]
  bassRoots.forEach((root, bar) => {
    bassRhythm.forEach(([step, length, octave]) =>
      bass.notes.push(createNote(root + octave, bar * STEPS_PER_BAR + step, length, step % 4 === 0 ? 0.9 : 0.7)),
    )
  })

  const lead = createInstrumentTrack('lead')
  lead.mixer = { ...lead.mixer, volume: -13, reverbSend: 0.25, delaySend: 0.22 }
  const melody: [pitch: number, start: number, length: number][] = [
    [75, 0, 2], [74, 2, 2], [72, 4, 4], [67, 10, 2], [72, 12, 4],
    [75, 16, 2], [77, 18, 2], [75, 20, 2], [72, 22, 6], [68, 28, 4],
    [79, 32, 2], [77, 34, 2], [75, 36, 4], [70, 42, 2], [75, 44, 4],
    [74, 48, 2], [75, 50, 2], [77, 52, 4], [74, 58, 2], [70, 60, 4],
  ]
  melody.forEach(([pitch, start, length]) => lead.notes.push(createNote(pitch, start, length)))

  const drums = createDrumTrack(song.bars)
  for (let bar = 0; bar < song.bars; bar++) {
    const o = bar * STEPS_PER_BAR
    for (const s of [0, 4, 8, 12]) drums.steps.kick[o + s] = 0.9
    for (const s of [4, 12]) drums.steps.snare[o + s] = NORMAL_VELOCITY
    for (let s = 0; s < 14; s += 2) drums.steps.hatClosed[o + s] = s % 4 === 0 ? 0.6 : 0.4
    drums.steps.hatOpen[o + 14] = 0.5
  }
  drums.steps.crash[0] = NORMAL_VELOCITY
  drums.steps.clap[3 * STEPS_PER_BAR + 12] = NORMAL_VELOCITY
  drums.steps.clap[3 * STEPS_PER_BAR + 14] = 0.5
  drums.steps.clap[3 * STEPS_PER_BAR + 15] = 0.6

  song.tracks = [lead, bass, pad, drums]
  return song
}
