import { useEffect } from 'react'

// Escape closes the topmost dialog — the keyboard counterpart of the
// click-on-backdrop convention (backdrop scrims are aria-hidden and
// pointer-only; THIS is the accessible close path, alongside the visible
// close buttons). Document-level so it works without focus management.
export function useEscapeKey(onEscape: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onEscape, active])
}
