import { useEffect, useRef, type RefObject } from 'react'
import { usePlayheadStore } from '../state/playheadStore'

/**
 * Pages a horizontally scrolling editor along with playback: when the playhead leaves the
 * visible area it jumps so the playhead sits at the left edge again.
 * `gutter` is the width of any sticky column on the left (e.g. the piano keys).
 */
export function useFollowPlayhead(scrollerRef: RefObject<HTMLElement | null>, stepWidth: number, gutter: number) {
  const width = useRef(stepWidth)
  useEffect(() => {
    width.current = stepWidth
  }, [stepWidth])

  useEffect(
    () =>
      usePlayheadStore.subscribe((s, prev) => {
        const el = scrollerRef.current
        if (!el || !s.isPlaying || s.step === prev.step) return
        const x = s.step * width.current
        const visible = el.clientWidth - gutter
        if (x < el.scrollLeft || x > el.scrollLeft + visible - width.current) el.scrollLeft = x
      }),
    [scrollerRef, gutter],
  )
}
