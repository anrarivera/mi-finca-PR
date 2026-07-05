import type {
  Recommendation, RecommendationInput, RecommendationService,
} from './types'
import { getCropById } from '@/features/field/data/cropLibrary'
import { getAnimalById } from '@/features/livestock/data/animalLibrary'

// ──────────────────────────────────────────────────────────────────────────
// Rule-based recommendation engine (Phase 1 of the roadmap). Pure function of
// its input — no store access, no Date.now() — so it is deterministic and
// easy to unit-test. Rules produce at most a handful of items each; the
// result is sorted urgent → tip.
// ──────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<Recommendation['severity'], number> = {
  urgent: 0, warning: 1, info: 2, tip: 3,
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS)
}

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export class RuleBasedRecommendationService implements RecommendationService {
  getRecommendations(input: RecommendationInput): Recommendation[] {
    const recs: Recommendation[] = [
      ...this.overdueOperations(input),
      ...this.dueSoonOperations(input),
      ...this.upcomingHarvests(input),
      ...this.farmSetupGaps(input),
      ...this.livestockCare(input),
      ...this.seasonal(input),
      ...this.animalTips(input),
    ]
    return recs.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  }

  private overdueOperations({ fields, farms, today }: RecommendationInput): Recommendation[] {
    const day = startOfDay(today)
    const recs: Recommendation[] = []
    for (const field of fields) {
      const overdue = (field.plantingEvents ?? []).flatMap(e =>
        e.operations
          .filter(op => op.status !== 'completed' && op.status !== 'skipped')
          .filter(op => new Date(op.recommendedDate + 'T00:00:00') < day)
          .map(op => ({ event: e, op }))
      )
      if (overdue.length === 0) continue
      const farm = farms.find(f => f.id === field.farmId)
      const oldest = overdue.reduce((min, x) =>
        x.op.recommendedDate < min.op.recommendedDate ? x : min
      )
      recs.push({
        id: `overdue_${field.id}`,
        severity: 'urgent',
        category: 'operaciones',
        titleEs: `${overdue.length} ${overdue.length === 1 ? 'labor vencida' : 'labores vencidas'} en "${field.name}"`,
        detailEs: `La más antigua: ${oldest.op.labelEs} (${oldest.op.recommendedDate})${farm ? ` — ${farm.name}` : ''}. Márcalas como completadas u omítelas en el calendario de labores.`,
        farmId: field.farmId,
        fieldId: field.id,
      })
    }
    return recs
  }

  private dueSoonOperations({ fields, today }: RecommendationInput): Recommendation[] {
    const day = startOfDay(today)
    const soon = new Date(day.getTime() + 7 * DAY_MS)
    const recs: Recommendation[] = []
    for (const field of fields) {
      const due = (field.plantingEvents ?? []).flatMap(e =>
        e.operations
          .filter(op => op.status !== 'completed' && op.status !== 'skipped')
          .filter(op => {
            const d = new Date(op.recommendedDate + 'T00:00:00')
            return d >= day && d <= soon
          })
      )
      if (due.length === 0) continue
      recs.push({
        id: `duesoon_${field.id}`,
        severity: 'warning',
        category: 'operaciones',
        titleEs: `${due.length} ${due.length === 1 ? 'labor próxima' : 'labores próximas'} en "${field.name}"`,
        detailEs: `Esta semana: ${due.slice(0, 3).map(op => op.labelEs).join(', ')}${due.length > 3 ? '…' : ''}.`,
        farmId: field.farmId,
        fieldId: field.id,
      })
    }
    return recs
  }

  private upcomingHarvests({ fields, today }: RecommendationInput): Recommendation[] {
    const day = startOfDay(today)
    const horizon = new Date(day.getTime() + 14 * DAY_MS)
    const recs: Recommendation[] = []
    for (const field of fields) {
      for (const event of field.plantingEvents ?? []) {
        const harvest = event.operations.find(op =>
          op.type === 'harvest' &&
          op.status !== 'completed' && op.status !== 'skipped' &&
          new Date(op.recommendedDate + 'T00:00:00') >= day &&
          new Date(op.recommendedDate + 'T00:00:00') <= horizon
        )
        if (!harvest) continue
        const crop = getCropById(event.cropTypeId)
        recs.push({
          id: `harvest_${event.id}`,
          severity: 'info',
          category: 'operaciones',
          titleEs: `Cosecha de ${crop?.nameEs ?? event.cropTypeId} ${crop?.emoji ?? ''} se acerca`,
          detailEs: `${event.plantCount} plantas en "${field.name}" — cosecha recomendada el ${harvest.recommendedDate}. Prepara manos, empaque y venta.`,
          farmId: field.farmId,
          fieldId: field.id,
        })
      }
    }
    return recs
  }

  private farmSetupGaps({ farms, fields }: RecommendationInput): Recommendation[] {
    const recs: Recommendation[] = []
    for (const farm of farms) {
      if (!farm.boundary || farm.boundary.length < 3) {
        recs.push({
          id: `noboundary_${farm.id}`,
          severity: 'info',
          category: 'campos',
          titleEs: `"${farm.name}" no tiene límite dibujado`,
          detailEs: 'Dibuja el límite de la finca en el mapa para poder añadir campos y medir su área.',
          farmId: farm.id,
        })
        continue
      }
      const farmFields = fields.filter(f => f.farmId === farm.id)
      if (farmFields.length === 0) {
        recs.push({
          id: `nofields_${farm.id}`,
          severity: 'info',
          category: 'campos',
          titleEs: `"${farm.name}" no tiene campos`,
          detailEs: 'Usa el editor de campos para dividir la finca en áreas de siembra.',
          farmId: farm.id,
        })
      } else {
        const empty = farmFields.filter(f =>
          (f.rows ?? []).length === 0 && (f.freePlants ?? []).length === 0
        )
        for (const f of empty) {
          recs.push({
            id: `emptyfield_${f.id}`,
            severity: 'tip',
            category: 'campos',
            titleEs: `El campo "${f.name}" está vacío`,
            detailEs: 'Añade hileras de cultivo o plantas individuales para generar su calendario de labores.',
            farmId: farm.id,
            fieldId: f.id,
          })
        }
      }
    }
    return recs
  }

  private livestockCare({ livestock, today }: RecommendationInput): Recommendation[] {
    const day = startOfDay(today)
    const recs: Recommendation[] = []
    for (const unit of livestock) {
      const animal = getAnimalById(unit.animalType)
      if (!animal) continue
      const acquired = new Date(unit.acquisitionDate + 'T00:00:00')
      const age = daysBetween(acquired, day)
      if (age < 0) continue
      for (const task of animal.careTasks) {
        // A task is "due" during the 3 days after each interval boundary.
        const sinceLast = age % task.intervalDays
        if (age > 0 && sinceLast <= 3) {
          recs.push({
            id: `care_${unit.id}_${task.id}`,
            severity: 'warning',
            category: 'animales',
            titleEs: `${animal.emoji} ${task.labelEs} — ${unit.name}`,
            detailEs: `Tarea recurrente cada ${task.intervalDays} días para ${unit.currentCount} ${unit.currentCount === 1 ? animal.singularEs : animal.nameEs.toLowerCase()}.`,
            farmId: unit.farmId,
          })
        }
      }
    }
    return recs
  }

  private seasonal({ farms, today }: RecommendationInput): Recommendation[] {
    if (farms.length === 0) return []
    const month = today.getMonth() + 1 // 1-12
    // Atlantic hurricane season: June 1 – November 30
    if (month >= 6 && month <= 11) {
      return [{
        id: 'season_hurricane',
        severity: 'info',
        category: 'temporada',
        titleEs: '🌀 Temporada de huracanes (junio–noviembre)',
        detailEs: 'Revisa drenajes y desagües, poda ramas pesadas, asegura estructuras (gallineros, umbráculos) y ten plan para resguardar animales.',
      }]
    }
    // Dry season roughly December – April
    if (month === 12 || month <= 4) {
      return [{
        id: 'season_dry',
        severity: 'tip',
        category: 'temporada',
        titleEs: '☀️ Temporada seca',
        detailEs: 'Refuerza el riego y el acolchado (mulch) para conservar humedad; es buen momento para preparar terreno y estructuras.',
      }]
    }
    return []
  }

  private animalTips({ livestock, today }: RecommendationInput): Recommendation[] {
    // One rotating tip per owned animal type, deterministic per day.
    const dayOfYear = Math.floor(
      (startOfDay(today).getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / DAY_MS
    )
    const types = [...new Set(livestock.map(u => u.animalType))]
    const recs: Recommendation[] = []
    for (const type of types) {
      const animal = getAnimalById(type)
      if (!animal || animal.tipsEs.length === 0) continue
      recs.push({
        id: `tip_${type}`,
        severity: 'tip',
        category: 'consejo',
        titleEs: `${animal.emoji} Consejo — ${animal.nameEs}`,
        detailEs: animal.tipsEs[dayOfYear % animal.tipsEs.length],
      })
    }
    return recs
  }
}

export const recommendationService: RecommendationService =
  new RuleBasedRecommendationService()
