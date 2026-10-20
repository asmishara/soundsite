import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Tone from 'tone'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { engine } from './audio/engine'
import { restoreAutosave, startAutosave } from './state/persistence'
import { downloadText } from './state/songFiles'
import { usePlayheadStore } from './state/playheadStore'
import { useSongStore } from './state/songStore'
import { useUiStore } from './state/uiStore'
import './styles/global.css'

if (import.meta.env.DEV) {
  // Handles for debugging in the browser console.
  Object.assign(window, { Tone, engine, songStore: useSongStore, uiStore: useUiStore, playheadStore: usePlayheadStore })
}

// Pick up where the user left off, then keep saving as they work.
const restored = restoreAutosave()
if (restored.kind === 'unreadable') {
  const { reason, text, kept } = restored
  useUiStore.getState().showNotice(
    `Your last session couldn't be opened, so the demo song was loaded instead. ${reason} ` +
      (kept
        ? 'Your saved song has been kept in this browser.'
        : "There's no room to keep a copy in this browser, so download it now: autosave will replace it once you make a change."),
    'error',
    { label: 'Download it', run: () => downloadText(text, 'recovered-song.soundsite.json') },
  )
} else if (restored.kind === 'restored' && restored.stale) {
  useUiStore
    .getState()
    .showNotice("Your latest changes couldn't be saved in this browser (storage was full), so this is the last version that was saved.", 'error')
}
startAutosave(() =>
  useUiStore.getState().showNotice(
    'This song was also changed in another tab, so this tab stopped autosaving to avoid overwriting it.',
    'error',
    { label: 'Reload', run: () => location.reload() },
  ),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
