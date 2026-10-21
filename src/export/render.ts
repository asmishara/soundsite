import * as Tone from 'tone'
import { AudioGraph, createMasterBus } from '../audio/graph'
import {
  isAudible,
  secondsPerStep,
  songDurationSeconds,
  songEvents,
  swingOffsetSteps,
  swungLengthSteps,
} from '../model/arrangement'
import type { Song } from '../model/types'
import { exportTailSeconds, fadeOut } from './tail'

const SAMPLE_RATE = 44_100
/**
 * Notes are scheduled this far into the render so nothing starts at exactly time zero; the lead-in
 * is trimmed off afterwards, so the file starts on the downbeat and lines up with the MIDI export.
 */
const LEAD_IN = 0.05

export type RenderedAudio = { channels: Float32Array[]; sampleRate: number; duration: number }

/**
 * The master bus delays everything a little (the compressors look ahead, and the clipper
 * oversamples), by an amount that depends on the browser. Render one click through an identical bus
 * and see when it comes out, so the export can be trimmed to start exactly on the downbeat.
 */
async function masterBusLatency(sampleRate: number): Promise<number> {
  const clickAt = 0.02
  const probe = new Tone.OfflineContext(1, 0.12, sampleRate)
  const live = Tone.getContext()
  let bus: ReturnType<typeof createMasterBus>
  let source: Tone.ToneBufferSource
  Tone.setContext(probe)
  try {
    bus = createMasterBus(0)
    const click = new Tone.ToneAudioBuffer().fromArray(Float32Array.from({ length: 64 }, (_, i) => (i === 0 ? 0.5 : 0)))
    source = new Tone.ToneBufferSource(click).connect(bus.input)
    source.start(clickAt)
  } finally {
    Tone.setContext(live)
  }
  try {
    const data = (await probe.render(false)).getChannelData(0)
    const first = data.findIndex((v) => Math.abs(v) > 0.01)
    return first < 0 ? 0 : Math.max(0, first / sampleRate - clickAt)
  } finally {
    source.dispose()
    bus.nodes.forEach((n) => n.dispose())
  }
}

/**
 * Renders the whole arrangement offline (faster than real time) through the same AudioGraph used
 * for live playback, so the export sounds like what you hear. Mute and solo are respected, and the
 * render runs on past the last note to let the reverb and delay ring out.
 */
export async function renderSong(song: Song): Promise<RenderedAudio> {
  const duration = LEAD_IN + songDurationSeconds(song) + exportTailSeconds(song)
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
        const length = swungLengthSteps(event.step, event.length, song.swing)
        graph.triggerNote(event.trackId, event.pitch, length * stepSeconds * 0.98, time, event.velocity)
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
    const latency = await masterBusLatency(buffer.sampleRate).catch(() => 0)
    const lead = Math.round((LEAD_IN + latency) * buffer.sampleRate)
    const channels = [buffer.getChannelData(0).subarray(lead), buffer.getChannelData(1).subarray(lead)]
    fadeOut(channels, buffer.sampleRate)
    return { channels, sampleRate: buffer.sampleRate, duration: channels[0].length / buffer.sampleRate }
  } finally {
    graph.dispose()
  }
}
