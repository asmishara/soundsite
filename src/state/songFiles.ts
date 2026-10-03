import { stop } from '../audio/scheduler'
import { createDemoSong } from '../model/demoSong'
import { createNewSong } from '../model/factory'
import { FILE_EXTENSION, SongFileError, parseSong, serializeSong, songFileName } from '../model/serialize'
import type { Song } from '../model/types'
import { usePlayheadStore } from './playheadStore'
import { useSongStore } from './songStore'
import { useUiStore } from './uiStore'

const MAX_FILE_BYTES = 5 * 1024 * 1024

/** Swaps in a song as one undoable step and offers Undo in a toast. */
function switchTo(song: Song, message: string): void {
  if (usePlayheadStore.getState().isPlaying) stop()
  useSongStore.getState().replaceSong(song)
  useUiStore.getState().selectTrack(song.tracks[0]?.id ?? null)
  useUiStore.getState().showNotice(message, 'info', { label: 'Undo', run: () => useSongStore.getState().undo() })
}

export function newSong(kind: 'blank' | 'demo'): void {
  const song = kind === 'demo' ? createDemoSong() : createNewSong()
  switchTo(song, kind === 'demo' ? 'Opened the demo song' : 'Started a new song')
}

/** Downloads the current song as a .soundsite.json file. */
export function saveSongToFile(): void {
  const song = useSongStore.getState().song
  const fileName = songFileName(song.name)
  const url = URL.createObjectURL(new Blob([serializeSong(song)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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
