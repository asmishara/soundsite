import { useRef } from 'react'
import { useSongStore } from '../state/songStore'

/**
 * Makes a pointer gesture on a control (slider, knob) one undo step. Every way a gesture can end
 * closes the transaction, so none is left open to swallow later edits. If undo closes it mid-drag,
 * `keepOpen()` reopens one so the rest of the drag is still a single step.
 */
export function useGestureTransaction() {
  const token = useRef<number | null>(null)

  const begin = () => {
    const store = useSongStore.getState()
    if (token.current === null || !store.isTransactionOpen(token.current)) token.current = store.beginTransaction()
  }

  const end = () => {
    if (token.current !== null) useSongStore.getState().endTransaction(token.current)
    token.current = null
  }

  /** Call before applying a value during the gesture. */
  const keepOpen = () => {
    if (token.current !== null && !useSongStore.getState().isTransactionOpen(token.current)) begin()
  }

  return {
    begin,
    end,
    keepOpen,
    /** Spread onto a native range input. */
    rangeHandlers: {
      onPointerDown: begin,
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
      onBlur: end,
    },
  }
}
