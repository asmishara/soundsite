import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptySong } from '../model/factory'
import { useSongStore } from './songStore'
import { useUiStore } from './uiStore'
import { noticeWithUndo } from './undoNotice'

const store = () => useSongStore.getState()

beforeEach(() => {
  store().loadSong(createEmptySong())
  useUiStore.getState().dismissNotice()
})

describe('undo notices', () => {
  it('undoes the action it announced', () => {
    store().setBpm(90)
    noticeWithUndo('Tempo changed')
    useUiStore.getState().notice!.action!.run()
    expect(store().song.bpm).toBe(120)
  })

  it('closes as soon as something else changes the song', () => {
    store().setBpm(90)
    noticeWithUndo('Tempo changed')
    store().setName('Something else')
    expect(useUiStore.getState().notice).toBeNull()
  })

  it("never undoes a later edit, even if its button is still reachable", () => {
    store().setBpm(90)
    noticeWithUndo('Tempo changed')
    const { action } = useUiStore.getState().notice!
    store().setName('Later edit')
    action!.run()
    expect(store().song.name).toBe('Later edit')
    expect(store().song.bpm).toBe(90)
  })
})
