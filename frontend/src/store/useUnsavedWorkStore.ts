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

export const hasUnsavedWork = () => useUnsavedWorkStore.getState().count > 0

/** Counts the calling component as unsaved work while it is mounted. */
export function useMarkUnsavedWork() {
  useEffect(() => {
    const { begin, end } = useUnsavedWorkStore.getState()
    begin()
    return end
  }, [])
}
