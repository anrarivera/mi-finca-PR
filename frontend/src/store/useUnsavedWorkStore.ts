import { useEffect } from 'react'
import { create } from 'zustand'

// Open entry forms (operation check-offs, hallazgos, …) register here so
// cross-cutting actions — like switching farms from a map pin — can warn
// before discarding what's on screen. Counter, not boolean: more than one
// can be open at once (check-off over the ops drawer, etc.).
type UnsavedWorkStore = {
  count: number
  begin: () => void
  end: () => void
}

export const useUnsavedWorkStore = create<UnsavedWorkStore>(set => ({
  count: 0,
  begin: () => set(s => ({ count: s.count + 1 })),
  end: () => set(s => ({ count: Math.max(0, s.count - 1) })),
}))

// Lazy dirty checkers — screens whose "unsaved" is a computation over
// editing state (the map's boundary drawing / field editor) register a
// callback instead of begin/end, so dirtiness is evaluated at decision
// time (a nav click, beforeunload) rather than tracked on every render.
type UnsavedWorkChecker = () => boolean
const checkers = new Set<UnsavedWorkChecker>()

/** Registers a dirty-check; returns the unregister cleanup. */
export function registerUnsavedWorkChecker(fn: UnsavedWorkChecker): () => void {
  checkers.add(fn)
  return () => { checkers.delete(fn) }
}

export const hasUnsavedWork = () =>
  useUnsavedWorkStore.getState().count > 0 || [...checkers].some(fn => fn())

/** Counts the calling component as unsaved work while it is mounted. */
export function useMarkUnsavedWork() {
  useEffect(() => {
    const { begin, end } = useUnsavedWorkStore.getState()
    begin()
    return end
  }, [])
}
