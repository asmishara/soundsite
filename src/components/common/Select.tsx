import type { SelectHTMLAttributes } from 'react'
import { focusedByPointer } from '../../hooks/focusOrigin'

/**
 * A native select that hands focus back to the page after a choice made with the mouse, so editor
 * shortcuts (Space, Delete, arrows, undo) keep working. Keyboard users keep focus on it. (Closing it
 * without a change leaves it focused; the shortcut handler takes keys away from a clicked select.)
 */
export function Select({ onChange, className = 'control', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={className}
      onChange={(e) => {
        onChange?.(e)
        if (focusedByPointer(e.currentTarget)) e.currentTarget.blur()
      }}
    />
  )
}
