import type { Farm } from '@/store/useFarmStore'

// Which farm is the active one after the farm list was synced again. The
// previous selection holds while that farm is still in the list. The
// sample farm needs one more rule: every reset — "Restablecer ahora" or
// the expiry — brings it back under a NEW id, and whoever was inside it
// stays inside. Falling through to the favorite would land them on one of
// their own farms without a word, still believing they are in the sandbox.
export function farmToReselect(
  farms: Farm[],
  previous: Farm | null,
  fallbackId: string | null
): Farm | undefined {
  return (
    farms.find(f => f.id === previous?.id) ??
    (previous?.isSample ? farms.find(f => f.isSample) : undefined) ??
    farms.find(f => f.id === fallbackId)
  )
}

// When the sample farm goes back to its default data, as a day the farmer
// can read: "3 de octubre" / "October 3". `resetsAt` is a real instant, so
// the day is the DEVICE's — 02:30 UTC on the 4th is still the 3rd in
// Puerto Rico. null when there is no date to show (not loaded, not set).
export function formatResetDate(
  resetsAt: string | null | undefined,
  locale: string
): string | null {
  if (!resetsAt) return null
  const instant = new Date(resetsAt)
  if (Number.isNaN(instant.getTime())) return null
  return instant.toLocaleDateString(locale, { day: 'numeric', month: 'long' })
}
