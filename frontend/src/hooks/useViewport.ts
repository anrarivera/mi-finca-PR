import { useCallback, useSyncExternalStore } from 'react'

// Media-query subscription so components re-render on viewport or
// input-capability changes (rotation, window resize, mouse plugged into a
// tablet) instead of reading matchMedia once at mount.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}

/** Phone-sized viewport — below Tailwind's `sm` breakpoint (640px). */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 639px)')
}

/** Touch-first device (finger, not mouse) — pairs with the CSS
    `pointer-coarse:` variant for logic that CSS alone can't express. */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)')
}
