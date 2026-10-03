import * as Tone from 'tone'
import type { DelayTime, DrumVoiceId, FxSettings, InstrumentPresetId, Mixer, Song, Track } from '../model/types'
import { DrumKit } from './drums'
import { createInstrument, type InstrumentVoice } from './instruments'

type TrackNodes = {
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
const DELAY_BEATS: Record<DelayTime, number> = { '16n': 0.25, '8n': 0.5, '8n.': 0.75, '4n': 1 }

const toDb = (amount: number) => (amount <= 0.001 ? -Infinity : Tone.gainToDb(amount))

/** Transparent below 0.9 (about -1 dBFS), then bends smoothly so the output never passes 0.99. */
function softClip(x: number): number {
  const a = Math.abs(x)
  return a <= 0.9 ? x : Math.sign(x) * (0.9 + 0.09 * Math.tanh((a - 0.9) / 0.09))
}

/** The shaper's input range is ±1, so it sees the signal at half level to handle overs up to +6 dB. */
const CLIP_HEADROOM = 2

/** Delay times are musical, so they're resolved against the song's tempo. */
export function delaySeconds(delayTime: DelayTime, bpm: number): number {
  return (DELAY_BEATS[delayTime] * 60) / bpm
}

/**
 * Every Tone.js node for one song: instruments and channel strips per track, the reverb and delay
 * sends, and the master bus. Nodes are created in whichever audio context is current when the graph
 * is built, so the same graph plays live or renders offline for export.
 *
 * `sync()` reconciles the graph with a song snapshot; immer's structural sharing lets it skip
 * anything that didn't change.
 */
export class AudioGraph {
  private readonly tracks = new Map<string, TrackNodes>()
  private readonly shared: Tone.ToneAudioNode[]
  private readonly master: Tone.Volume
  private readonly reverb: Tone.Reverb
  private readonly reverbReturn: Tone.Volume
  private readonly delay: Tone.FeedbackDelay
  private readonly delayReturn: Tone.Volume
  private applied: Song | null = null
  private reverbTimer: ReturnType<typeof setTimeout> | undefined

  constructor(song: Song) {
    // Synth levels are conservative so tracks can be stacked; makeup gain brings the mix up to a
    // comfortable level. A glue compressor and a hard-knee limiter tame the peaks, and a soft clipper
    // catches whatever the limiter's attack lets through, so the output never clips.
    this.master = new Tone.Volume(song.masterVolume)
    const makeup = new Tone.Volume(6)
    const compressor = new Tone.Compressor({ threshold: -14, ratio: 3, attack: 0.01, release: 0.2 })
    const limiter = new Tone.Compressor({ threshold: -2, knee: 0, ratio: 20, attack: 0.001, release: 0.06 })
    const preClip = new Tone.Gain(1 / CLIP_HEADROOM)
    const clipper = new Tone.WaveShaper((x) => softClip(x * CLIP_HEADROOM), 4096)
    clipper.oversample = '2x'
    this.master.chain(makeup, compressor, limiter, preClip, clipper, Tone.getDestination())

    // Effect returns are plain volumes rather than Tone.Channels, so soloing a track doesn't mute them.
    this.reverb = new Tone.Reverb({ decay: song.fx.reverbDecay, preDelay: 0.02, wet: 1 })
    this.reverbReturn = new Tone.Volume(toDb(song.fx.reverbWet))
    this.reverbReturn.chain(this.reverb, this.master)

    this.delay = new Tone.FeedbackDelay({
      delayTime: delaySeconds(song.fx.delayTime, song.bpm),
      feedback: song.fx.delayFeedback,
      maxDelay: 2,
      wet: 1,
    })
    const delayTone = new Tone.Filter({ type: 'lowpass', frequency: 3500 })
    this.delayReturn = new Tone.Volume(-4)
    this.delayReturn.chain(this.delay, delayTone, this.master)

    this.shared = [this.master, makeup, compressor, limiter, preClip, clipper, this.reverb, this.reverbReturn, this.delay, delayTone, this.delayReturn]
    this.sync(song)
  }

  /** Resolves once the reverb's impulse response has been generated. */
  get ready(): Promise<void> {
    return this.reverb.ready
  }

  sync(song: Song): void {
    const prev = this.applied
    if (prev) {
      if (song.masterVolume !== prev.masterVolume) this.master.volume.rampTo(song.masterVolume, RAMP)
      if (song.fx !== prev.fx || song.bpm !== prev.bpm) this.syncFx(song, prev)
    }
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
    this.applied = song
  }

  private syncFx(song: Song, prev: Song): void {
    const fx: FxSettings = song.fx
    if (fx.reverbDecay !== prev.fx.reverbDecay) {
      // Regenerating the impulse response is expensive, so wait until a knob drag settles.
      clearTimeout(this.reverbTimer)
      this.reverbTimer = setTimeout(() => {
        this.reverb.decay = this.applied?.fx.reverbDecay ?? fx.reverbDecay
      }, 200)
    }
    if (fx.reverbWet !== prev.fx.reverbWet) this.reverbReturn.volume.rampTo(toDb(fx.reverbWet), RAMP)
    if (fx.delayTime !== prev.fx.delayTime || song.bpm !== prev.bpm) {
      this.delay.delayTime.rampTo(delaySeconds(fx.delayTime, song.bpm), 0.05)
    }
    if (fx.delayFeedback !== prev.fx.delayFeedback) this.delay.feedback.rampTo(fx.delayFeedback, RAMP)
  }

  private syncTrack(track: Track): void {
    let nodes = this.tracks.get(track.id)
    if (!nodes) {
      const channel = new Tone.Channel().connect(this.master)
      const reverbSend = new Tone.Gain<'decibels'>({ units: 'decibels', gain: -Infinity })
      const delaySend = new Tone.Gain<'decibels'>({ units: 'decibels', gain: -Infinity })
      channel.connect(reverbSend)
      channel.connect(delaySend)
      reverbSend.connect(this.reverbReturn)
      delaySend.connect(this.delayReturn)
      nodes = { preset: null, instrument: null, kit: null, channel, reverbSend, delaySend, appliedMixer: null }
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
    const old = nodes.appliedMixer
    if (m === old) return
    // First application sets values outright; later changes ramp briefly so they don't click.
    const set = (param: Tone.Param<'decibels'> | Tone.Param<'audioRange'>, value: number) => {
      if (old) param.rampTo(value, RAMP)
      else param.value = value
    }
    if (m.volume !== old?.volume) set(nodes.channel.volume, m.volume)
    if (m.pan !== old?.pan) set(nodes.channel.pan, m.pan)
    if (m.mute !== old?.mute) nodes.channel.mute = m.mute
    if (m.solo !== old?.solo) nodes.channel.solo = m.solo
    if (m.reverbSend !== old?.reverbSend) set(nodes.reverbSend.gain, toDb(m.reverbSend))
    if (m.delaySend !== old?.delaySend) set(nodes.delaySend.gain, toDb(m.delaySend))
    nodes.appliedMixer = m
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
      muted: nodes.channel.muted,
      reverbSend: nodes.reverbSend.gain.value,
      delaySend: nodes.delaySend.gain.value,
      preset: nodes.preset,
    }
  }

  /** Read-only view of the effect returns, for debugging and verification. */
  debugReturns() {
    return { reverb: this.reverbReturn.volume.value, delay: this.delayReturn.volume.value, delayTime: this.delay.delayTime.value }
  }

  get trackCount(): number {
    return this.tracks.size
  }

  dispose(): void {
    clearTimeout(this.reverbTimer)
    for (const nodes of this.tracks.values()) this.disposeTrack(nodes)
    this.tracks.clear()
    this.shared.forEach((n) => n.dispose())
  }
}
