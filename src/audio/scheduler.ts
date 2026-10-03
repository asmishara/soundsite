import * as Tone from 'tone'
import {
  findSection,
  layoutArrangement,
  locate,
  partNotes,
  partPattern,
  placementOf,
  secondsPerStep,
  sectionSteps,
  swingOffsetSteps,
  type Placement,
} from '../model/arrangement'
import { DRUM_VOICE_IDS } from '../model/presets'
import type { Note, Section, Song } from '../model/types'
import { STOPPED, usePlayheadStore } from '../state/playheadStore'
import { useSongStore } from '../state/songStore'
import { useUiStore, type PlayMode } from '../state/uiStore'
import { engine } from './engine'

let repeatId: number | null = null
/** Bumped on play/stop so playhead updates queued by a previous run are ignored. */
let generation = 0
let mode: PlayMode = 'section'
/**
 * The next step to play: a step within the selected section in section mode,
 * or a step from the start of the song in song mode.
 */
let position = 0

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

function selectedSection(song: Song): Section {
  return findSection(song, useUiStore.getState().selectedSectionId) ?? song.sections[0]
}

/** The arrangement block the selected section was picked from (or its first appearance). */
function selectedPlacement(song: Song): Placement | undefined {
  const ui = useUiStore.getState()
  const layout = layoutArrangement(song)
  return placementOf(layout, ui.selectedEntryId) ?? layout.placements.find((p) => p.section.id === ui.selectedSectionId)
}

/** Plays every note and drum hit that starts on `local` in `section`. */
function triggerStep(song: Song, section: Section, local: number, time: number): void {
  const stepSeconds = secondsPerStep(song.bpm)
  const at = time + swingOffsetSteps(local, song.swing) * stepSeconds
  for (const track of song.tracks) {
    if (track.kind === 'instrument') {
      const starting = notesByStart(partNotes(track, section.id)).get(local)
      if (!starting) continue
      for (const note of starting) {
        engine.triggerNote(track.id, note.pitch, note.length * stepSeconds * 0.98, at, note.velocity)
      }
    } else {
      const pattern = partPattern(track, section.id)
      if (!pattern) continue
      for (const voice of DRUM_VOICE_IDS) {
        const velocity = pattern[voice][local]
        if (velocity > 0) engine.triggerDrum(track.id, voice, at, velocity)
      }
    }
  }
}

/** Runs once per 16th note. Reads the song live, so edits during playback are heard on the next pass. */
function tick(time: number): void {
  const song = useSongStore.getState().song
  let section: Section
  let local: number
  let entryId: string | null
  let songStep = -1

  if (mode === 'song') {
    const layout = layoutArrangement(song)
    if (position >= layout.totalSteps) position = 0 // loop back to the top of the song
    const found = locate(layout, position)
    if (!found) return
    section = found.placement.section
    local = found.localStep
    entryId = found.placement.entry.id
    songStep = position
    position++
  } else {
    section = selectedSection(song)
    const steps = sectionSteps(section)
    local = position % steps
    entryId = useUiStore.getState().selectedEntryId
    position = (local + 1) % steps
  }

  triggerStep(song, section, local, time)

  // Move the playhead when the step is actually heard. A timer rather than Tone.Draw (requestAnimationFrame)
  // keeps it updating even when the page isn't being painted.
  const gen = generation
  const sectionId = section.id
  setTimeout(
    () => {
      if (gen === generation) usePlayheadStore.setState({ sectionId, entryId, step: local, songStep })
    },
    Math.max(0, (time - Tone.immediate()) * 1000),
  )
}

/** Where playback should begin: the start marker within the selected section, placed in the song if needed. */
function startPosition(): number {
  const song = useSongStore.getState().song
  const section = selectedSection(song)
  const local = Math.min(useUiStore.getState().startStep, sectionSteps(section) - 1)
  if (mode === 'section') return local
  const placement = selectedPlacement(song)
  return placement ? placement.start + local : 0
}

export function isPlaying(): boolean {
  return repeatId !== null
}

export async function play(): Promise<void> {
  await engine.start()
  if (repeatId !== null) return
  mode = useUiStore.getState().playMode
  position = startPosition()
  generation++
  const transport = Tone.getTransport()
  repeatId = transport.scheduleRepeat(tick, '16n', 0)
  transport.start('+0.05')
  usePlayheadStore.setState({ isPlaying: true })
}

export function stop(): void {
  const transport = Tone.getTransport()
  transport.stop()
  if (repeatId !== null) transport.clear(repeatId)
  repeatId = null
  generation++
  engine.releaseAll()
  usePlayheadStore.setState({ isPlaying: false, ...STOPPED })
}

export function togglePlay(): void {
  if (repeatId !== null) stop()
  else void play()
}

/** Switches between looping the selected section and playing the song, carrying on from the same spot. */
export function setPlayMode(next: PlayMode): void {
  const ui = useUiStore.getState()
  if (ui.playMode === next) return
  ui.setPlayMode(next)
  if (repeatId !== null && mode !== next) {
    const song = useSongStore.getState().song
    if (next === 'song') {
      position = (selectedPlacement(song)?.start ?? 0) + position
    } else {
      const layout = layoutArrangement(song)
      const found = locate(layout, position % Math.max(layout.totalSteps, 1))
      if (found) {
        // Keep looping whatever was playing.
        ui.selectEntry(found.placement.entry.id, found.placement.section.id)
        position = found.localStep
      } else {
        position = 0
      }
    }
  }
  mode = next
}

/**
 * Moves the start marker to a step of the selected section. While playing, playback jumps there
 * straight away (in song mode, to that spot in the selected block).
 */
export function cue(localStep: number): void {
  const ui = useUiStore.getState()
  ui.setStartStep(localStep)
  if (repeatId === null) return
  if (mode === 'section') {
    position = localStep
  } else {
    const placement = selectedPlacement(useSongStore.getState().song)
    position = (placement?.start ?? 0) + localStep
  }
  engine.releaseAll()
}
