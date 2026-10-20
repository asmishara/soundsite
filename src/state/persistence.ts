import { create } from 'zustand'
import { SongFileError, parseSong, serializeSong } from '../model/serialize'
import type { Song } from '../model/types'
import { useSongStore } from './songStore'

const STORAGE_KEY = 'soundsite:autosave'
/** Saves that couldn't be read are kept under this prefix (newest few only) so they can be downloaded. */
const BACKUP_PREFIX = 'soundsite:autosave-unreadable'
const MAX_BACKUPS = 3
/** Set while autosave is failing, so the next visit knows the restored song may be out of date. */
const STALE_KEY = 'soundsite:autosave-stale'
const SAVE_DELAY_MS = 400

/** 'conflict': another tab saved, so this tab stopped saving until the user chooses. */
export type SaveStatus = 'saved' | 'pending' | 'error' | 'conflict'

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

function keys(store: Storage): string[] {
  return Array.from({ length: store.length }, (_, i) => store.key(i)).filter((k): k is string => k !== null)
}

/** Backup keys, newest first. */
function backupKeys(store: Storage): string[] {
  return keys(store)
    .filter((k) => k.startsWith(BACKUP_PREFIX))
    .sort()
    .reverse()
}

/**
 * Keeps a save that couldn't be read, without overwriting earlier ones: an unreadable save from a
 * newer version of the app shouldn't be lost because an older one failed to read it next time.
 * Returns false if there's no room for it.
 */
function keepBackup(store: Storage, saved: string): boolean {
  const removed: [string, string][] = []
  try {
    const existing = backupKeys(store)
    if (existing.some((k) => store.getItem(k) === saved)) return true
    // Make room first: the oldest backups go before the new one is written.
    for (const old of existing.slice(MAX_BACKUPS - 1)) {
      const value = store.getItem(old)
      if (value !== null) removed.push([old, value])
      store.removeItem(old)
    }
    store.setItem(`${BACKUP_PREFIX}:${new Date().toISOString()}`, saved)
    return true
  } catch {
    // Still no room: put back what was removed, so a failed attempt loses nothing.
    for (const [key, value] of removed) {
      try {
        store.setItem(key, value)
      } catch {
        // It fitted before, so this shouldn't fail; there's nothing more to do if it does.
      }
    }
    return false
  }
}

export type RestoreResult =
  | { kind: 'none' }
  | { kind: 'restored'; stale: boolean }
  /** `text` is the save as it was, for downloading; `kept` says whether a copy is still in storage. */
  | { kind: 'unreadable'; reason: string; text: string; kept: boolean }

/**
 * Loads the autosaved song into the store. A save that can't be read is kept aside (not deleted),
 * and a save restored after autosave had been failing is flagged as possibly out of date.
 */
export function restoreAutosave(): RestoreResult {
  const store = storage()
  let saved: string | null = null
  let stale = false
  try {
    saved = store?.getItem(STORAGE_KEY) ?? null
    stale = !!store?.getItem(STALE_KEY)
  } catch {
    return { kind: 'none' }
  }
  if (!saved || !store) return { kind: 'none' }
  try {
    const song = parseSong(saved)
    useSongStore.getState().loadSong(song)
    useSaveStatus.setState({ status: 'saved', savedAt: Date.now() })
    return { kind: 'restored', stale }
  } catch (err) {
    if (!(err instanceof SongFileError)) console.error(err)
    const reason = err instanceof SongFileError ? err.message : "It couldn't be read."
    return { kind: 'unreadable', reason, text: saved, kept: keepBackup(store, saved) }
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
let pending: Song | null = null
/** True after another tab saved: this tab stops writing so it can't silently overwrite that work. */
let paused = false

function write(song: Song): void {
  const store = storage()
  try {
    if (!store) throw new Error('Storage unavailable')
    store.setItem(STORAGE_KEY, serializeSong(song))
    store.removeItem(STALE_KEY)
    useSaveStatus.setState({ status: 'saved', savedAt: Date.now() })
  } catch (err) {
    console.warn('Autosave failed', err)
    try {
      // A tiny marker usually still fits when the song doesn't; it tells the next visit the save is old.
      if (store && !store.getItem(STALE_KEY)) store.setItem(STALE_KEY, new Date().toISOString())
    } catch {
      // Nothing more we can do.
    }
    useSaveStatus.setState({ status: 'error' })
  }
}

function flush(): void {
  clearTimeout(timer)
  if (pending && !paused) write(pending)
  if (!paused) pending = null
}

/** After a conflict with another tab: save this tab's song now, replacing the other tab's save. */
export function keepThisTabsVersion(): void {
  paused = false
  write(useSongStore.getState().song)
  pending = null
}

/**
 * Saves the song to browser storage shortly after every change, and when the page is hidden or
 * closed. If another tab saves, this tab pauses and calls `onConflict` instead of overwriting it.
 */
export function startAutosave(onConflict: () => void): () => void {
  paused = false
  pending = null
  const unsubscribe = useSongStore.subscribe((state, prev) => {
    if (state.song === prev.song) return
    pending = state.song
    if (paused) return
    useSaveStatus.setState({ status: 'pending' })
    clearTimeout(timer)
    timer = setTimeout(flush, SAVE_DELAY_MS)
  })
  const onHide = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  // Fires only in the other tabs when one tab writes the key.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || e.newValue === null || paused) return
    paused = true
    clearTimeout(timer)
    useSaveStatus.setState({ status: 'conflict' })
    onConflict()
  }
  window.addEventListener('pagehide', flush)
  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', onHide)
  return () => {
    flush()
    unsubscribe()
    window.removeEventListener('pagehide', flush)
    window.removeEventListener('storage', onStorage)
    document.removeEventListener('visibilitychange', onHide)
  }
}
