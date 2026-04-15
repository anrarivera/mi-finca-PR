import type { PlantingEvent } from '../types'

export type FieldOperationHealth = {
  overdue: number    // past due date, not completed
  dueSoon: number    // due within next 14 days
  upcoming: number   // due beyond 14 days
  completed: number
}

export function getFieldOperationHealth(
  plantingEvents: PlantingEvent[]
): FieldOperationHealth {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const soonThreshold = new Date(today)
  soonThreshold.setDate(soonThreshold.getDate() + 14)

  let overdue = 0
  let dueSoon = 0
  let upcoming = 0
  let completed = 0

  for (const event of plantingEvents) {
    for (const op of event.operations) {
      if (op.status === 'completed' || op.status === 'skipped') {
        completed++
        continue
      }
      const due = new Date(op.recommendedDate + 'T00:00:00')
      if (due < today) overdue++
      else if (due <= soonThreshold) dueSoon++
      else upcoming++
    }
  }

  return { overdue, dueSoon, upcoming, completed }
}