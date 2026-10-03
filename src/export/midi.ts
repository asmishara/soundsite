import { Midi } from '@tonejs/midi'
import { songEvents, swingOffsetSteps } from '../model/arrangement'
import type { DrumVoiceId, InstrumentPresetId, Song } from '../model/types'

/** The General MIDI program (0-based) closest to each preset, so other apps pick a sensible sound. */
export const GM_PROGRAMS: Record<InstrumentPresetId, number> = {
  lead: 81, // Lead 2 (sawtooth)
  bass: 38, // Synth Bass 1
  pad: 89, // Pad 2 (warm)
  keys: 4, // Electric Piano 1
  pluck: 45, // Pizzicato Strings
  bell: 8, // Celesta
}

/** General MIDI percussion keys (channel 10). */
export const GM_DRUMS: Record<DrumVoiceId, number> = {
  kick: 36,
  rim: 37,
  snare: 38,
  clap: 39,
  hatClosed: 42,
  tomLow: 45,
  hatOpen: 46,
  crash: 49,
  tomHigh: 50,
}

/** MIDI channel 10, reserved for drums. */
export const DRUM_CHANNEL = 9
const MELODIC_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]

/** CC7 volume is roughly a squared curve, so a gain maps to its square root. */
function volumeCc(db: number): number {
  return Math.sqrt(Math.min(1, 10 ** (db / 20)))
}

/**
 * The whole arrangement as a Standard MIDI File: one MIDI track per track, with tempo, General MIDI
 * instruments, each track's volume and pan, and swing applied to note timing as it plays.
 */
export function songToMidi(song: Song): Uint8Array {
  const midi = new Midi()
  midi.name = song.name
  midi.header.setTempo(song.bpm)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] })
  midi.header.update()

  const ticksPerStep = midi.header.ppq / 4
  const tickAt = (step: number) => Math.round((step + swingOffsetSteps(step, song.swing)) * ticksPerStep)

  const byTrack = new Map<string, ReturnType<Midi['addTrack']>>()
  let melodic = 0
  for (const track of song.tracks) {
    const out = midi.addTrack()
    out.name = track.name
    if (track.kind === 'drums') {
      out.channel = DRUM_CHANNEL
    } else {
      out.channel = MELODIC_CHANNELS[melodic++ % MELODIC_CHANNELS.length]
      out.instrument.number = GM_PROGRAMS[track.preset]
    }
    out.addCC({ number: 7, value: volumeCc(track.mixer.volume), ticks: 0 })
    out.addCC({ number: 10, value: (track.mixer.pan + 1) / 2, ticks: 0 })
    byTrack.set(track.id, out)
  }

  for (const event of songEvents(song)) {
    const out = byTrack.get(event.trackId)
    if (!out) continue
    const ticks = tickAt(event.step)
    if (event.type === 'note') {
      // Ending on the (swung) grid position keeps repeated notes from overlapping.
      const durationTicks = Math.max(1, tickAt(event.step + event.length) - ticks)
      out.addNote({ midi: event.pitch, ticks, durationTicks, velocity: event.velocity })
    } else {
      out.addNote({ midi: GM_DRUMS[event.voice], ticks, durationTicks: ticksPerStep / 2, velocity: event.velocity })
    }
  }

  return midi.toArray()
}
