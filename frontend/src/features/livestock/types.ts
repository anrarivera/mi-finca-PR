// Livestock domain types. The shape mirrors the backend Prisma model
// `LivestockUnit` (backend/prisma/schema.prisma) so records can sync to the
// API without translation once the backend is wired up.

export type AnimalType =
  | 'chickens'
  | 'rabbits'
  | 'goats'
  | 'cows'
  | 'pigs'
  | 'bees'

export type LivestockUnit = {
  id: string
  farmId: string
  /** Corral assignment — a livestock-kind field of the same farm (null = unassigned). */
  fieldId?: string | null
  name: string           // e.g. "Gallinero principal"
  animalType: AnimalType
  currentCount: number
  acquisitionDate: string // ISO date (YYYY-MM-DD)
  // The wire carries explicit null (see backend livestock contract).
  notes?: string | null
}

/** Why animals left the herd when logging meat production. */
export type CountReason = 'slaughtered' | 'sold' | 'died' | 'other'
