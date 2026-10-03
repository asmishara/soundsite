import { useEffect } from 'react'
import { useUiStore } from '../state/uiStore'
import { AlertIcon, CloseIcon } from './common/icons'
import styles from './Notice.module.css'

const DISMISS_AFTER_MS = 6000

/** Toast for save/open feedback. Errors stay until dismissed. */
export function Notice() {
  const notice = useUiStore((s) => s.notice)
  const dismiss = useUiStore((s) => s.dismissNotice)

  useEffect(() => {
    if (!notice || notice.tone === 'error') return
    const timer = setTimeout(dismiss, DISMISS_AFTER_MS)
    return () => clearTimeout(timer)
  }, [notice, dismiss])

  if (!notice) return null
  return (
    <div
      key={notice.id}
      className={`${styles.notice} ${notice.tone === 'error' ? styles.error : ''}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      {notice.tone === 'error' && <AlertIcon size={15} />}
      <span className={styles.message}>{notice.message}</span>
      {notice.action && (
        <button
          className={styles.action}
          onClick={() => {
            notice.action!.run()
            dismiss()
          }}
        >
          {notice.action.label}
        </button>
      )}
      <button className={styles.close} onClick={dismiss} aria-label="Dismiss">
        <CloseIcon size={13} />
      </button>
    </div>
  )
}
