import type {
  PlantingEvent, RecommendedOperation, FieldRow, PlantInstance
} from '../types'
import { getScheduleForCrop } from '../data/cropSchedules'

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr)
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}

function generateOperations(
  plantingEventId: string,
  cropTypeId: string,
  plantingDate: string
): RecommendedOperation[] {
  const schedule = getScheduleForCrop(cropTypeId)
  if (!schedule) return []

  const today = new Date().toISOString().split('T')[0]

  return schedule.operations.map(template => {
    const recommendedDate = addDays(plantingDate, template.offsetDays)
    const status = recommendedDate < today ? 'due' : 'pending'
    return {
      id: `op_${plantingEventId}_${template.id}`,
      plantingEventId,
      templateId: template.id,
      type: template.type,
      labelEs: template.labelEs,
      recommendedDate,
      status,
      product: template.product,
    }
  })
}

// Find existing planting event for this crop + date combination
export function findPlantingEvent(
  events: PlantingEvent[],
  cropTypeId: string,
  plantingDate: string
): PlantingEvent | undefined {
  return events.find(
    e => e.cropTypeId === cropTypeId && e.plantingDate === plantingDate
  )
}

// Create a brand new planting event for a crop type + date
export function createPlantingEvent(
  fieldId: string,
  cropTypeId: string,
  plantingDate: string,
  plantCount: number,
  rowIds: string[],
  freePlantIds: string[]
): PlantingEvent {
  const id = `pe_${fieldId}_${cropTypeId}_${plantingDate}_${Date.now()}`
  const operations = generateOperations(id, cropTypeId, plantingDate)
  return {
    id,
    fieldId,
    cropTypeId,
    plantingDate,
    plantCount,
    rowIds,
    freePlantIds,
    operations,
  }
}

// Merge a new row into an existing planting event
export function mergeRowIntoEvent(
  event: PlantingEvent,
  row: FieldRow
): PlantingEvent {
  return {
    ...event,
    plantCount: event.plantCount + row.plants.length,
    rowIds: [...event.rowIds, row.id],
  }
}

// Merge new free plants into an existing planting event
export function mergeFreePlantsIntoEvent(
  event: PlantingEvent,
  plants: PlantInstance[]
): PlantingEvent {
  return {
    ...event,
    plantCount: event.plantCount + plants.length,
    freePlantIds: [
      ...event.freePlantIds,
      ...plants.map(p => p.id),
    ],
  }
}

// Called when a row is confirmed — returns updated events array
export function processRowForEvents(
  existingEvents: PlantingEvent[],
  fieldId: string,
  row: FieldRow
): PlantingEvent[] {
  const cropTypeId = row.primaryCropTypeId
  const plantingDate = row.plantingDate

  const existing = findPlantingEvent(existingEvents, cropTypeId, plantingDate)

  if (existing) {
    return existingEvents.map(e =>
      e.id === existing.id ? mergeRowIntoEvent(e, row) : e
    )
  }

  const newEvent = createPlantingEvent(
    fieldId,
    cropTypeId,
    plantingDate,
    row.plants.filter(p => p.cropTypeId === cropTypeId).length,
    [row.id],
    []
  )

  const events = [...existingEvents, newEvent]

  // If row has a companion crop, create a separate event for it
  if (row.companionCropTypeId) {
    const companionPlants = row.plants.filter(
      p => p.cropTypeId === row.companionCropTypeId
    )
    if (companionPlants.length > 0) {
      const existingCompanion = findPlantingEvent(
        events,
        row.companionCropTypeId,
        plantingDate
      )
      if (existingCompanion) {
        return events.map(e =>
          e.id === existingCompanion.id
            ? { ...e, plantCount: e.plantCount + companionPlants.length }
            : e
        )
      }
      const companionEvent = createPlantingEvent(
        fieldId,
        row.companionCropTypeId,
        plantingDate,
        companionPlants.length,
        [row.id],
        []
      )
      return [...events, companionEvent]
    }
  }

  return events
}

// Called when free plants are placed
export function processFreePlantsForEvents(
  existingEvents: PlantingEvent[],
  fieldId: string,
  plants: PlantInstance[],
  plantingDate: string
): PlantingEvent[] {
  // Group plants by crop type
  const byCrop: Record<string, PlantInstance[]> = {}
  plants.forEach(p => {
    if (!byCrop[p.cropTypeId]) byCrop[p.cropTypeId] = []
    byCrop[p.cropTypeId].push(p)
  })

  let events = [...existingEvents]

  Object.entries(byCrop).forEach(([cropTypeId, cropPlants]) => {
    const existing = findPlantingEvent(events, cropTypeId, plantingDate)
    if (existing) {
      events = events.map(e =>
        e.id === existing.id
          ? mergeFreePlantsIntoEvent(e, cropPlants)
          : e
      )
    } else {
      const newEvent = createPlantingEvent(
        fieldId,
        cropTypeId,
        plantingDate,
        cropPlants.length,
        [],
        cropPlants.map(p => p.id)
      )
      events = [...events, newEvent]
    }
  })

  return events
}

// Update operation statuses based on today's date
export function refreshOperationStatuses(
  events: PlantingEvent[]
): PlantingEvent[] {
  const today = new Date().toISOString().split('T')[0]
  return events.map(event => ({
    ...event,
    operations: event.operations.map(op => {
      if (op.status === 'completed' || op.status === 'skipped') return op
      return {
        ...op,
        status: op.recommendedDate < today ? 'due' : 'pending',
      }
    }),
  }))
}