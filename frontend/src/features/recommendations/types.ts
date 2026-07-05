import type { Farm } from '@/store/useFarmStore'
import type { PlacedField } from '@/features/field/types'
import type { LivestockUnit } from '@/features/livestock/types'

export type RecommendationSeverity = 'urgent' | 'warning' | 'info' | 'tip'

export type Recommendation = {
  id: string
  severity: RecommendationSeverity
  category: 'operaciones' | 'campos' | 'animales' | 'temporada' | 'consejo'
  titleEs: string
  detailEs: string
  farmId?: string
  fieldId?: string
}

export type RecommendationInput = {
  farms: Farm[]
  fields: PlacedField[]
  livestock: LivestockUnit[]
  today: Date
}

// The UI depends only on this interface — a future LLM-powered implementation
// (Phase 2 of the roadmap) can replace the rule-based one without UI changes.
export interface RecommendationService {
  getRecommendations(input: RecommendationInput): Recommendation[]
}
