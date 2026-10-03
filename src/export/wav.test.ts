import { describe, expect, it } from 'vitest'
import { encodeWav } from './wav'

const ascii = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)))

describe('WAV encoding', () => {
  it('writes a valid 16-bit PCM header', () => {
    const left = new Float32Array([0, 0.5, -0.5, 1])
    const right = new Float32Array([0, -1, 1, 0])
    const view = new DataView(encodeWav([left, right], 44_100))
    expect(ascii(view, 0, 4)).toBe('RIFF')
    expect(ascii(view, 8, 4)).toBe('WAVE')
    expect(ascii(view, 12, 4)).toBe('fmt ')
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(2) // stereo
    expect(view.getUint32(24, true)).toBe(44_100)
    expect(view.getUint32(28, true)).toBe(44_100 * 4)
    expect(view.getUint16(32, true)).toBe(4)
    expect(view.getUint16(34, true)).toBe(16)
    expect(ascii(view, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(4 * 4)
    expect(view.getUint32(4, true)).toBe(36 + 16)
    expect(view.byteLength).toBe(44 + 16)
  })

  it('interleaves channels and clamps samples', () => {
    const view = new DataView(encodeWav([new Float32Array([0.5, 2]), new Float32Array([-1, -3])], 8000))
    const samples = Array.from({ length: 4 }, (_, i) => view.getInt16(44 + i * 2, true))
    expect(samples).toEqual([Math.floor(0.5 * 0x7fff), -0x8000, 0x7fff, -0x8000])
  })
})
