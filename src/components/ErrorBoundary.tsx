import { Component, type ErrorInfo, type ReactNode } from 'react'
import { serializeSong, songFileName } from '../model/serialize'
import { downloadText } from '../state/songFiles'
import { useSongStore } from '../state/songStore'
import styles from './ErrorBoundary.module.css'

type State = { error: Error | null }

/**
 * If the interface crashes, the song is still in memory: offer to download it before reloading,
 * instead of leaving a blank page.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Soundsite crashed', error, info.componentStack)
  }

  private download = () => {
    const song = useSongStore.getState().song
    downloadText(serializeSong(song), songFileName(song.name))
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className={styles.screen} role="alert">
        <div className={styles.card}>
          <h1 className={styles.title}>Something went wrong</h1>
          <p>Your song is still here. Download it to keep it safe, then reload the page.</p>
          <div className={styles.actions}>
            <button className={`btn ${styles.primary}`} onClick={this.download}>
              Download my song
            </button>
            <button className="btn" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
          <details className={styles.details}>
            <summary>Error details</summary>
            <code>{error.message}</code>
          </details>
        </div>
      </div>
    )
  }
}
