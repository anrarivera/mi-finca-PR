import { describe, it, expect } from 'vitest'
import {
  buildOperationsICS, googleCalendarEventUrl, collectPendingOps,
  type IcsOperation,
} from './icsExport'
import type {
  PlacedField, PlantingEvent, RecommendedOperation, OperationStatus,
} from '../types'

const DTSTAMP = '20260615T120000Z'

let opSeq = 0
function op(overrides: Partial<RecommendedOperation> = {}): RecommendedOperation {
  opSeq++
  return {
    id: `op-${opSeq}`,
    plantingEventId: 'ev-1',
    templateId: 'tpl-1',
    type: 'fertilization',
    labelEs: 'Fertilización',
    recommendedDate: '2026-07-10',
    status: 'pending' as OperationStatus,
    ...overrides,
  }
}

function fieldWith(ops: RecommendedOperation[], name = 'Campo Norte'): PlacedField {
  const event: PlantingEvent = {
    id: 'ev-1', fieldId: 'f-1', cropTypeId: 'plantain',
    plantingDate: '2026-05-01', plantCount: 10,
    rowIds: [], freePlantIds: [], operations: ops,
  }
  return {
    id: 'f-1', farmId: 'farm-1', name, color: '#8fba4e',
    shape: 'rectangle', widthFt: 100, heightFt: 100,
    farmLat: 18.2, farmLng: -66.4, rotation: 0,
    isPositioning: false, displayMode: 'shape',
    rows: [], freePlants: [], plantingEvents: [event],
  } as unknown as PlacedField
}

describe('collectPendingOps', () => {
  it('keeps pending/due ops and drops completed/skipped, sorted by date', () => {
    const fields = [fieldWith([
      op({ recommendedDate: '2026-08-01' }),
      op({ recommendedDate: '2026-07-01', status: 'completed' }),
      op({ recommendedDate: '2026-06-01', status: 'skipped' }),
      op({ recommendedDate: '2026-07-15', status: 'due' }),
    ])]
    const result = collectPendingOps(fields)
    expect(result.map(i => i.op.recommendedDate)).toEqual(['2026-07-15', '2026-08-01'])
  })
})

describe('buildOperationsICS', () => {
  it('produces one all-day VEVENT per pending operation', () => {
    const fields = [fieldWith([op({ id: 'abc', recommendedDate: '2026-07-10' })])]
    const ics = buildOperationsICS(fields, DTSTAMP)

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).toContain('UID:abc@mi-finca-pr')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260710')
    // DTEND is exclusive → next day
    expect(ics).toContain('DTEND;VALUE=DATE:20260711')
    expect(ics).toContain(`DTSTAMP:${DTSTAMP}`)
  })

  it('rolls DTEND over month boundaries', () => {
    const fields = [fieldWith([op({ recommendedDate: '2026-07-31' })])]
    const ics = buildOperationsICS(fields, DTSTAMP)
    expect(ics).toContain('DTEND;VALUE=DATE:20260801')
  })

  it('escapes commas, semicolons and newlines in text fields', () => {
    const fields = [fieldWith(
      [op({ labelEs: 'Poda; ligera, con machete', notes: 'línea 1\nlínea 2' })],
      'Campo A, B'
    )]
    const ics = buildOperationsICS(fields, DTSTAMP)
    expect(ics).toContain('Poda\\; ligera\\, con machete')
    expect(ics).toContain('línea 1\\nlínea 2')
  })

  it('folds long lines to 75 octets max', () => {
    const fields = [fieldWith([
      op({ labelEs: 'Aplicación foliar de micronutrientes con énfasis en boro y zinc para mejorar el cuajado de la fruta durante la floración' }),
    ])]
    const ics = buildOperationsICS(fields, DTSTAMP)
    const encoder = new TextEncoder()
    for (const line of ics.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75)
    }
    // Folded continuation lines start with a space
    expect(ics).toMatch(/\r\n [^\r\n]/)
  })

  it('uses CRLF line endings throughout', () => {
    const ics = buildOperationsICS([fieldWith([op()])], DTSTAMP)
    expect(ics.includes('\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false)
  })
})

describe('googleCalendarEventUrl', () => {
  it('builds a prefilled template URL with exclusive end date', () => {
    const item: IcsOperation = {
      op: op({ labelEs: 'Cosecha', recommendedDate: '2026-09-01' }),
      fieldName: 'Campo Sur',
      cropTypeId: 'plantain',
    }
    const url = googleCalendarEventUrl(item)
    expect(url).toContain('https://calendar.google.com/calendar/render?')
    expect(url).toContain('action=TEMPLATE')
    expect(url).toContain('dates=20260901%2F20260902')
    // URLSearchParams encodes spaces as '+'
    expect(decodeURIComponent(url).replace(/\+/g, ' ')).toContain('Cosecha — Campo Sur')
  })
})
