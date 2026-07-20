import type {
  PlantingEvent, RecommendedOperation, FieldRow, PlantInstance
} from '../types'
import { todayISO } from '../types'
import { getScheduleForCrop } from '../data/cropSchedules'

// Pure calendar-date arithmetic in UTC. Mixing UTC parsing with local
// setDate/toISOString (the previous version) drifted a day around DST
// transitions in local timezones.
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().split('T')[0]
}

function generateOperations(
  plantingEventId: string,
  cropTypeId: string,
  plantingDate: string
): RecommendedOperation[] {
  const schedule = getScheduleForCrop(cropTypeId)
  if (!schedule) return []

  const today = todayISO()

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

// Merge a row's plants of one crop into the matching event (or create it).
// Each event only ever counts plants of ITS crop — a row with a companion
// crop contributes to two separate events.
function upsertRowCrop(
  events: PlantingEvent[],
  fieldId: string,
  row: FieldRow,
  cropTypeId: string,
  isPrimary: boolean
): PlantingEvent[] {
  const plants = row.plants.filter(p => p.cropTypeId === cropTypeId)
  // The primary event anchors the row even before plants exist; a companion
  // event only makes sense once companion plants are actually placed.
  if (!isPrimary && plants.length === 0) return events

  const existing = findPlantingEvent(events, cropTypeId, row.plantingDate)
  if (existing) {
    return events.map(e => {
      if (e.id !== existing.id) return e
      const { event: healedEvent, wasHistory } = healEventOperations(e)
      // A history-only event's plantCount/rowIds describe plants that were
      // REMOVED — replanting must reset them from the new row, not stack on
      // top of the stale numbers.
      return wasHistory
        ? { ...healedEvent, plantCount: plants.length, rowIds: [row.id], freePlantIds: [] }
        : {
            ...healedEvent,
            plantCount: e.plantCount + plants.length,
            rowIds: e.rowIds.includes(row.id) ? e.rowIds : [...e.rowIds, row.id],
          }
    })
  }
  return [
    ...events,
    createPlantingEvent(fieldId, cropTypeId, row.plantingDate, plants.length, [row.id], []),
  ]
}

// History-only events (kept by rebuildPlantingEvents after their plants were
// removed) hold just their completed/skipped operations. When new plants
// merge back into such an event — a replant with the same crop and date —
// the missing schedule operations must be restored, or the new planting
// would have no pending calendar at all. `wasHistory` tells the caller the
// event's plant counts refer to removed plants and must be reset.
function healEventOperations(event: PlantingEvent): {
  event: PlantingEvent
  wasHistory: boolean
} {
  const schedule = generateOperations(event.id, event.cropTypeId, event.plantingDate)
  const missing = schedule.filter(
    op => !event.operations.some(o => o.templateId === op.templateId)
  )
  if (missing.length === 0) return { event, wasHistory: false }
  return {
    wasHistory: true,
    event: {
      ...event,
      operations: [...event.operations, ...missing].sort((a, b) =>
        a.recommendedDate.localeCompare(b.recommendedDate)
      ),
    },
  }
}

// Called when a row is confirmed — returns updated events array.
// Primary and companion crops are processed independently so the companion
// event is created/merged even when the primary crop merges into an
// existing event (the old early-return dropped companions in that case and
// over-counted the primary event with companion plants).
export function processRowForEvents(
  existingEvents: PlantingEvent[],
  fieldId: string,
  row: FieldRow
): PlantingEvent[] {
  let events = upsertRowCrop(existingEvents, fieldId, row, row.primaryCropTypeId, true)
  if (row.companionCropTypeId && row.companionCropTypeId !== row.primaryCropTypeId) {
    events = upsertRowCrop(events, fieldId, row, row.companionCropTypeId, false)
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
      events = events.map(e => {
        if (e.id !== existing.id) return e
        const { event: healedEvent, wasHistory } = healEventOperations(e)
        // See upsertRowCrop: a history event's counts describe removed
        // plants and must be reset, not accumulated.
        return wasHistory
          ? {
              ...healedEvent,
              plantCount: cropPlants.length,
              rowIds: [],
              freePlantIds: cropPlants.map(p => p.id),
            }
          : mergeFreePlantsIntoEvent(healedEvent, cropPlants)
      })
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

// ──────────────────────────────────────────────────────────────────────────
// Added by Claude — recompute a field's planting events from scratch.
//
// Used after rows are edited or deleted, where the crop/date grouping may have
// changed and an incremental update isn't enough. Operation completion status
// (completed / skipped, plus the captured notes/product/quantity) is carried
// over from the previous events, matched by (cropTypeId, plantingDate) then
// templateId, so checking off operations isn't lost by an unrelated edit.
// ──────────────────────────────────────────────────────────────────────────
export function rebuildPlantingEvents(
  fieldId: string,
  rows: FieldRow[],
  freePlants: PlantInstance[],
  previousEvents: PlantingEvent[]
): PlantingEvent[] {
  // Group by what is ACTUALLY planted (each plant's own crop and date), not
  // by row-level primary/companion labels — a single plant recropped via the
  // plant editor must show up in the calendar under its real crop.
  type Group = {
    cropTypeId: string
    plantingDate: string
    count: number
    rowIds: string[]
    freePlantIds: string[]
  }
  const groups = new Map<string, Group>()
  const groupFor = (cropTypeId: string, plantingDate: string): Group => {
    const key = `${cropTypeId}|${plantingDate}`
    let g = groups.get(key)
    if (!g) {
      g = { cropTypeId, plantingDate, count: 0, rowIds: [], freePlantIds: [] }
      groups.set(key, g)
    }
    return g
  }

  for (const row of rows) {
    for (const p of row.plants) {
      const g = groupFor(p.cropTypeId, p.plantingDate || row.plantingDate)
      g.count++
      if (!g.rowIds.includes(row.id)) g.rowIds.push(row.id)
    }
  }
  for (const p of freePlants) {
    const g = groupFor(p.cropTypeId, p.plantingDate)
    g.count++
    g.freePlantIds.push(p.id)
  }

  const events: PlantingEvent[] = [...groups.values()].map(g =>
    createPlantingEvent(fieldId, g.cropTypeId, g.plantingDate, g.count, g.rowIds, g.freePlantIds)
  )

  // Carry over completion status from the previous events where the
  // crop + date grouping still exists.
  const rebuilt = events.map(ev => {
    const old = previousEvents.find(
      e => e.cropTypeId === ev.cropTypeId && e.plantingDate === ev.plantingDate
    )
    if (!old) return ev
    return {
      ...ev,
      operations: ev.operations.map(op => {
        const oldOp = old.operations.find(o => o.templateId === op.templateId)
        if (oldOp && (oldOp.status === 'completed' || oldOp.status === 'skipped')) {
          return {
            ...op,
            status: oldOp.status,
            completedDate: oldOp.completedDate,
            notes: oldOp.notes,
            product: oldOp.product,
            quantity: oldOp.quantity,
            unit: oldOp.unit,
          }
        }
        return op
      }),
    }
  })

  // Completed work is a RECORD, not a todo: planting events are the sole
  // storage behind the harvest log and calendar history, so a previous
  // event whose plants were all removed (row deleted, date corrected)
  // survives as a history-only event keeping its completed/skipped
  // operations. Its pending operations disappear with the plants.
  const rebuiltKeys = new Set(rebuilt.map(e => `${e.cropTypeId}|${e.plantingDate}`))
  for (const old of previousEvents) {
    if (rebuiltKeys.has(`${old.cropTypeId}|${old.plantingDate}`)) continue
    const doneOps = old.operations.filter(
      op => op.status === 'completed' || op.status === 'skipped'
    )
    if (doneOps.length === 0) continue
    rebuilt.push({ ...old, operations: doneOps })
  }

  return rebuilt
}

// Update operation statuses based on today's date
export function refreshOperationStatuses(
  events: PlantingEvent[]
): PlantingEvent[] {
  const today = todayISO()
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