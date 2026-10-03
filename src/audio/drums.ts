import * as Tone from 'tone'
import type { DrumVoiceId } from '../model/types'

/** A fully synthesized drum kit; each voice is its own monophonic synth. */
export class DrumKit {
  readonly output = new Tone.Gain(1)
  private readonly nodes: Tone.ToneAudioNode[] = []
  private readonly triggers: Record<DrumVoiceId, (time: number, velocity: number) => void>
  private readonly openHat: Tone.NoiseSynth
  private openHatTime = -1

  constructor() {
    const add = <T extends Tone.ToneAudioNode>(node: T, ...chain: Tone.ToneAudioNode[]): T => {
      node.chain(...chain, this.output)
      this.nodes.push(node, ...chain)
      return node
    }

    const kick = add(
      new Tone.MembraneSynth({
        pitchDecay: 0.045,
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.1 },
        volume: 2,
      }),
    )

    const snareBody = add(
      new Tone.MembraneSynth({
        pitchDecay: 0.015,
        octaves: 1.5,
        envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
        volume: -8,
      }),
    )
    const snareNoise = add(
      new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.17, sustain: 0 }, volume: -6 }),
      new Tone.Filter({ type: 'highpass', frequency: 1400 }),
    )

    const clap = add(
      new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.16, sustain: 0 }, volume: -4 }),
      new Tone.Filter({ type: 'bandpass', frequency: 1300, Q: 1.2 }),
    )

    const closedHat = add(
      new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.045, sustain: 0 }, volume: -12 }),
      new Tone.Filter({ type: 'highpass', frequency: 7500 }),
    )
    this.openHat = add(
      new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.38, sustain: 0, release: 0.03 },
        volume: -14,
      }),
      new Tone.Filter({ type: 'highpass', frequency: 6500 }),
    )

    const tomSettings = {
      pitchDecay: 0.06,
      octaves: 2.2,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
      volume: -6,
    }
    const tomLow = add(new Tone.MembraneSynth(tomSettings))
    const tomHigh = add(new Tone.MembraneSynth(tomSettings))

    const rim = add(
      new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
        volume: -16,
      }),
      new Tone.Filter({ type: 'bandpass', frequency: 1800, Q: 2 }),
    )

    const crash = add(
      new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 1.6, sustain: 0 }, volume: -16 }),
      new Tone.Filter({ type: 'highpass', frequency: 4500 }),
    )

    this.triggers = {
      kick: (t, v) => kick.triggerAttackRelease(48, 0.4, t, v),
      snare: (t, v) => {
        snareBody.triggerAttackRelease(185, 0.1, t, v)
        snareNoise.triggerAttackRelease(0.15, t, v)
      },
      clap: (t, v) => {
        // Three quick bursts make the characteristic smeared clap attack.
        clap.triggerAttackRelease(0.01, t, v * 0.8)
        clap.triggerAttackRelease(0.01, t + 0.011, v * 0.8)
        clap.triggerAttackRelease(0.14, t + 0.022, v)
      },
      hatClosed: (t, v) => {
        // A closed hat chokes a ringing open hat, unless both land on the same step.
        if (t !== this.openHatTime) this.openHat.triggerRelease(t)
        closedHat.triggerAttackRelease(0.04, t, v)
      },
      hatOpen: (t, v) => {
        this.openHatTime = t
        this.openHat.triggerAttackRelease(0.35, t, v)
      },
      tomLow: (t, v) => tomLow.triggerAttackRelease(105, 0.3, t, v),
      tomHigh: (t, v) => tomHigh.triggerAttackRelease(165, 0.3, t, v),
      rim: (t, v) => rim.triggerAttackRelease(820, 0.03, t, v),
      crash: (t, v) => crash.triggerAttackRelease(1.5, t, v),
    }
  }

  trigger(voice: DrumVoiceId, time: number, velocity: number): void {
    this.triggers[voice](time, velocity)
  }

  dispose(): void {
    this.nodes.forEach((n) => n.dispose())
    this.output.dispose()
  }
}
