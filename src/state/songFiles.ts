import { isPlaying, stop } from '../audio/scheduler'
import { createDemoSong } from '../model/demoSong'
import { createNewSong } from '../model/factory'
import { FILE_EXTENSION, SongFileError, parseSong, serializeSong, songFileName, songSlug } from '../model/serialize'
import type { Song } from '../model/types'
import { useSongStore } from './songStore'
import { useUiStore } from './uiStore'

const MAX_FILE_BYTES = 5 * 1024 * 1024

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Swaps in a song as one undoable step and offers Undo in a toast. */
function switchTo(song: Song, message: string): void {
  if (isPlaying()) stop()
  useSongStore.getState().replaceSong(song)
  const ui = useUiStore.getState()
  ui.selectTrack(song.tracks[0]?.id ?? null)
  const first = song.arrangement[0]
  if (first) ui.selectEntry(first.id, first.sectionId, 0)
  ui.showNotice(message, 'info', { label: 'Undo', run: () => useSongStore.getState().undo() })
}

export function newSong(kind: 'blank' | 'demo'): void {
  const song = kind === 'demo' ? createDemoSong() : createNewSong()
  switchTo(song, kind === 'demo' ? 'Opened the demo song' : 'Started a new song')
}

/** Downloads the current song as a .soundsite.json file. */
export function saveSongToFile(): void {
  const song = useSongStore.getState().song
  const fileName = songFileName(song.name)
  downloadBlob(new Blob([serializeSong(song)], { type: 'application/json' }), fileName)
  useUiStore.getState().showNotice(`Saved ${fileName}`)
}

export async function openSongFromFile(file: File): Promise<void> {
  const ui = useUiStore.getState()
  if (file.size > MAX_FILE_BYTES) {
    ui.showNotice(`${file.name} is too large to be a song file.`, 'error')
    return
  }
  try {
    const song = parseSong(await file.text())
    switchTo(song, `Opened “${song.name}”`)
  } catch (err) {
    const message = err instanceof SongFileError ? err.message : "This file couldn't be opened."
    if (!(err instanceof SongFileError)) console.error(err)
    ui.showNotice(`${file.name}: ${message}`, 'error')
  }
}

/** Shows the browser's file picker and opens the chosen song. */
export function pickSongFile(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = `${FILE_EXTENSION},.json,application/json`
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) void openSongFromFile(file)
  }
  input.click()
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Renders the whole song to a WAV file and downloads it. */
export async function exportAudio(): Promise<void> {
  const ui = useUiStore.getState()
  if (ui.exporting) return
  if (isPlaying()) stop()
  const song = useSongStore.getState().song
  ui.setExporting('wav')
  try {
    const [{ renderSong }, { encodeWav }] = await Promise.all([import('../export/render'), import('../export/wav')])
    const audio = await renderSong(song)
    const fileName = `${songSlug(song.name)}.wav`
    downloadBlob(new Blob([encodeWav(audio.channels, audio.sampleRate)], { type: 'audio/wav' }), fileName)
    useUiStore.getState().showNotice(`Exported ${fileName} (${formatDuration(audio.duration)})`)
  } catch (err) {
    console.error(err)
    useUiStore.getState().showNotice("The audio export didn't work. Please try again.", 'error')
  } finally {
    useUiStore.getState().setExporting(null)
  }
}

/** Downloads the whole song as a Standard MIDI File. */
export async function exportMidi(): Promise<void> {
  const ui = useUiStore.getState()
  if (ui.exporting) return
  const song = useSongStore.getState().song
  ui.setExporting('midi')
  try {
    const { songToMidi } = await import('../export/midi')
    const fileName = `${songSlug(song.name)}.mid`
    downloadBlob(new Blob([songToMidi(song) as Uint8Array<ArrayBuffer>], { type: 'audio/midi' }), fileName)
    useUiStore.getState().showNotice(`Exported ${fileName}`)
  } catch (err) {
    console.error(err)
    useUiStore.getState().showNotice("The MIDI export didn't work. Please try again.", 'error')
  } finally {
    useUiStore.getState().setExporting(null)
  }
}
