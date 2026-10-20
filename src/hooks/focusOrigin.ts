/**
 * Remembers whether the focused element was reached with the pointer or the keyboard. The browser's
 * own signal, :focus-visible, can't be used for this inside a key handler: Chromium turns it on as
 * soon as a key is pressed, so a clicked button looks keyboard-focused by the time Space arrives.
 */
let lastInputWasPointer = false
let focusFromPointer = false
let focused: EventTarget | null = null
/** The window lost focus; when it comes back the browser re-focuses the same element by itself. */
let windowLeft = false
/** Pointers currently pressed (a mouse button held, a finger down). */
const pressed = new Set<number>()

/** Starts tracking; returns a function that stops it. */
export function trackFocusOrigin(): () => void {
  const onPointerDown = (e: PointerEvent) => {
    pressed.add(e.pointerId)
    lastInputWasPointer = true
    windowLeft = false
    // Clicking a control that already had keyboard focus switches it to pointer use.
    focusFromPointer = true
  }
  const onKeyDown = (e: KeyboardEvent) => {
    windowLeft = false
    // Shortcuts like Alt+Tab (switching windows) aren't keyboard navigation within the page.
    if (!e.altKey && !e.ctrlKey && !e.metaKey) lastInputWasPointer = false
  }
  const onFocusIn = (e: FocusEvent) => {
    const refocused = windowLeft && e.target === focused
    windowLeft = false
    focused = e.target
    if (!refocused) focusFromPointer = lastInputWasPointer
  }
  const onPointerUp = (e: PointerEvent) => pressed.delete(e.pointerId)
  const onBlur = (e: FocusEvent) => {
    if (e.target !== window) return
    windowLeft = true
    // A button released while another window is in front never reports its pointerup here.
    pressed.clear()
  }
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('pointerup', onPointerUp, true)
  window.addEventListener('pointercancel', onPointerUp, true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('focusin', onFocusIn, true)
  window.addEventListener('blur', onBlur, true)
  return () => {
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('pointerup', onPointerUp, true)
    window.removeEventListener('pointercancel', onPointerUp, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('focusin', onFocusIn, true)
    window.removeEventListener('blur', onBlur, true)
  }
}

/** True while a mouse button is held or a finger is down, e.g. in the middle of dragging a slider. */
export function pointerIsDown(): boolean {
  return pressed.size > 0
}

/** True when `el` has focus because it was clicked or tapped, rather than reached with the keyboard. */
export function focusedByPointer(el: Element | null): boolean {
  return !!el && el === document.activeElement && focusFromPointer
}
