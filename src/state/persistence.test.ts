import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoSong } from '../model/demoSong'
import { createEmptySong } from '../model/factory'
import { serializeSong } from '../model/serialize'
import { keepThisTabsVersion, restoreAutosave, startAutosave, useSaveStatus } from './persistence'
import { useSongStore } from './songStore'

/** A Map-backed Storage, so these tests run without a browser. */
class MemoryStorage {
  private data = new Map<string, string>()
  failWrites = false
  get length() {
    return this.data.size
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  /** Keys whose writes fail as if storage were full. */
  failWritesTo: (k: string) => boolean = () => false
  setItem(k: string, v: string) {
    if ((this.failWrites && k === 'soundsite:autosave') || this.failWritesTo(k)) throw new Error('QuotaExceededError')
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
  keys() {
    return [...this.data.keys()]
  }
}

let storage: MemoryStorage
let stop: (() => void) | undefined
const win = new EventTarget()
const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })

beforeEach(() => {
  vi.useFakeTimers()
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', doc)
  useSongStore.getState().loadSong(createEmptySong())
  useSaveStatus.setState({ status: 'saved', savedAt: null })
})

afterEach(() => {
  stop?.()
  stop = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Another tab writing the autosave: the value changes and this tab gets a storage event. */
function otherTabSaves(value: string) {
  storage.setItem('soundsite:autosave', value)
  win.dispatchEvent(Object.assign(new Event('storage'), { key: 'soundsite:autosave', newValue: value }))
}

describe('autosave', () => {
  it('saves shortly after a change and restores it', () => {
    stop = startAutosave(() => {})
    useSongStore.getState().setName('Saved song')
    vi.advanceTimersByTime(500)
    useSongStore.getState().loadSong(createEmptySong())
    expect(restoreAutosave()).toEqual({ kind: 'restored', stale: false })
    expect(useSongStore.getState().song.name).toBe('Saved song')
  })

  it('stops saving when another tab saves, until this tab is chosen', () => {
    const onConflict = vi.fn()
    stop = startAutosave(onConflict)
    otherTabSaves(serializeSong({ ...createEmptySong(), name: 'Other tab' }))
    expect(onConflict).toHaveBeenCalledOnce()
    expect(useSaveStatus.getState().status).toBe('conflict')

    useSongStore.getState().setName('This tab')
    vi.advanceTimersByTime(1000)
    expect(storage.getItem('soundsite:autosave')).toContain('Other tab') // not overwritten

    keepThisTabsVersion()
    expect(storage.getItem('soundsite:autosave')).toContain('This tab')
    expect(useSaveStatus.getState().status).toBe('saved')
  })

  it('marks the save as out of date when writing fails, and says so on the next visit', () => {
    stop = startAutosave(() => {})
    useSongStore.getState().setName('First')
    vi.advanceTimersByTime(500)
    storage.failWrites = true
    useSongStore.getState().setName('Second')
    vi.advanceTimersByTime(500)
    expect(useSaveStatus.getState().status).toBe('error')
    expect(restoreAutosave()).toEqual({ kind: 'restored', stale: true })
    expect(useSongStore.getState().song.name).toBe('First')

    storage.failWrites = false
    useSongStore.getState().setName('Third')
    vi.advanceTimersByTime(500)
    expect(restoreAutosave()).toEqual({ kind: 'restored', stale: false })
  })

  const backups = () => storage.keys().filter((k) => k.startsWith('soundsite:autosave-unreadable'))

  it('keeps an unreadable save aside and lets it be downloaded', () => {
    const newer = JSON.stringify({ format: 'soundsite-song', version: 99, song: createDemoSong() })
    storage.setItem('soundsite:autosave', newer)
    const result = restoreAutosave()
    expect(result).toMatchObject({ kind: 'unreadable', text: newer, kept: true })
    if (result.kind !== 'unreadable') return
    expect(result.reason).toMatch(/newer version/)
    expect(backups().map((k) => storage.getItem(k))).toEqual([newer])
    // Reading the same save again doesn't pile up copies.
    restoreAutosave()
    expect(backups()).toHaveLength(1)
  })

  it("still offers an unreadable save for download when there's no room to keep a copy", () => {
    storage.setItem('soundsite:autosave', 'broken')
    storage.failWritesTo = (k) => k.startsWith('soundsite:autosave-unreadable')
    expect(restoreAutosave()).toMatchObject({ kind: 'unreadable', text: 'broken', kept: false })
  })

  it("doesn't lose an older backup when there's no room for the new one", () => {
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i))
      storage.setItem('soundsite:autosave', `broken ${i}`)
      restoreAutosave()
    }
    storage.setItem('soundsite:autosave', 'broken 3, too big')
    const now = new Date(2026, 0, 1, 0, 0, 3)
    vi.setSystemTime(now)
    // The new backup doesn't fit; putting back an old one does, since it fitted before.
    storage.failWritesTo = (k) => k === `soundsite:autosave-unreadable:${now.toISOString()}`
    expect(restoreAutosave()).toMatchObject({ kind: 'unreadable', kept: false })
    expect(backups().map((k) => storage.getItem(k)).sort()).toEqual(['broken 0', 'broken 1', 'broken 2'])
  })

  it('keeps only the newest few unreadable saves', () => {
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i))
      storage.setItem('soundsite:autosave', `broken ${i}`)
      restoreAutosave()
    }
    expect(backups()).toHaveLength(3)
    expect(backups().map((k) => storage.getItem(k)).sort()).toEqual(['broken 2', 'broken 3', 'broken 4'])
  })
})
