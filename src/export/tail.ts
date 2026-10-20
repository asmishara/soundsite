import { delaySeconds, isAudible } from '../model/arrangement'
import type { Song } from '../model/types'

/** The longest tail an export renders past the last note. */
export const MAX_TAIL_SECONDS = 12

/**
 * How long to keep rendering after the song ends so the reverb and delay can die away: the reverb's
 * decay, or as long as the echoes take to fall 60 dB if any audible track sends to the delay.
 */
export function exportTailSeconds(song: Song): number {
  const reverb = song.fx.reverbDecay + 0.5
  let echoes = 0
  if (song.tracks.some((t) => isAudible(t, song.tracks) && t.mixer.delaySend > 0.001)) {
    const repeat = delaySeconds(song.fx.delayTime, song.bpm)
    const feedback = song.fx.delayFeedback
    // Each repeat is quieter by the feedback factor.
    const repeats = feedback > 0.001 ? Math.log(0.001) / Math.log(feedback) : 1
    echoes = repeat * (repeats + 1)
  }
  return Math.min(MAX_TAIL_SECONDS, Math.max(1, reverb, echoes))
}

/** Fades the last `seconds` of audio to silence in place, so a tail that's cut short doesn't click. */
export function fadeOut(channels: Float32Array[], sampleRate: number, seconds = 0.08): void {
  for (const data of channels) {
    const frames = Math.min(data.length, Math.round(seconds * sampleRate))
    const start = data.length - frames
    for (let i = 0; i < frames; i++) data[start + i] *= 1 - (i + 1) / frames
  }
}
