import { useSongStore } from './songStore'
import { useUiStore } from './uiStore'

/**
 * Shows a notice with an Undo button for the edit that just happened. The button only ever undoes
 * that edit: the notice closes as soon as anything else changes the song, and if the song has
 * moved on by the time Undo is clicked, nothing is undone.
 */
export function noticeWithUndo(message: string): void {
  const after = useSongStore.getState().song
  useUiStore.getState().showNotice(message, 'info', {
    label: 'Undo',
    run: () => {
      if (useSongStore.getState().song === after) useSongStore.getState().undo()
    },
  })
  const id = useUiStore.getState().notice?.id
  const unsubscribe = useSongStore.subscribe((state) => {
    if (state.song === after) return
    unsubscribe()
    const ui = useUiStore.getState()
    if (ui.notice?.id === id) ui.dismissNotice()
  })
}
