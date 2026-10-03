import type { QueryClient } from '@tanstack/react-query'

// Everything on screen that is read from the operations log. One entry
// feeds two server tables: `operations` (the Labores log, per farm and as
// the Cuaderno's multi-farm ledger) and `harvest_yields` (the Producción
// ledger) — the server mirrors a harvest or an animal product into a
// yield row, and carries edits, deletes and undo over to it. Every
// mutation that writes a log entry refreshes both through here, so the
// two lists cannot disagree until the next reload.
//
// The bare prefixes are deliberate: ['operations', farmId] would miss the
// ledger, whose key is ['operations', 'ledger', farmIds].
export function invalidateLogViews(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['operations'] })
  queryClient.invalidateQueries({ queryKey: ['harvests'] })
}
