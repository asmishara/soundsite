import * as Tone from 'tone'
import { DRUM_VOICE_IDS } from '../model/presets'
import type { DrumVoiceId, Song } from '../model/types'
import { useSongStore } from '../state/songStore'
import { useUiStore } from '../state/uiStore'
import { AudioGraph } from './graph'

/**
 * The live audio engine: an AudioGraph in the real-time context that mirrors the song store,
 * so the UI never talks to Tone directly.
 */
class AudioEngine {
  private graph: AudioGraph | null = null
  private starting: Promise<void> | null = null
  private bpm = 0

  get isReady(): boolean {
    return this.graph !== null
  }

  /** Unlocks audio (must be called from a user gesture) and builds the graph. Safe to call repeatedly. */
  start(): Promise<void> {
    if (this.graph) return Promise.resolve()
    this.starting ??= (async () => {
      await Tone.start()
      const song = useSongStore.getState().song
      this.graph = new AudioGraph(song)
      this.syncTransport(song)
      useSongStore.subscribe((state, prev) => {
        if (state.song === prev.song) return
        this.graph?.sync(state.song)
        this.syncTransport(state.song)
      })
      useUiStore.getState().setAudioReady(true)
    })()
    return this.starting
  }

  private syncTransport(song: Song): void {
    if (song.bpm === this.bpm) return
    Tone.getTransport().bpm.value = song.bpm
    this.bpm = song.bpm
  }

  triggerNote(trackId: string, pitch: number, duration: number, time: number, velocity: number): void {
    this.graph?.triggerNote(trackId, pitch, duration, time, velocity)
  }

  triggerDrum(trackId: string, voice: DrumVoiceId, time: number, velocity: number): void {
    this.graph?.triggerDrum(trackId, voice, time, velocity)
  }

  /** Auditions a pitch (instrument tracks) or a drum voice right now. */
  async preview(trackId: string, what: number | DrumVoiceId, velocity = 0.8): Promise<void> {
    await this.start()
    const time = Tone.now() + 0.01
    if (typeof what === 'number') this.triggerNote(trackId, what, 0.3, time, velocity)
    else if (DRUM_VOICE_IDS.includes(what)) this.triggerDrum(trackId, what, time, velocity)
  }

  releaseAll(): void {
    this.graph?.releaseAll()
  }

  debugChannel(trackId: string) {
    return this.graph?.debugChannel(trackId) ?? null
  }

  debugReturns() {
    return this.graph?.debugReturns() ?? null
  }

  get trackCount(): number {
    return this.graph?.trackCount ?? 0
  }
}

export const engine = new AudioEngine()
