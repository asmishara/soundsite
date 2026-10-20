import { beforeEach, describe, expect, it } from 'vitest'
import { noteScheduler, type NoteClock, type NoteTarget } from './noteScheduler'

/**
 * A fake synth that behaves like Tone's PolySynth where it matters: a release goes to the oldest
 * sounding voice of that pitch not yet released, and releaseAll fades voices out without marking
 * them released (they stay listed until they fall silent, which here they never do).
 */
function fakeSynth() {
  const log: string[] = []
  const _activeVoices: { id: number; frequency: number; released: boolean }[] = []
  let nextId = 1
  const target: NoteTarget & { _activeVoices: typeof _activeVoices } = {
    _activeVoices,
    triggerAttack: (frequency, time) => {
      _activeVoices.push({ id: nextId, frequency, released: false })
      log.push(`on ${frequency} #${nextId++} @${time}`)
    },
    triggerRelease: (frequency, time) => {
      const voice = _activeVoices.find((v) => v.frequency === frequency && !v.released)
      if (voice) {
        voice.released = true
        log.push(`off ${frequency} #${voice.id} @${time}`)
      }
    },
    releaseAll: () => {
      log.push('releaseAll')
    },
  }
  return { target, log }
}

/** A clock that advances by hand and runs timers when their time comes. */
function fakeClock() {
  let now = 0
  let timers: { at: number; fn: () => void }[] = []
  const clock: NoteClock = {
    now: () => now,
    setTimeout: (fn, seconds) => timers.push({ at: now + seconds, fn }),
  }
  const advance = (to: number) => {
    now = to
    const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)
    timers = timers.filter((t) => t.at > now)
    due.forEach((t) => t.fn())
  }
  return { clock, advance, pending: () => timers.length }
}

let synth: ReturnType<typeof fakeSynth>
let time: ReturnType<typeof fakeClock>

beforeEach(() => {
  synth = fakeSynth()
  time = fakeClock()
})

describe('note scheduler', () => {
  it('plays and releases a note at the right times', () => {
    const notes = noteScheduler(synth.target, time.clock, () => false)
    notes.trigger(440, 1, 0.5, 0.8)
    expect(synth.log).toEqual([])
    time.advance(0.5)
    time.advance(1.5)
    expect(synth.log).toEqual(['on 440 #1 @0.5', 'off 440 #1 @1.5'])
  })

  it('starts notes that are already due straight away', () => {
    const notes = noteScheduler(synth.target, time.clock, () => false)
    time.advance(2)
    notes.trigger(440, 1, 1.9, 0.8)
    expect(synth.log).toEqual(['on 440 #1 @1.9'])
  })

  it("drops a stale note-off after releaseAll, so it can't cut a new note of the same pitch", () => {
    const notes = noteScheduler(synth.target, time.clock, () => false)
    notes.trigger(440, 4, 0, 0.8) // long note, release queued for t=4
    time.advance(1)
    notes.releaseAll() // stop or jump
    notes.trigger(440, 4, 2, 0.8) // the same pitch starts again at t=2
    time.advance(2)
    time.advance(4) // the old note-off would fire here
    expect(synth.log).not.toContain('off 440 #2 @4')
    time.advance(6)
    expect(synth.log).toContain('off 440 #2 @6')
  })

  it('sends the note-off of a note played again after a stop to the new voice', () => {
    const notes = noteScheduler(synth.target, time.clock, () => false)
    notes.trigger(440, 4, 0, 0.8)
    time.advance(1)
    notes.releaseAll() // the old voice is still fading out
    notes.trigger(440, 1, 1, 0.8)
    time.advance(2)
    expect(synth.log).toContain('off 440 #2 @2')
  })

  it('cancels notes queued to start after a stop', () => {
    const notes = noteScheduler(synth.target, time.clock, () => false)
    notes.trigger(440, 1, 0.1, 0.8)
    notes.releaseAll()
    time.advance(5)
    expect(synth.log).toEqual(['releaseAll'])
  })

  it('does nothing once the synth is disposed', () => {
    let disposed = false
    const notes = noteScheduler(synth.target, time.clock, () => disposed)
    notes.trigger(440, 1, 0.5, 0.8)
    disposed = true
    time.advance(2)
    expect(synth.log).toEqual([])
  })
})
