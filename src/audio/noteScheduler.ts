/** What the note scheduler drives: a polyphonic synth that plays and releases notes by pitch. */
export type NoteTarget = {
  triggerAttack: (frequency: number, time: number, velocity: number) => unknown
  triggerRelease: (frequency: number, time: number) => unknown
  releaseAll: () => unknown
}

/** Tone's PolySynth keeps its sounding voices in a private list; this is the part used here. */
type VoiceList = { _activeVoices?: { released: boolean }[] }

/** The audio context's clock: current time (including lookahead) and timers on that clock. */
export type NoteClock = {
  now: () => number
  setTimeout: (fn: () => void, seconds: number) => unknown
}

/**
 * Schedules note-ons and note-offs itself instead of using PolySynth.triggerAttackRelease. Tone
 * queues a future note-off as a timer and releases "the oldest sounding voice of that pitch" when it
 * fires; after stop or a jump, that is often a new note, which got cut short. Here every queued
 * attack and release belongs to a generation, and releaseAll() starts a new one, so queued events
 * from before a stop or jump are dropped.
 */
export function noteScheduler(target: NoteTarget, clock: NoteClock, isDisposed: () => boolean) {
  let generation = 0
  const at = (time: number, run: () => void) => {
    const wait = time - clock.now()
    if (wait <= 0) {
      run()
      return
    }
    const queuedIn = generation
    clock.setTimeout(() => {
      if (queuedIn === generation && !isDisposed()) run()
    }, wait)
  }
  return {
    trigger: (frequency: number, duration: number, time: number, velocity: number) => {
      at(time, () => target.triggerAttack(frequency, time, velocity))
      at(time + duration, () => target.triggerRelease(frequency, time + duration))
    },
    releaseAll: () => {
      generation++
      target.releaseAll()
      // PolySynth.releaseAll fades every voice out but leaves them listed as unreleased until they
      // fall silent, so the next note-off of a pitch that was sounding would go to the old, fading
      // voice and the new note would never stop. Mark them released so it finds the new one.
      ;(target as VoiceList)._activeVoices?.forEach((voice) => (voice.released = true))
    },
  }
}
