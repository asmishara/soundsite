function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

/** Encodes audio channels (samples in -1…1) as a 16-bit PCM WAV file. */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const channelCount = channels.length
  const frames = channels[0]?.length ?? 0
  const blockAlign = channelCount * 2
  const dataSize = frames * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  const samples = new Int16Array(buffer, 44, frames * channelCount)
  for (let i = 0, o = 0; i < frames; i++) {
    for (let c = 0; c < channelCount; c++, o++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]))
      samples[o] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
  }
  return buffer
}
