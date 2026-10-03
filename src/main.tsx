import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Tone from 'tone'
import App from './App'
import { engine } from './audio/engine'
import { restoreAutosave, startAutosave } from './state/persistence'
import { usePlayheadStore } from './state/playheadStore'
import { useSongStore } from './state/songStore'
import { useUiStore } from './state/uiStore'
import './styles/global.css'

if (import.meta.env.DEV) {
  // Handles for debugging in the browser console.
  Object.assign(window, { Tone, engine, songStore: useSongStore, uiStore: useUiStore, playheadStore: usePlayheadStore })
}

// Pick up where the user left off, then keep saving as they work.
if (restoreAutosave() === 'unreadable') {
  useUiStore.getState().showNotice("Your last session couldn't be restored, so the demo song was loaded instead.", 'error')
}
startAutosave()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
