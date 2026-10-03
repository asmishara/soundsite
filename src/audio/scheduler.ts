import * as Tone from 'tone'
import { DRUM_VOICE_IDS } from '../model/presets'
import { STEPS_PER_BEAT, type Note } from '../model/types'
import { usePlayheadStore } from '../state/playheadStore'
import { totalSteps, useSongStore } from '../state/songStore'
import { engine } from './engine'

let step = 0
let repeatId: number | null = null
/** Bumped on play/stop so playhead updates queued by a previous run are ignored. */
let generation = 0

/** Notes grouped by start step. Keyed by the notes array, which immer replaces whenever a note changes. */
const noteIndex = new WeakMap<Note[], Map<number, Note[]>>()

function notesByStart(notes: Note[]): Map<number, Note[]> {
  let index = noteIndex.get(notes)
  if (!index) {
    index = new Map()
    for (const note of notes) {
      const bucket = index.get(note.start)
      if (bucket) bucket.push(note)
      else index.set(note.start, [note])
    }
    noteIndex.set(notes, index)
  }
  return index
}

/** Runs once per 16th note. Reads the song live, so edits during playback are heard on the next pass. */
function tick(time: number): void {
  const song = useSongStore.getState().song
  const current = step % totalSteps(song)
  step = current + 1
  const stepSeconds = 60 / song.bpm / STEPS_PER_BEAT

  for (const track of song.tracks) {
    if (track.kind === 'instrument') {
      const starting = notesByStart(track.notes).get(current)
      if (!starting) continue
      for (const note of starting) {
        engine.triggerNote(track.id, note.pitch, note.length * stepSeconds * 0.98, time, note.velocity)
      }
    } else {
      for (const voice of DRUM_VOICE_IDS) {
        const velocity = track.steps[voice][current]
        if (velocity > 0) engine.triggerDrum(track.id, voice, time, velocity)
      }
    }
  }

  // Move the playhead when the step is actually heard. A timer rather than Tone.Draw (requestAnimationFrame)
  // keeps it updating even when the page isn't being painted.
  const gen = generation
  setTimeout(
    () => {
      if (gen === generation) usePlayheadStore.setState({ step: current })
    },
    Math.max(0, (time - Tone.immediate()) * 1000),
  )
}

export async function play(): Promise<void> {
  await engine.start()
  if (repeatId !== null) return
  const transport = Tone.getTransport()
  step = 0
  generation++
  repeatId = transport.scheduleRepeat(tick, '16n', 0)
  transport.start('+0.05')
  usePlayheadStore.setState({ isPlaying: true, step: 0 })
}

export function stop(): void {
  const transport = Tone.getTransport()
  transport.stop()
  if (repeatId !== null) transport.clear(repeatId)
  repeatId = null
  generation++
  engine.releaseAll()
  usePlayheadStore.setState({ isPlaying: false, step: -1 })
}

export function togglePlay(): void {
  if (usePlayheadStore.getState().isPlaying) stop()
  else void play()
}
