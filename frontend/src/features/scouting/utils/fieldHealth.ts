import type { FieldRow, PlantInstance } from '@/features/field/types'
import { SEVERITY_COLORS, type Finding } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Field health — the traffic-light color a field shows on the map and its
// card. Severity (how sick the plants the scout saw are) stays a human
// judgment; EXTENT (how much of the field is affected) is derived from the
// finding's scope. The two combine into the field-level alarm:
//   - severa anywhere → alert immediately (one HLB tree is an emergency)
//   - leve/moderada → alert only once extent passes the threshold, so a
//     couple of aphid plants don't paint a 5-acre field amber
//   - all alerting findings treated → softened color until resolved
// The stored field.color survives untouched — display colors are derived.
// ──────────────────────────────────────────────────────────────────────────

export const EXTENT_ALERT_THRESHOLD = 0.1

export const FIELD_HEALTH_COLORS = {
  /** No plants and nothing found — bare ground. */
  empty: '#a8a08c',
  /** Planted with no alerting findings. */
  healthy: '#8fba4e',
}

// Desaturated severity colors — "treated, awaiting confirmation": the
// field shouldn't look healthy yet, but the alarm can stop shouting.
// Muted counterparts of SEVERITY_COLORS (yellow / amber / red).
export const SEVERITY_COLORS_SOFT: Record<number, string> = {
  1: '#dfd489',
  2: '#dfc389',
  3: '#df8f8f',
}

type FieldPlants = {
  id: string
  rows: FieldRow[]
  freePlants: PlantInstance[]
}

export function totalPlantCount(field: Pick<FieldPlants, 'rows' | 'freePlants'>): number {
  return field.rows.reduce((sum, r) => sum + r.plants.length, 0) + field.freePlants.length
}

// Fraction of the field a finding covers (0..1). A field-level finding
// (empty scope) is an observation about the whole field — extent 1, which
// also lets a fallow field alert on e.g. weeds or rodents. Accepts
// observations too (anything carrying the {rowIds, plantIds} shape).
export function findingExtent(
  finding: Pick<Finding, 'rowIds' | 'plantIds'>,
  field: Pick<FieldPlants, 'rows' | 'freePlants'>
): number {
  if (finding.rowIds.length === 0 && finding.plantIds.length === 0) return 1
  const total = totalPlantCount(field)
  if (total === 0) return 0
  const affected = new Set(finding.plantIds)
  for (const row of field.rows) {
    if (finding.rowIds.includes(row.id)) row.plants.forEach(p => affected.add(p.id))
  }
  return Math.min(1, affected.size / total)
}

// Extent as a display percentage, or null when showing it adds nothing
// (field-level findings already read "Todo el campo").
export function findingExtentPct(
  finding: Pick<Finding, 'rowIds' | 'plantIds'>,
  field: Pick<FieldPlants, 'rows' | 'freePlants'>
): number | null {
  if (finding.rowIds.length === 0 && finding.plantIds.length === 0) return null
  if (totalPlantCount(field) === 0) return null
  return Math.round(findingExtent(finding, field) * 100)
}

// Direction of the last re-inspection: did severity move? Null until a
// finding has at least two observations. (Extent changes at equal severity
// are visible in the history lines; the trend cue tracks severity only so
// it stays explainable at a glance.)
export type FindingTrend = 'improving' | 'worsening' | 'stable'

export function findingTrend(finding: Finding): FindingTrend | null {
  const obs = finding.observations ?? []
  if (obs.length < 2) return null
  const prev = obs[obs.length - 2].severity
  const last = obs[obs.length - 1].severity
  if (last < prev) return 'improving'
  if (last > prev) return 'worsening'
  return 'stable'
}

export type FieldHealth = {
  status: 'empty' | 'healthy' | 'alert'
  /** What the map fill / card dot should show. */
  color: string
  /** Highest severity among alerting findings (alert status only). */
  severity?: number
  /** True when every alerting finding is already treated. */
  treatedOnly?: boolean
  /** All unresolved findings on the field (open + treated) — badge count. */
  unresolvedCount: number
  /** Highest severity among ALL unresolved findings — badge color. */
  maxUnresolvedSeverity?: number
}

export function fieldHealth(field: FieldPlants, findings: Finding[]): FieldHealth {
  const unresolved = findings.filter(
    f => f.fieldId === field.id && f.status !== 'resolved'
  )
  const maxUnresolvedSeverity = unresolved.length > 0
    ? Math.max(...unresolved.map(f => f.severity))
    : undefined

  const alerting = unresolved.filter(f =>
    f.severity >= 3 || findingExtent(f, field) >= EXTENT_ALERT_THRESHOLD
  )

  if (alerting.length > 0) {
    const severity = Math.max(...alerting.map(f => f.severity))
    const treatedOnly = alerting.every(f => f.status === 'treated')
    return {
      status: 'alert',
      severity,
      treatedOnly,
      color: treatedOnly ? SEVERITY_COLORS_SOFT[severity] : SEVERITY_COLORS[severity],
      unresolvedCount: unresolved.length,
      maxUnresolvedSeverity,
    }
  }

  if (totalPlantCount(field) === 0) {
    return {
      status: 'empty',
      color: FIELD_HEALTH_COLORS.empty,
      unresolvedCount: unresolved.length,
      maxUnresolvedSeverity,
    }
  }

  return {
    status: 'healthy',
    color: FIELD_HEALTH_COLORS.healthy,
    unresolvedCount: unresolved.length,
    maxUnresolvedSeverity,
  }
}
