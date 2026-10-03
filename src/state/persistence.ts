import { create } from 'zustand'
import { SongFileError, parseSong, serializeSong } from '../model/serialize'
import type { Song } from '../model/types'
import { useSongStore } from './songStore'

const STORAGE_KEY = 'soundsite:autosave'
const BACKUP_KEY = 'soundsite:autosave-unreadable'
const SAVE_DELAY_MS = 400

export type SaveStatus = 'saved' | 'pending' | 'error'

/** Autosave status for the UI. */
export const useSaveStatus = create<{ status: SaveStatus; savedAt: number | null }>()(() => ({
  status: 'saved',
  savedAt: null,
}))

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Accessing localStorage throws when storage is blocked (e.g. some privacy settings).
    return null
  }
}

/**
 * Loads the autosaved song into the store. Returns 'none' if there was nothing saved, and
 * 'unreadable' if something was saved but couldn't be read (it is kept aside, not deleted).
 */
export function restoreAutosave(): 'restored' | 'none' | 'unreadable' {
  const store = storage()
  let saved: string | null = null
  try {
    saved = store?.getItem(STORAGE_KEY) ?? null
  } catch {
    return 'none'
  }
  if (!saved) return 'none'
  try {
    const song = parseSong(saved)
    useSongStore.getState().loadSong(song)
    useSaveStatus.setState({ status: 'saved', savedAt: Date.now() })
    return 'restored'
  } catch (err) {
    if (!(err instanceof SongFileError)) console.error(err)
    try {
      store?.setItem(BACKUP_KEY, saved)
    } catch {
      // Best effort only.
    }
    return 'unreadable'
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
let pending: Song | null = null

function write(song: Song): void {
  const store = storage()
  try {
    if (!store) throw new Error('Storage unavailable')
    store.setItem(STORAGE_KEY, serializeSong(song))
    useSaveStatus.setState({ status: 'saved', savedAt: Date.now() })
  } catch (err) {
    console.warn('Autosave failed', err)
    useSaveStatus.setState({ status: 'error' })
  }
}

function flush(): void {
  clearTimeout(timer)
  if (pending) write(pending)
  pending = null
}

/** Saves the song to browser storage shortly after every change, and when the page is hidden or closed. */
export function startAutosave(): () => void {
  const unsubscribe = useSongStore.subscribe((state, prev) => {
    if (state.song === prev.song) return
    pending = state.song
    useSaveStatus.setState({ status: 'pending' })
    clearTimeout(timer)
    timer = setTimeout(flush, SAVE_DELAY_MS)
  })
  const onHide = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onHide)
  return () => {
    flush()
    unsubscribe()
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onHide)
  }
}
