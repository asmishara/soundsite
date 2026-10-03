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
import { useUiStore, type LoopRange, type PlayMode } from '../state/uiStore'
import { engine } from './engine'
import { loopBounds, startWithin, wrapPosition, type LoopBounds } from './loop'

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

/** The loop that applies to the current mode (a section loop only while that section is looping), if any. */
function activeLoop(song: Song, section: Section): LoopBounds | null {
  const loop = useUiStore.getState().loop
  if (!loop) return null
  if (mode === 'section') {
    return loop.scope === 'section' && loop.sectionId === section.id ? loopBounds(loop, sectionSteps(section)) : null
  }
  return loop.scope === 'song' ? loopBounds(loop, layoutArrangement(song).totalSteps) : null
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
    // At the end of the song (or of a song loop) go back to the top (or the loop start).
    position = wrapPosition(position, layout.totalSteps, activeLoop(song, selectedSection(song)))
    const found = locate(layout, position)
    if (!found) return
    section = found.placement.section
    local = found.localStep
    entryId = found.placement.entry.id
    songStep = position
    position++
  } else {
    section = selectedSection(song)
    position = wrapPosition(position, sectionSteps(section), activeLoop(song, section))
    local = position
    entryId = useUiStore.getState().selectedEntryId
    position++
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

/**
 * Where playback should begin: the start marker within the selected section (placed in the song in
 * song mode), or the loop start if the marker is outside an active loop.
 */
function startPosition(): number {
  const song = useSongStore.getState().song
  const section = selectedSection(song)
  const local = Math.min(useUiStore.getState().startStep, sectionSteps(section) - 1)
  const placement = selectedPlacement(song)
  const marker = mode === 'section' ? local : placement ? placement.start + local : 0
  return startWithin(marker, activeLoop(song, section))
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
  // A loop belongs to one mode (section bars or a stretch of the song), so drop it when leaving that mode.
  if (ui.loop && (ui.loop.scope === 'song') !== (next === 'song')) ui.setLoop(null)
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

/**
 * Sets (or clears) the loop range. A section loop switches to looping the section and a song loop
 * to playing the song. While playing, playback jumps into the new loop if it's outside it.
 */
export function setLoop(loop: LoopRange | null): void {
  const ui = useUiStore.getState()
  ui.setLoop(loop)
  if (!loop) return
  const song = useSongStore.getState().song
  if (loop.scope === 'section') {
    ui.setStartStep(loop.start)
  } else {
    // Select the block the loop starts in, so the start marker sits at the loop start.
    const found = locate(layoutArrangement(song), loop.start)
    if (found) ui.selectEntry(found.placement.entry.id, found.placement.section.id, found.localStep)
  }
  const wanted: PlayMode = loop.scope === 'song' ? 'song' : 'section'
  const modeChanged = ui.playMode !== wanted
  if (modeChanged) ui.setPlayMode(wanted)
  mode = wanted
  if (repeatId === null) return
  const bounds = activeLoop(song, selectedSection(song))
  // Positions mean different things in the two modes, so a mode change always restarts at the loop.
  if (bounds && (modeChanged || position < bounds.start || position >= bounds.end)) {
    position = bounds.start
    engine.releaseAll()
  }
}
