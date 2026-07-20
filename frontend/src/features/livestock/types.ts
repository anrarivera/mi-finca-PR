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
  name: string           // e.g. "Gallinero principal"
  animalType: AnimalType
  currentCount: number
  acquisitionDate: string // ISO date (YYYY-MM-DD)
  notes?: string
}
