import { useState } from 'react'

// Persisted section collapse — starts open on first visit, then remembers
// the last choice per section key on this device. A collapse the user has
// to redo every visit is a fidget, not a preference.
export function useCollapsed(key: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(key) === '1')
  function toggle() {
    const next = !collapsed
    localStorage.setItem(key, next ? '1' : '0')
    setCollapsed(next)
  }
  return [collapsed, toggle]
}
