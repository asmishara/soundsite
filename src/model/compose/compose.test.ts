import { describe, expect, it } from 'vitest'
import { createNote } from '../factory'
import type { Key } from '../types'
import { arpCycle, arpLine, arpeggiate } from './arpeggiate'
import { DRUM_STYLES, buildDrumPattern } from './drumPatterns'
import { PROGRESSIONS, bassPitch, keyMode, progressionChords, voiceLead, writeProgression } from './progressions'

const C_MAJOR: Key = { root: 0, scale: 'major' }
const A_MINOR: Key = { root: 9, scale: 'minor' }
const byId = (id: string) => PROGRESSIONS.find((p) => p.id === id)!

describe('progressions', () => {
  it('realises numerals on the song tonic', () => {
    expect(progressionChords(byId('pop'), 0).map((c) => c.name)).toEqual(['C', 'G', 'Am', 'F'])
    expect(progressionChords(byId('pop'), 7).map((c) => c.name)).toEqual(['G', 'D', 'Em', 'C'])
    expect(progressionChords(byId('epic'), 9).map((c) => c.name)).toEqual(['Am', 'F', 'C', 'G'])
    expect(progressionChords(byId('andalusian'), 9).map((c) => c.name)).toEqual(['Am', 'G', 'F', 'E'])
    expect(progressionChords(byId('jazz'), 0).map((c) => c.name)).toEqual(['Dm7', 'G7', 'Cmaj7', 'Cmaj7'])
    expect(progressionChords(byId('blues'), 0).map((c) => c.name)).toEqual(
      ['C7', 'C7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7'],
    )
  })

  it('reports numerals for display', () => {
    expect(progressionChords(byId('pop'), 0).map((c) => c.roman)).toEqual(['I', 'V', 'vi', 'IV'])
    expect(progressionChords(byId('epic'), 0).map((c) => c.roman)).toEqual(['i', 'VI', 'III', 'VII'])
  })

  it('suggests a mode from the key', () => {
    expect(keyMode(C_MAJOR)).toBe('major')
    expect(keyMode(A_MINOR)).toBe('minor')
    expect(keyMode({ root: 2, scale: 'dorian' })).toBe('minor')
  })

  it('voice-leads with small movements near the center', () => {
    const chords = progressionChords(byId('pop'), 0).map((c) => c.pitches)
    const voiced = voiceLead(chords, 60)
    expect(voiced[0]).toEqual([60, 64, 67]) // C in root position at middle C
    for (let i = 1; i < voiced.length; i++) {
      const moved = voiced[i].reduce((sum, n) => sum + Math.min(...voiced[i - 1].map((p) => Math.abs(p - n))), 0)
      expect(moved).toBeLessThanOrEqual(5)
    }
    // Every chord keeps its notes (pitch classes) and stays near the center.
    voiced.forEach((v, i) => {
      expect(new Set(v.map((p) => p % 12))).toEqual(new Set(chords[i].map((p) => p % 12)))
      expect(Math.abs(v.reduce((a, b) => a + b, 0) / v.length - 60)).toBeLessThan(8)
    })
  })

  it('fills a section, repeating the progression', () => {
    const { chords, bass } = writeProgression(byId('pop'), C_MAJOR, {
      steps: 128,
      chordSteps: 16,
      rhythm: 'held',
      center: 60,
      bass: 'roots',
    })
    expect(chords).toHaveLength(8 * 3) // 8 bars, a triad per bar
    expect(chords.filter((n) => n.start === 64).map((n) => n.pitch % 12).sort((a, b) => a - b)).toEqual([0, 4, 7])
    expect(bass.map((n) => n.pitch)).toEqual([36, 31, 33, 29, 36, 31, 33, 29]) // C2 G1 A1 F1
    expect(bass.every((n) => n.length === 16)).toBe(true)
  })

  it('cuts the last chord short when the section ends mid-chord', () => {
    const { chords } = writeProgression(byId('pop'), C_MAJOR, { steps: 40, chordSteps: 16, rhythm: 'held', center: 60, bass: 'none' })
    const last = chords.filter((n) => n.start === 32)
    expect(last.every((n) => n.length === 8)).toBe(true)
  })

  it('writes the chosen rhythm', () => {
    const settings = { steps: 16, chordSteps: 16, center: 60, bass: 'none' as const }
    const starts = (rhythm: Parameters<typeof writeProgression>[2]['rhythm']) =>
      [...new Set(writeProgression(byId('pop'), C_MAJOR, { ...settings, rhythm }).chords.map((n) => n.start))]
    expect(starts('held')).toEqual([0])
    expect(starts('half')).toEqual([0, 8])
    expect(starts('quarter')).toEqual([0, 4, 8, 12])
    expect(starts('offbeat')).toEqual([2, 6, 10, 14])
    expect(starts('arp8')).toEqual([0, 2, 4, 6, 8, 10, 12, 14])
    expect(starts('arp16')).toHaveLength(16)
  })

  it('writes eighth-note and octave bass lines', () => {
    const base = { steps: 16, chordSteps: 16, rhythm: 'held' as const, center: 60 }
    const eighths = writeProgression(byId('pop'), C_MAJOR, { ...base, bass: 'eighths' }).bass
    expect(eighths.map((n) => n.start)).toEqual([0, 2, 4, 6, 8, 10, 12, 14])
    const octaves = writeProgression(byId('pop'), C_MAJOR, { ...base, bass: 'octaves' }).bass
    expect(octaves.slice(0, 2).map((n) => n.pitch)).toEqual([36, 48])
  })

  it('keeps bass roots in a low register', () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(bassPitch(pc)).toBeGreaterThanOrEqual(28)
      expect(bassPitch(pc)).toBeLessThanOrEqual(39)
      expect(bassPitch(pc) % 12).toBe(pc)
    }
  })
})

describe('arpeggiator', () => {
  it('builds cycles for each pattern', () => {
    const triad = [64, 60, 67]
    expect(arpCycle(triad, { pattern: 'up', octaves: 1 })).toEqual([60, 64, 67])
    expect(arpCycle(triad, { pattern: 'down', octaves: 1 })).toEqual([67, 64, 60])
    expect(arpCycle(triad, { pattern: 'upDown', octaves: 1 })).toEqual([60, 64, 67, 64])
    expect(arpCycle(triad, { pattern: 'up', octaves: 2 })).toEqual([60, 64, 67, 72, 76, 79])
  })

  it('spreads a chord over its length at the chosen rate', () => {
    const line = arpLine([60, 64, 67], 4, 8, 0.8, { pattern: 'up', rate: 2, octaves: 1 })
    expect(line.map((n) => [n.pitch, n.start, n.length])).toEqual([
      [60, 4, 2],
      [64, 6, 2],
      [67, 8, 2],
      [60, 10, 2],
    ])
  })

  it('never repeats a note back to back in random mode', () => {
    let seed = 1
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const line = arpLine([60, 64, 67], 0, 32, 0.8, { pattern: 'random', rate: 1, octaves: 1 }, random)
    for (let i = 1; i < line.length; i++) expect(line[i].pitch).not.toBe(line[i - 1].pitch)
  })

  it('replaces each chord in a selection with its arpeggio', () => {
    const notes = [
      createNote(60, 0, 8, 0.9),
      createNote(64, 0, 8, 0.6),
      createNote(67, 0, 4, 0.6),
      createNote(65, 8, 4, 0.7),
      createNote(69, 8, 4, 0.7),
    ]
    const { remove, add } = arpeggiate(notes, { pattern: 'up', rate: 2, octaves: 1 })
    expect(remove).toHaveLength(5)
    expect(add.map((n) => [n.pitch, n.start])).toEqual([
      [60, 0], [64, 2], [67, 4], [60, 6], // first chord lasts 8 steps (its longest note)
      [65, 8], [69, 10],
    ])
    expect(add[0].velocity).toBe(0.9)
  })
})

describe('drum patterns', () => {
  const house = DRUM_STYLES.find((s) => s.id === 'house')!

  it('has a full bar for every row of every style', () => {
    for (const style of DRUM_STYLES) for (const row of Object.values(style.rows)) expect(row).toHaveLength(16)
  })

  it('repeats a style across the bars', () => {
    const pattern = buildDrumPattern(house, 2, { crash: false, fill: false })
    expect(pattern.kick).toHaveLength(32)
    expect(pattern.kick.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0)).toEqual([0, 4, 8, 12, 16, 20, 24, 28])
    expect(pattern.kick[0]).toBe(1)
    expect(pattern.kick[4]).toBe(0.75)
    expect(pattern.crash.every((v) => v === 0)).toBe(true)
  })

  it('adds a crash and a fill', () => {
    const pattern = buildDrumPattern(house, 2, { crash: true, fill: true })
    expect(pattern.crash[0]).toBe(0.8)
    // The last half bar keeps its kick but swaps hats and claps for toms and snare.
    expect(pattern.kick[24]).toBe(1)
    expect(pattern.hatOpen.slice(24)).toEqual(new Array(8).fill(0))
    expect(pattern.tomHigh[24]).toBeGreaterThan(0)
    expect(pattern.snare[31]).toBe(1)
    // The first bar is untouched.
    expect(pattern.hatOpen[10]).toBeGreaterThan(0)
  })
})
