// ──────────────────────────────────────────────────────────────────────────
// Scouting — pest/disease findings. A finding records what the farmer SAW
// (the operations log records what they DID): pest + severity + where.
// Scope reuses the tri-level model of operations: rowIds = fully affected
// rows, plantIds = individual plants outside those rows, both empty =
// field-level observation (the right workflow for sample-based scouting on
// big farms, not a degraded mode).
// ──────────────────────────────────────────────────────────────────────────

export type FindingStatus = 'open' | 'treated' | 'resolved'

// One scouting visit — the re-inspection trail ("seguimiento"). The
// finding's own severity/scope always mirror the LAST observation.
export type FindingObservation = {
  id: string
  findingId: string
  date: string
  severity: number
  rowIds: string[]
  plantIds: string[]
  notes: string | null
  createdAt: string
}

export type Finding = {
  id: string
  fieldId: string
  pestId: string
  /** 1 leve · 2 moderada · 3 severa */
  severity: number
  status: FindingStatus
  foundDate: string
  notes: string | null
  /** Fully affected rows — [] + empty plantIds = whole-field observation. */
  rowIds: string[]
  /** Individually affected plants outside those rows. */
  plantIds: string[]
  /** The treatment labor created from this finding ("Crear labor"), if any. */
  treatmentRecommendedOperationId: string | null
  createdAt: string
  /** Oldest → newest; the last one is this finding's current state. */
  observations?: FindingObservation[]
}

export const SEVERITY_LABELS: Record<number, string> = {
  1: 'Leve',
  2: 'Moderada',
  3: 'Severa',
}

// Yellow → amber → red, used both in lists and for the map paint of
// affected rows/plants. Deliberately far apart: the old amber/orange/red
// ramp read as one color at a glance on the satellite imagery.
export const SEVERITY_COLORS: Record<number, string> = {
  1: '#facc15',
  2: '#f59e0b',
  3: '#dc2626',
}

export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  open: 'Abierto',
  treated: 'Tratado',
  resolved: 'Resuelto',
}
