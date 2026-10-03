import * as Tone from 'tone'
import type { InstrumentPresetId } from '../model/types'

export type InstrumentVoice = {
  output: Tone.ToneAudioNode
  trigger: (pitch: number, duration: number, time: number, velocity: number) => void
  releaseAll: () => void
  dispose: () => void
}

/** Wraps a PolySynth and an optional effect chain behind a common interface. */
function voice<S extends Tone.PolySynth>(synth: S, chain: Tone.ToneAudioNode[] = []): InstrumentVoice {
  if (chain.length > 0) synth.chain(...chain)
  return {
    output: chain.length > 0 ? chain[chain.length - 1] : synth,
    trigger: (pitch, duration, time, velocity) =>
      synth.triggerAttackRelease(Tone.mtof(pitch as Tone.Unit.MidiNote), duration, time, velocity),
    releaseAll: () => synth.releaseAll(),
    dispose: () => {
      synth.dispose()
      chain.forEach((node) => node.dispose())
    },
  }
}

const builders: Record<InstrumentPresetId, () => InstrumentVoice> = {
  lead: () => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 18 },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.45, release: 0.25 },
    })
    synth.volume.value = -10
    return voice(synth, [new Tone.Filter({ type: 'lowpass', frequency: 3200, Q: 1 })])
  },

  bass: () => {
    const synth = new Tone.PolySynth(Tone.MonoSynth, {
      oscillator: { type: 'sawtooth' },
      filter: { type: 'lowpass', Q: 2, rolloff: -24 },
      envelope: { attack: 0.004, decay: 0.25, sustain: 0.55, release: 0.12 },
      filterEnvelope: { attack: 0.004, decay: 0.18, sustain: 0.35, release: 0.2, baseFrequency: 110, octaves: 3.2 },
    })
    synth.volume.value = -4
    return voice(synth)
  },

  pad: () => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 30 },
      envelope: { attack: 0.5, decay: 0.4, sustain: 0.8, release: 1.6 },
    })
    synth.volume.value = -12
    const chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 3.5, depth: 0.6, wet: 0.5 }).start()
    return voice(synth, [new Tone.Filter({ type: 'lowpass', frequency: 1500, Q: 0.5 }), chorus])
  },

  keys: () => {
    const synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 1,
      modulationIndex: 5,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 1.6, sustain: 0.2, release: 0.9 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.002, decay: 0.5, sustain: 0.1, release: 0.6 },
    })
    synth.volume.value = -3
    return voice(synth, [new Tone.Tremolo({ frequency: 4.5, depth: 0.25, spread: 120 }).start()])
  },

  pluck: () => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle8' },
      envelope: { attack: 0.002, decay: 0.28, sustain: 0, release: 0.25 },
    })
    synth.volume.value = -5
    return voice(synth, [new Tone.Filter({ type: 'lowpass', frequency: 4000 })])
  },

  bell: () => {
    const synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3.01,
      modulationIndex: 12,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1.6 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.002, decay: 0.9, sustain: 0, release: 0.5 },
    })
    synth.volume.value = -10
    return voice(synth)
  },
}

export function createInstrument(preset: InstrumentPresetId): InstrumentVoice {
  return builders[preset]()
}
