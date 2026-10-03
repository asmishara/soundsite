import * as Tone from 'tone'
import { AudioGraph } from '../audio/graph'
import { isAudible, secondsPerStep, songDurationSeconds, songEvents, swingOffsetSteps } from '../model/arrangement'
import type { Song } from '../model/types'

const SAMPLE_RATE = 44_100
/** A moment of silence before the first note, so nothing is scheduled at exactly time zero. */
const LEAD_IN = 0.05

export type RenderedAudio = { channels: Float32Array[]; sampleRate: number; duration: number }

/**
 * Renders the whole arrangement offline (faster than real time) through the same AudioGraph used
 * for live playback, so the export sounds like what you hear. Mute and solo are respected, and the
 * render runs on past the last note to let the reverb and delay ring out.
 */
export async function renderSong(song: Song): Promise<RenderedAudio> {
  const tail = Math.min(10, song.fx.reverbDecay + 1.5)
  const duration = LEAD_IN + songDurationSeconds(song) + tail
  const offline = new Tone.OfflineContext(2, duration, SAMPLE_RATE)
  const live = Tone.getContext()
  const stepSeconds = secondsPerStep(song.bpm)

  // Tone creates nodes in the global context, so swap the offline context in only while building and
  // scheduling. This part is synchronous, so live playback never sees the swap.
  let graph: AudioGraph
  Tone.setContext(offline)
  try {
    graph = new AudioGraph(song)
    const audible = new Set(song.tracks.filter((t) => isAudible(t, song.tracks)).map((t) => t.id))
    for (const event of songEvents(song)) {
      if (!audible.has(event.trackId)) continue
      const time = LEAD_IN + (event.step + swingOffsetSteps(event.step, song.swing)) * stepSeconds
      if (event.type === 'note') {
        graph.triggerNote(event.trackId, event.pitch, event.length * stepSeconds * 0.98, time, event.velocity)
      } else {
        graph.triggerDrum(event.trackId, event.voice, time, event.velocity)
      }
    }
  } finally {
    Tone.setContext(live)
  }

  try {
    await graph.ready
    // Everything is scheduled up front, so Tone's clock can run synchronously; the asynchronous
    // mode yields with timers, which background tabs throttle to a crawl.
    const buffer = await offline.render(false)
    return { channels: [buffer.getChannelData(0), buffer.getChannelData(1)], sampleRate: buffer.sampleRate, duration }
  } finally {
    graph.dispose()
  }
}
