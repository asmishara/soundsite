import {
  SECTION_COLORS,
  createDrumTrack,
  createEmptySong,
  createEntry,
  createInstrumentTrack,
  createNote,
  createSection,
} from './factory'
import { NORMAL_VELOCITY } from './presets'
import { STEPS_PER_BAR, type DrumTrack, type InstrumentTrack, type Section, type Song } from './types'

/** Pad chords, one per bar (MIDI pitches). */
type Progression = number[][]

const LOOP: Progression = [
  [60, 63, 67], // Cm
  [60, 63, 68], // Ab/C
  [58, 63, 67], // Eb/Bb
  [58, 62, 65], // Bb
]
const LOOP_ROOTS = [36, 32, 39, 34] // C2 Ab1 Eb2 Bb1

const ENDING: Progression = [
  [60, 63, 68], // Ab/C
  [58, 63, 67], // Eb/Bb
  [58, 62, 65], // Bb
  [60, 63, 67], // Cm
]
const ENDING_ROOTS = [32, 39, 34, 36]

function addChords(track: InstrumentTrack, section: Section, chords: Progression, velocity: number) {
  chords.forEach((chord, bar) => {
    for (const pitch of chord) track.notes[section.id].push(createNote(pitch, bar * STEPS_PER_BAR, STEPS_PER_BAR, velocity))
  })
}

function hats(drums: DrumTrack, section: Section, accent: number, offbeat: number) {
  for (let bar = 0; bar < section.bars; bar++) {
    for (let s = 0; s < 14; s += 2) drums.steps[section.id].hatClosed[bar * STEPS_PER_BAR + s] = s % 4 === 0 ? accent : offbeat
  }
}

/** A 16-bar song in C minor: Intro → Main → Main (linked repeat) → Outro. */
export function createDemoSong(): Song {
  const intro = createSection('Intro', 4, SECTION_COLORS[0])
  const main = createSection('Main', 4, SECTION_COLORS[1])
  const outro = createSection('Outro', 4, SECTION_COLORS[2])
  const sections = [intro, main, outro]

  const song = createEmptySong()
  song.name = 'Night drive (demo)'
  song.bpm = 110
  song.swing = 0.1
  song.key = { root: 0, scale: 'minor' }
  song.sections = sections
  song.arrangement = [intro, main, main, outro].map((s) => createEntry(s.id))

  // Lead: a melody over the main loop, and a final held note at the end.
  const lead = createInstrumentTrack('lead', sections)
  lead.mixer = { ...lead.mixer, volume: -13, reverbSend: 0.25, delaySend: 0.22 }
  const melody: [pitch: number, start: number, length: number][] = [
    [75, 0, 2], [74, 2, 2], [72, 4, 4], [67, 10, 2], [72, 12, 4],
    [75, 16, 2], [77, 18, 2], [75, 20, 2], [72, 22, 6], [68, 28, 4],
    [79, 32, 2], [77, 34, 2], [75, 36, 4], [70, 42, 2], [75, 44, 4],
    [74, 48, 2], [75, 50, 2], [77, 52, 4], [74, 58, 2], [70, 60, 4],
  ]
  for (const [pitch, start, length] of melody) lead.notes[main.id].push(createNote(pitch, start, length))
  const motif: [pitch: number, start: number, length: number][] = [
    [75, 8, 4], [74, 12, 4], [72, 16, 12], [67, 40, 4], [68, 44, 4], [67, 48, 12],
  ]
  for (const [pitch, start, length] of motif) lead.notes[intro.id].push(createNote(pitch, start, length, 0.7))
  lead.notes[outro.id].push(createNote(72, 3 * STEPS_PER_BAR, STEPS_PER_BAR, 0.6))

  // Bass: driving eighths in the main loop, long roots in the outro.
  const bass = createInstrumentTrack('bass', sections)
  bass.mixer = { ...bass.mixer, volume: -7, reverbSend: 0 }
  const rhythm: [step: number, length: number, octave: number][] = [
    [0, 2, 0], [3, 1, 0], [6, 2, 0], [8, 2, 0], [11, 1, 0], [12, 2, 0], [14, 2, 12],
  ]
  LOOP_ROOTS.forEach((root, bar) => {
    for (const [step, length, octave] of rhythm) {
      bass.notes[main.id].push(createNote(root + octave, bar * STEPS_PER_BAR + step, length, step % 4 === 0 ? 0.9 : 0.7))
    }
  })
  LOOP_ROOTS.forEach((root, bar) => bass.notes[intro.id].push(createNote(root, bar * STEPS_PER_BAR, STEPS_PER_BAR, 0.65)))
  ENDING_ROOTS.forEach((root, bar) => bass.notes[outro.id].push(createNote(root, bar * STEPS_PER_BAR, STEPS_PER_BAR, 0.75)))

  // Pad: the progression throughout.
  const pad = createInstrumentTrack('pad', sections)
  pad.mixer = { ...pad.mixer, volume: -15, reverbSend: 0.45 }
  addChords(pad, intro, LOOP, 0.6)
  addChords(pad, main, LOOP, 0.6)
  addChords(pad, outro, ENDING, 0.6)

  const drums = createDrumTrack(sections)
  // Intro: hats and a kick on each downbeat, building into a snare fill.
  hats(drums, intro, 0.45, 0.3)
  const introSteps = drums.steps[intro.id]
  for (let bar = 0; bar < intro.bars; bar++) introSteps.kick[bar * STEPS_PER_BAR] = 0.75
  for (const s of [56, 58, 60, 62]) introSteps.snare[s] = 0.45
  introSteps.snare[63] = 0.6
  // Main: four on the floor.
  const mainSteps = drums.steps[main.id]
  for (let bar = 0; bar < main.bars; bar++) {
    const o = bar * STEPS_PER_BAR
    for (const s of [0, 4, 8, 12]) mainSteps.kick[o + s] = 0.9
    for (const s of [4, 12]) mainSteps.snare[o + s] = NORMAL_VELOCITY
    mainSteps.hatOpen[o + 14] = 0.5
  }
  hats(drums, main, 0.6, 0.4)
  mainSteps.crash[0] = NORMAL_VELOCITY
  mainSteps.clap[3 * STEPS_PER_BAR + 12] = NORMAL_VELOCITY
  mainSteps.clap[3 * STEPS_PER_BAR + 14] = 0.5
  mainSteps.clap[3 * STEPS_PER_BAR + 15] = 0.6
  // Outro: a kick on each downbeat, then let the last chord ring.
  const outroSteps = drums.steps[outro.id]
  outroSteps.crash[0] = NORMAL_VELOCITY
  for (let bar = 0; bar < 3; bar++) outroSteps.kick[bar * STEPS_PER_BAR] = 0.85

  song.tracks = [lead, bass, pad, drums]
  return song
}
