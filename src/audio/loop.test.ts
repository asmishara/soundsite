import { describe, expect, it } from 'vitest'
import { loopBounds, startWithin, wrapPosition } from './loop'

describe('loop bounds', () => {
  it('clamps to the span and drops empty loops', () => {
    expect(loopBounds({ start: 16, end: 48 }, 64)).toEqual({ start: 16, end: 48 })
    expect(loopBounds({ start: 16, end: 96 }, 64)).toEqual({ start: 16, end: 64 })
    expect(loopBounds({ start: 80, end: 96 }, 64)).toBeNull()
    expect(loopBounds(null, 64)).toBeNull()
  })
})

describe('wrapping', () => {
  const loop = { start: 16, end: 32 }

  it('plays straight through without a loop and wraps at the end', () => {
    expect(wrapPosition(5, 64, null)).toBe(5)
    expect(wrapPosition(64, 64, null)).toBe(0)
  })

  it('wraps to the loop start at the loop end', () => {
    expect(wrapPosition(31, 64, loop)).toBe(31)
    expect(wrapPosition(32, 64, loop)).toBe(16)
  })

  it('plays into the loop from before it', () => {
    expect(wrapPosition(4, 64, loop)).toBe(4)
  })

  it('plays on to the end from after the loop, then returns to it', () => {
    expect(wrapPosition(40, 64, loop)).toBe(40)
    expect(wrapPosition(64, 64, loop)).toBe(16)
  })
})

describe('start position', () => {
  it('keeps a marker inside the loop and moves one outside to the loop start', () => {
    expect(startWithin(20, { start: 16, end: 32 })).toBe(20)
    expect(startWithin(40, { start: 16, end: 32 })).toBe(16)
    expect(startWithin(40, null)).toBe(40)
  })
})
