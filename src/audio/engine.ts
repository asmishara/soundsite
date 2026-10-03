import * as Tone from 'tone'
import { DRUM_VOICE_IDS } from '../model/presets'
import type { DrumVoiceId, FxSettings, InstrumentPresetId, Mixer, Song, Track } from '../model/types'
import { useSongStore } from '../state/songStore'
import { useUiStore } from '../state/uiStore'
import { DrumKit } from './drums'
import { createInstrument, type InstrumentVoice } from './instruments'

type TrackNodes = {
  kind: Track['kind']
  preset: InstrumentPresetId | null
  instrument: InstrumentVoice | null
  kit: DrumKit | null
  channel: Tone.Channel
  reverbSend: Tone.Gain<'decibels'>
  delaySend: Tone.Gain<'decibels'>
  /** Last mixer object applied; immer keeps the reference stable when unchanged. */
  appliedMixer: Mixer | null
}

const RAMP = 0.03

const sendDb = (amount: number) => (amount <= 0.001 ? -Infinity : Tone.gainToDb(amount))

/**
 * Owns every Tone.js node. It mirrors the song store: tracks, mixer and FX settings are
 * reconciled whenever the song changes, so the UI never talks to Tone directly.
 */
class AudioEngine {
  private ready = false
  private starting: Promise<void> | null = null
  private readonly tracks = new Map<string, TrackNodes>()
  private appliedSong: Song | null = null
  private appliedFx: FxSettings | null = null
  private reverbDecayTimer: ReturnType<typeof setTimeout> | undefined

  // Created in start(), after the AudioContext is unlocked.
  private master!: Tone.Volume
  private reverb!: Tone.Reverb
  private reverbReturn!: Tone.Channel
  private delay!: Tone.FeedbackDelay
  private delayReturn!: Tone.Channel

  get isReady(): boolean {
    return this.ready
  }

  /** Unlocks audio (must be called from a user gesture) and builds the graph. Safe to call repeatedly. */
  start(): Promise<void> {
    if (this.ready) return Promise.resolve()
    this.starting ??= (async () => {
      await Tone.start()
      this.buildGraph()
      this.sync(useSongStore.getState().song)
      useSongStore.subscribe((state, prev) => {
        if (state.song !== prev.song) this.sync(state.song)
      })
      this.ready = true
      useUiStore.getState().setAudioReady(true)
    })()
    return this.starting
  }

  private buildGraph(): void {
    // Synth levels are conservative so tracks can be stacked; makeup gain brings the mix up to a
    // comfortable level and the compressor/limiter catch the peaks.
    const makeup = new Tone.Volume(8)
    const compressor = new Tone.Compressor({ threshold: -14, ratio: 3, attack: 0.01, release: 0.2 })
    const limiter = new Tone.Limiter(-1)
    this.master = new Tone.Volume(0)
    this.master.chain(makeup, compressor, limiter, Tone.getDestination())

    const fx = useSongStore.getState().song.fx
    this.reverb = new Tone.Reverb({ decay: fx.reverbDecay, preDelay: 0.02, wet: 1 })
    this.reverbReturn = new Tone.Channel({ volume: 0 }).receive('reverb')
    this.reverbReturn.chain(this.reverb, this.master)

    this.delay = new Tone.FeedbackDelay({ delayTime: fx.delayTime, feedback: fx.delayFeedback, wet: 1 })
    const delayTone = new Tone.Filter({ type: 'lowpass', frequency: 3500 })
    this.delayReturn = new Tone.Channel({ volume: -4 }).receive('delay')
    this.delayReturn.chain(this.delay, delayTone, this.master)

    const transport = Tone.getTransport()
    transport.swingSubdivision = '16n'
  }

  private sync(song: Song): void {
    const prev = this.appliedSong
    const transport = Tone.getTransport()

    if (song.bpm !== prev?.bpm) {
      transport.bpm.value = song.bpm
      this.applyDelayTime(song.fx)
    }
    if (song.swing !== prev?.swing) transport.swing = song.swing
    if (song.masterVolume !== prev?.masterVolume) this.master.volume.rampTo(song.masterVolume, RAMP)
    if (song.fx !== this.appliedFx) this.applyFx(song.fx)

    if (song.tracks !== prev?.tracks) {
      const live = new Set<string>()
      for (const track of song.tracks) {
        live.add(track.id)
        this.syncTrack(track)
      }
      for (const [id, nodes] of this.tracks) {
        if (!live.has(id)) {
          this.disposeTrack(nodes)
          this.tracks.delete(id)
        }
      }
    }
    this.appliedSong = song
  }

  private syncTrack(track: Track): void {
    let nodes = this.tracks.get(track.id)
    if (!nodes) {
      const channel = new Tone.Channel().connect(this.master)
      nodes = {
        kind: track.kind,
        preset: null,
        instrument: null,
        kit: null,
        channel,
        reverbSend: channel.send('reverb', -Infinity),
        delaySend: channel.send('delay', -Infinity),
        appliedMixer: null,
      }
      this.tracks.set(track.id, nodes)
    }

    if (track.kind === 'instrument' && nodes.preset !== track.preset) {
      nodes.instrument?.dispose()
      nodes.instrument = createInstrument(track.preset)
      nodes.instrument.output.connect(nodes.channel)
      nodes.preset = track.preset
    } else if (track.kind === 'drums' && !nodes.kit) {
      nodes.kit = new DrumKit()
      nodes.kit.output.connect(nodes.channel)
    }

    const m = track.mixer
    if (m !== nodes.appliedMixer) {
      const old = nodes.appliedMixer
      if (m.volume !== old?.volume) nodes.channel.volume.rampTo(m.volume, RAMP)
      if (m.pan !== old?.pan) nodes.channel.pan.rampTo(m.pan, RAMP)
      if (m.mute !== old?.mute) nodes.channel.mute = m.mute
      if (m.solo !== old?.solo) nodes.channel.solo = m.solo
      if (m.reverbSend !== old?.reverbSend) nodes.reverbSend.gain.rampTo(sendDb(m.reverbSend), RAMP)
      if (m.delaySend !== old?.delaySend) nodes.delaySend.gain.rampTo(sendDb(m.delaySend), RAMP)
      nodes.appliedMixer = m
    }
  }

  private applyFx(fx: FxSettings): void {
    const old = this.appliedFx
    if (fx.reverbDecay !== old?.reverbDecay && old) {
      // Regenerating the impulse response is expensive, so wait until a knob drag settles.
      clearTimeout(this.reverbDecayTimer)
      this.reverbDecayTimer = setTimeout(() => {
        this.reverb.decay = useSongStore.getState().song.fx.reverbDecay
      }, 200)
    }
    if (fx.reverbWet !== old?.reverbWet) {
      this.reverbReturn.volume.rampTo(fx.reverbWet <= 0.001 ? -Infinity : Tone.gainToDb(fx.reverbWet), RAMP)
    }
    if (fx.delayTime !== old?.delayTime) this.applyDelayTime(fx)
    if (fx.delayFeedback !== old?.delayFeedback) this.delay.feedback.rampTo(fx.delayFeedback, RAMP)
    this.appliedFx = fx
  }

  /** Delay times are musical (e.g. dotted 8th), so they're re-resolved whenever the tempo changes. */
  private applyDelayTime(fx: FxSettings): void {
    this.delay.delayTime.rampTo(Tone.Time(fx.delayTime).toSeconds(), 0.05)
  }

  private disposeTrack(nodes: TrackNodes): void {
    nodes.instrument?.dispose()
    nodes.kit?.dispose()
    nodes.reverbSend.dispose()
    nodes.delaySend.dispose()
    nodes.channel.dispose()
  }

  triggerNote(trackId: string, pitch: number, duration: number, time: number, velocity: number): void {
    const instrument = this.tracks.get(trackId)?.instrument
    if (!instrument) return
    try {
      instrument.trigger(pitch, duration, time, velocity)
    } catch (err) {
      console.warn('Note trigger skipped', err)
    }
  }

  triggerDrum(trackId: string, voice: DrumVoiceId, time: number, velocity: number): void {
    const kit = this.tracks.get(trackId)?.kit
    if (!kit) return
    try {
      kit.trigger(voice, time, velocity)
    } catch (err) {
      // Tone throws if a mono voice is started twice at the exact same time; never let that stop playback.
      console.warn('Drum trigger skipped', err)
    }
  }

  /** Auditions a pitch (instrument tracks) or a drum voice right now. */
  async preview(trackId: string, what: number | DrumVoiceId, velocity = 0.8): Promise<void> {
    await this.start()
    const time = Tone.now() + 0.01
    if (typeof what === 'number') this.triggerNote(trackId, what, 0.3, time, velocity)
    else if (DRUM_VOICE_IDS.includes(what)) this.triggerDrum(trackId, what, time, velocity)
  }

  releaseAll(): void {
    for (const nodes of this.tracks.values()) nodes.instrument?.releaseAll()
  }

  /** Read-only view of a track's channel, for debugging and verification. */
  debugChannel(trackId: string) {
    const nodes = this.tracks.get(trackId)
    if (!nodes) return null
    return {
      volume: nodes.channel.volume.value,
      pan: nodes.channel.pan.value,
      mute: nodes.channel.mute,
      solo: nodes.channel.solo,
      reverbSend: nodes.reverbSend.gain.value,
      delaySend: nodes.delaySend.gain.value,
      preset: nodes.preset,
    }
  }

  get trackCount(): number {
    return this.tracks.size
  }
}

export const engine = new AudioEngine()
