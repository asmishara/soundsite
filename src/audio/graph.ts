import * as Tone from 'tone'
import { delaySeconds, isAudible } from '../model/arrangement'
import type { DrumVoiceId, FxSettings, InstrumentPresetId, Mixer, Song, Track } from '../model/types'
import { DrumKit } from './drums'
import { createInstrument, type InstrumentVoice } from './instruments'

type TrackNodes = {
  preset: InstrumentPresetId | null
  instrument: InstrumentVoice | null
  kit: DrumKit | null
  /** Sits between the sound source and the fader so a replaced instrument can fade out on its own. */
  sourceGain: Tone.Gain
  /** Track volume; all the way down while the track is muted or another track is soloed. */
  fader: Tone.Volume
  panner: Tone.Panner
  reverbSend: Tone.Gain<'decibels'>
  delaySend: Tone.Gain<'decibels'>
  /** Last mixer object applied; immer keeps the reference stable when unchanged. */
  appliedMixer: Mixer | null
  /** Last fader level applied, in dB (-Infinity when silenced). */
  appliedLevel: number | null
}

const RAMP = 0.03
/** How long a removed track or replaced instrument takes to fade out before it's disposed. */
const FADE_OUT = 0.03

const toDb = (amount: number) => (amount <= 0.001 ? -Infinity : Tone.gainToDb(amount))

/** Transparent below 0.9 (about -1 dBFS), then bends smoothly so the output never passes 0.99. */
function softClip(x: number): number {
  const a = Math.abs(x)
  return a <= 0.9 ? x : Math.sign(x) * (0.9 + 0.09 * Math.tanh((a - 0.9) / 0.09))
}

/** The shaper's input range is ±1, so it sees the signal at half level to handle overs up to +6 dB. */
const CLIP_HEADROOM = 2

/**
 * The master bus: the song's master volume, makeup gain, a glue compressor, a hard-knee limiter and a
 * soft clipper, ending at the current context's speakers. Synth levels are conservative so tracks can
 * be stacked; the makeup gain brings the mix up to a comfortable level, and the clipper catches
 * whatever the limiter's attack lets through, so the output never clips.
 */
export function createMasterBus(masterVolume: number): { input: Tone.Volume; nodes: Tone.ToneAudioNode[] } {
  const input = new Tone.Volume(masterVolume)
  const makeup = new Tone.Volume(6)
  const compressor = new Tone.Compressor({ threshold: -14, ratio: 3, attack: 0.01, release: 0.2 })
  const limiter = new Tone.Compressor({ threshold: -2, knee: 0, ratio: 20, attack: 0.001, release: 0.06 })
  const preClip = new Tone.Gain(1 / CLIP_HEADROOM)
  const clipper = new Tone.WaveShaper((x) => softClip(x * CLIP_HEADROOM), 4096)
  clipper.oversample = '2x'
  input.chain(makeup, compressor, limiter, preClip, clipper, Tone.getDestination())
  return { input, nodes: [input, makeup, compressor, limiter, preClip, clipper] }
}

/**
 * Every Tone.js node for one song: instruments and channel strips per track, the reverb and delay
 * sends, and the master bus. Nodes are created in whichever audio context is current when the graph
 * is built, so the same graph plays live or renders offline for export.
 *
 * `sync()` reconciles the graph with a song snapshot; immer's structural sharing lets it skip
 * anything that didn't change.
 *
 * Channel strips are a plain Volume and Panner, with mute and solo applied by silencing the fader,
 * rather than Tone.Channel: Tone's solo registry keeps every context it has seen alive, which leaked
 * each offline export.
 */
export class AudioGraph {
  private readonly tracks = new Map<string, TrackNodes>()
  private readonly shared: Tone.ToneAudioNode[]
  private readonly master: Tone.Volume
  private readonly reverb: Tone.Reverb
  private readonly reverbReturn: Tone.Volume
  /** After the reverb, so its output can dip while the impulse response is swapped. */
  private readonly reverbOut: Tone.Gain
  private readonly delay: Tone.FeedbackDelay
  private readonly delayReturn: Tone.Volume
  private applied: Song | null = null
  private reverbTimer: ReturnType<typeof setTimeout> | undefined
  /** Fade-outs waiting to dispose their nodes; flushed straight away if the graph is disposed. */
  private readonly pendingDisposals = new Map<ReturnType<typeof setTimeout>, () => void>()
  private disposed = false

  constructor(song: Song) {
    const bus = createMasterBus(song.masterVolume)
    this.master = bus.input

    this.reverb = new Tone.Reverb({ decay: song.fx.reverbDecay, preDelay: 0.02, wet: 1 })
    this.reverbReturn = new Tone.Volume(toDb(song.fx.reverbWet))
    this.reverbOut = new Tone.Gain(1)
    this.reverbReturn.chain(this.reverb, this.reverbOut, this.master)

    this.delay = new Tone.FeedbackDelay({
      delayTime: delaySeconds(song.fx.delayTime, song.bpm),
      feedback: song.fx.delayFeedback,
      maxDelay: 2,
      wet: 1,
    })
    const delayTone = new Tone.Filter({ type: 'lowpass', frequency: 3500 })
    this.delayReturn = new Tone.Volume(-4)
    this.delayReturn.chain(this.delay, delayTone, this.master)

    this.shared = [
      ...bus.nodes,
      this.reverb,
      this.reverbReturn,
      this.reverbOut,
      this.delay,
      delayTone,
      this.delayReturn,
    ]
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
        // Solo on one track changes what every other track should play, so each is checked against all.
        this.syncTrack(track, isAudible(track, song.tracks))
      }
      for (const [id, nodes] of this.tracks) {
        if (!live.has(id)) {
          this.tracks.delete(id)
          this.fadeOutAndDispose(nodes.fader.volume, () => this.disposeTrack(nodes))
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
      this.reverbTimer = setTimeout(() => void this.swapReverbDecay(this.applied?.fx.reverbDecay ?? fx.reverbDecay), 200)
    }
    if (fx.reverbWet !== prev.fx.reverbWet) this.reverbReturn.volume.rampTo(toDb(fx.reverbWet), RAMP)
    if (fx.delayTime !== prev.fx.delayTime || song.bpm !== prev.bpm) {
      this.delay.delayTime.rampTo(delaySeconds(fx.delayTime, song.bpm), 0.05)
    }
    if (fx.delayFeedback !== prev.fx.delayFeedback) this.delay.feedback.rampTo(fx.delayFeedback, RAMP)
  }

  /**
   * Replacing the convolver's buffer under running audio clicks, so the reverb dips around the swap.
   * The ramps start at the audio clock's current time, not Tone's now() (which is a lookahead ahead),
   * because the swap itself happens on wall-clock timers.
   */
  private async swapReverbDecay(decay: number): Promise<void> {
    this.reverbOut.gain.rampTo(0, 0.04, this.context().currentTime)
    await new Promise((resolve) => setTimeout(resolve, 60))
    if (this.disposed) return
    this.reverb.decay = decay
    await this.reverb.ready
    // Tone sets the new buffer just after `ready` resolves.
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (!this.disposed) this.reverbOut.gain.rampTo(1, 0.12, this.context().currentTime)
  }

  private syncTrack(track: Track, audible: boolean): void {
    let nodes = this.tracks.get(track.id)
    if (!nodes) {
      const sourceGain = new Tone.Gain(1)
      const fader = new Tone.Volume(-Infinity)
      const panner = new Tone.Panner(0)
      const reverbSend = new Tone.Gain<'decibels'>({ units: 'decibels', gain: -Infinity })
      const delaySend = new Tone.Gain<'decibels'>({ units: 'decibels', gain: -Infinity })
      sourceGain.chain(fader, panner, this.master)
      panner.connect(reverbSend)
      panner.connect(delaySend)
      reverbSend.connect(this.reverbReturn)
      delaySend.connect(this.delayReturn)
      nodes = {
        preset: null,
        instrument: null,
        kit: null,
        sourceGain,
        fader,
        panner,
        reverbSend,
        delaySend,
        appliedMixer: null,
        appliedLevel: null,
      }
      this.tracks.set(track.id, nodes)
    }

    if (track.kind === 'instrument' && nodes.preset !== track.preset) {
      const old = nodes.instrument
      const oldGain = nodes.sourceGain
      if (old) {
        // Fade the old instrument out before disposing it, so notes still ringing don't click.
        nodes.sourceGain = new Tone.Gain(1).connect(nodes.fader)
        this.fadeOutAndDispose(oldGain.gain, () => {
          old.dispose()
          oldGain.dispose()
        })
      }
      nodes.instrument = createInstrument(track.preset)
      nodes.instrument.output.connect(nodes.sourceGain)
      nodes.preset = track.preset
    } else if (track.kind === 'drums' && !nodes.kit) {
      nodes.kit = new DrumKit()
      nodes.kit.output.connect(nodes.sourceGain)
    }

    const m = track.mixer
    const old = nodes.appliedMixer
    // First application sets values outright; later changes ramp briefly so they don't click.
    const set = (param: Tone.Param<'decibels'> | Tone.Param<'audioRange'>, value: number, first: boolean) => {
      if (first) param.value = value
      else param.rampTo(value, RAMP)
    }
    const level = audible ? m.volume : -Infinity
    if (level !== nodes.appliedLevel) {
      set(nodes.fader.volume, level, nodes.appliedLevel === null)
      nodes.appliedLevel = level
    }
    if (m === old) return
    if (m.pan !== old?.pan) set(nodes.panner.pan, m.pan, !old)
    if (m.reverbSend !== old?.reverbSend) set(nodes.reverbSend.gain, toDb(m.reverbSend), !old)
    if (m.delaySend !== old?.delaySend) set(nodes.delaySend.gain, toDb(m.delaySend), !old)
    nodes.appliedMixer = m
  }

  /**
   * Ramps a gain or volume to silence, then disposes the nodes once it has faded. The fade starts at
   * the audio clock's current time (not Tone's now(), a lookahead later), since the disposal runs on a
   * wall-clock timer and must not cut the sound before the fade has happened.
   */
  private fadeOutAndDispose(param: Tone.Param<'gain'> | Tone.Param<'decibels'>, dispose: () => void): void {
    if (this.context().isOffline) {
      dispose()
      return
    }
    param.rampTo(param.units === 'decibels' ? -Infinity : 0, FADE_OUT, this.context().currentTime)
    const timer = setTimeout(() => {
      this.pendingDisposals.delete(timer)
      dispose()
    }, (FADE_OUT + 0.03) * 1000)
    this.pendingDisposals.set(timer, dispose)
  }

  private context() {
    return this.master.context
  }

  private disposeTrack(nodes: TrackNodes): void {
    nodes.instrument?.dispose()
    nodes.kit?.dispose()
    nodes.sourceGain.dispose()
    nodes.fader.dispose()
    nodes.panner.dispose()
    nodes.reverbSend.dispose()
    nodes.delaySend.dispose()
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

  /** Read-only view of a track's channel strip, for debugging and verification. */
  debugChannel(trackId: string) {
    const nodes = this.tracks.get(trackId)
    if (!nodes) return null
    return {
      volume: nodes.fader.volume.value,
      pan: nodes.panner.pan.value,
      mute: nodes.appliedMixer?.mute ?? false,
      solo: nodes.appliedMixer?.solo ?? false,
      audible: nodes.appliedLevel !== -Infinity,
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
    this.disposed = true
    clearTimeout(this.reverbTimer)
    for (const [timer, dispose] of this.pendingDisposals) {
      clearTimeout(timer)
      dispose()
    }
    this.pendingDisposals.clear()
    for (const nodes of this.tracks.values()) this.disposeTrack(nodes)
    this.tracks.clear()
    this.shared.forEach((n) => n.dispose())
  }
}
