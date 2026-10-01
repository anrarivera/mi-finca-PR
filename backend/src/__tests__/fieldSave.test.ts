import {
  request, prisma, createTestUser, createTestFarm, createTestField, cleanDatabase,
} from './helpers'

// ── Field saves: atomic and non-destructive ─────────────────────────────
// A field save owns STRUCTURE (which plantings exist, their plants, the
// planned calendar); the check-off endpoints own check-off state. A save
// never deletes or rewrites recorded work, and a rejected save leaves the
// stored field exactly as it was.

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

const plant = (id: string, overrides?: object) => ({
  id, cropTypeId: 'platano', lat: 18.4655, lng: -66.1057, plantingDate: '2026-06-01',
  ...overrides,
})

const row = (id: string, plantIds: string[], overrides?: object) => ({
  id,
  startLat: 18.4655, startLng: -66.1057, endLat: 18.4656, endLng: -66.1056,
  spacingFt: 8,
  primaryCropTypeId: 'platano',
  plantingDate: '2026-06-01',
  plants: plantIds.map(plantId => plant(plantId)),
  ...overrides,
})

const op = (id: string, overrides?: object) => ({
  id, templateId: id, type: 'fertilization', labelEs: 'Abono',
  recommendedDate: '2026-07-01', status: 'pending',
  ...overrides,
})

const harvestOp = (id: string, overrides?: object) =>
  op(id, { type: 'harvest', labelEs: 'Cosecha', recommendedDate: '2027-03-01', ...overrides })

const event = (id: string, operations: object[], overrides?: object) => ({
  id, cropTypeId: 'platano', plantingDate: '2026-06-01', plantCount: 4, operations,
  ...overrides,
})

// A planted field the way the editor saves it: two rows, a free plant and
// one planting whose calendar holds a fertilization and a harvest.
async function setupPlantedField() {
  const { token } = await createTestUser()
  const farm = await createTestFarm(token)
  const field = await createTestField(token, farm.id, {
    rows: [row('row_1', ['plant_1', 'plant_2']), row('row_2', ['plant_3'])],
    freePlants: [plant('free_1')],
    plantingEvents: [
      event('pe_1', [op('op_fert'), harvestOp('op_harvest')], {
        rowIds: ['row_1', 'row_2'], freePlantIds: ['free_1'],
      }),
    ],
  })
  return { token, farm, field }
}

// What the editor holds while it is open: the field as GET returned it.
async function loadField(token: string, farmId: string, fieldId: string) {
  const res = await request.get(`/api/v1/farms/${farmId}/fields`).set(auth(token))
  return res.body.data.fields.find((f: any) => f.id === fieldId)
}

// ...and what it sends back on save: that snapshot, wholesale.
const editorPayload = (field: any) => ({
  name: field.name,
  shape: field.shape,
  boundary: field.boundary,
  rows: field.rows,
  freePlants: field.freePlants,
  plantingEvents: field.plantingEvents,
})

const patchField = (token: string, farmId: string, fieldId: string, body: object) =>
  request.patch(`/api/v1/farms/${farmId}/fields/${fieldId}`).set(auth(token)).send(body)

async function complete(token: string, farmId: string, recOpId: string, body: object) {
  const res = await request
    .post(`/api/v1/farms/${farmId}/recommended-operations/${recOpId}/complete`)
    .set(auth(token))
    .send(body)
  expect(res.status).toBe(201)
  return res.body.data
}

const HARVEST = { completedDate: '2027-03-05', quantity: 120, unit: 'lb' }

// Rows and plants exactly as stored — createdAt included, so a delete-and-
// recreate shows up as a difference even when the values match.
async function storedStructure(fieldId: string) {
  const [rows, plants] = await Promise.all([
    prisma.fieldRow.findMany({ where: { fieldId }, orderBy: { id: 'asc' } }),
    prisma.plantInstance.findMany({ where: { fieldId }, orderBy: { id: 'asc' } }),
  ])
  return { rows, plants }
}

beforeEach(async () => { await cleanDatabase() })

afterAll(async () => {
  await cleanDatabase()
  await prisma.$disconnect()
})

describe('a field save keeps recorded work', () => {
  it('keeps the log entry linked to its planting across an editor save', async () => {
    const { token, farm, field } = await setupPlantedField()
    const done = await complete(token, farm.id, 'op_harvest', HARVEST)

    const snapshot = await loadField(token, farm.id, field.id)
    const res = await patchField(token, farm.id, field.id, editorPayload(snapshot))
    expect(res.status).toBe(200)

    const operations = await prisma.operation.findMany({ where: { fieldId: field.id } })
    expect(operations).toHaveLength(1)
    expect(operations[0].id).toBe(done.operation.id)
    expect(operations[0].plantingEventId).toBe('pe_1')

    const recOp = await prisma.recommendedOperation.findUnique({ where: { id: 'op_harvest' } })
    expect(recOp).toMatchObject({ status: 'completed', completedOperationId: done.operation.id })

    const yields = await prisma.harvestYield.findMany({ where: { fieldId: field.id, deletedAt: null } })
    expect(yields).toHaveLength(1)
    expect(yields[0].operationId).toBe(done.operation.id)
  })

  it('does not revert check-offs made after the editor opened', async () => {
    const { token, farm, field } = await setupPlantedField()

    // The editor opens, then the work is checked off from the calendar.
    const stale = await loadField(token, farm.id, field.id)
    const done = await complete(token, farm.id, 'op_harvest', { ...HARVEST, notes: 'Buena cosecha' })
    const skipped = await request
      .post(`/api/v1/farms/${farm.id}/recommended-operations/op_fert/skip`)
      .set(auth(token))
    expect(skipped.status).toBe(200)

    // The snapshot still says both are pending.
    expect(stale.plantingEvents[0].operations.map((o: any) => o.status)).toEqual(['pending', 'pending'])
    const res = await patchField(token, farm.id, field.id, editorPayload(stale))
    expect(res.status).toBe(200)

    const saved = res.body.data.field.plantingEvents[0].operations
    expect(saved.find((o: any) => o.id === 'op_harvest')).toMatchObject({
      status: 'completed',
      completedDate: '2027-03-05',
      completedOperationId: done.operation.id,
      quantity: 120,
      unit: 'lb',
      notes: 'Buena cosecha',
    })
    expect(saved.find((o: any) => o.id === 'op_fert').status).toBe('skipped')
    expect(await prisma.operation.count({ where: { fieldId: field.id } })).toBe(1)
  })

  it('keeps a treatment labor the snapshot has never seen', async () => {
    const { token, farm, field } = await setupPlantedField()
    const stale = await loadField(token, farm.id, field.id)

    const finding = await request
      .post(`/api/v1/farms/${farm.id}/findings`)
      .set(auth(token))
      .send({ fieldId: field.id, pestId: 'pulgones', severity: 2 })
    const treatment = await request
      .post(`/api/v1/farms/${farm.id}/findings/${finding.body.data.id}/create-operation`)
      .set(auth(token))
      .send({ plantingEventId: 'pe_1', labelEs: 'Tratar pulgones' })
    expect(treatment.status).toBe(201)
    const treatmentId = treatment.body.data.recommendedOperation.id

    const res = await patchField(token, farm.id, field.id, editorPayload(stale))
    expect(res.status).toBe(200)

    expect(await prisma.recommendedOperation.findUnique({ where: { id: treatmentId } })).not.toBeNull()
    const stored = await prisma.finding.findUnique({ where: { id: finding.body.data.id } })
    expect(stored!.treatmentRecommendedOperationId).toBe(treatmentId)
  })

  it('linking a planting to a recipe version keeps its yields as evidence', async () => {
    const { token, farm, field } = await setupPlantedField()
    await complete(token, farm.id, 'op_harvest', HARVEST)

    await prisma.cropType.create({
      data: { id: 'platano', name: 'Plantain', nameEs: 'Plátano', isBuiltIn: true },
    })
    const recipe = await prisma.recipe.create({
      data: {
        cropTypeId: 'platano', authorUserId: null, name: 'Calendario base', visibility: 'public',
        versions: { create: { number: 1, harvestWindowStartDays: 240, harvestWindowEndDays: 330 } },
      },
      include: { versions: true },
    })
    const versionId = recipe.versions[0].id

    // "Guardar como receta" sends the plantings alone, with the new reference.
    const loaded = await loadField(token, farm.id, field.id)
    const res = await patchField(token, farm.id, field.id, {
      plantingEvents: loaded.plantingEvents.map((e: any) => ({ ...e, recipeVersionId: versionId })),
    })
    expect(res.status).toBe(200)
    expect(res.body.data.field.plantingEvents[0].recipeVersionId).toBe(versionId)
    expect(res.body.data.field.plantingEvents[0].rowIds.sort()).toEqual(['row_1', 'row_2'])

    const operation = await prisma.operation.findFirst({ where: { fieldId: field.id } })
    expect(operation!.plantingEventId).toBe('pe_1')

    const evidence = await request.get(`/api/v1/recipes/${recipe.id}/evidence`).set(auth(token))
    expect(evidence.status).toBe(200)
    expect(evidence.body.data.versions[0].totals.yields).toEqual([{ unit: 'lb', quantity: 120 }])
  })

  it('removing a planting keeps its history and drops only open plans', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id, {
      plantingEvents: [
        event('pe_worked', [op('op_worked_fert'), harvestOp('op_worked_harvest')]),
        event('pe_partial', [harvestOp('op_partial_harvest')]),
        event('pe_planned', [op('op_planned_fert')]),
        event('pe_kept', [op('op_kept_fert'), op('op_kept_spray', { type: 'spray' })]),
      ],
    })
    await complete(token, farm.id, 'op_worked_harvest', HARVEST)
    // Day one of a multi-day harvest: logged, the labor itself still open.
    const partial = await request
      .post(`/api/v1/farms/${farm.id}/recommended-operations/op_partial_harvest/log-partial`)
      .set(auth(token))
      .send({ date: '2027-03-04', quantity: 40, unit: 'lb' })
    expect(partial.status).toBe(201)

    // The save carries one planting only, and one of its two plans.
    const loaded = await loadField(token, farm.id, field.id)
    const kept = loaded.plantingEvents.find((e: any) => e.id === 'pe_kept')
    const res = await patchField(token, farm.id, field.id, {
      plantingEvents: [{
        ...kept,
        operations: kept.operations.filter((o: any) => o.id !== 'op_kept_spray'),
      }],
    })
    expect(res.status).toBe(200)

    const stored = await prisma.plantingEvent.findMany({
      where: { fieldId: field.id },
      include: { recommended: true },
    })
    const recOpsOf = (id: string) =>
      stored.find(e => e.id === id)?.recommended.map(r => `${r.id}:${r.status}`)

    // Logged work: the planting stays with its record, its open plan goes.
    expect(recOpsOf('pe_worked')).toEqual(['op_worked_harvest:completed'])
    // A log entry points at it: the planting stays, with no plan left.
    expect(recOpsOf('pe_partial')).toEqual([])
    // Nothing recorded: the planting goes.
    expect(recOpsOf('pe_planned')).toBeUndefined()
    // Still in the payload: only the plan the payload dropped goes.
    expect(recOpsOf('pe_kept')).toEqual(['op_kept_fert:pending'])

    const logged = await prisma.operation.findMany({
      where: { fieldId: field.id },
      orderBy: { actualDate: 'asc' },
    })
    expect(logged.map(o => o.plantingEventId)).toEqual(['pe_partial', 'pe_worked'])
  })

  it('updates the plan of a checked-off labor without touching its record', async () => {
    const { token, farm, field } = await setupPlantedField()
    const done = await complete(token, farm.id, 'op_harvest', HARVEST)

    const loaded = await loadField(token, farm.id, field.id)
    const res = await patchField(token, farm.id, field.id, {
      plantingEvents: loaded.plantingEvents.map((e: any) => ({
        ...e,
        plantCount: 9,
        operations: e.operations.map((o: any) => ({
          ...o,
          labelEs: `${o.labelEs} (editado)`,
          recommendedDate: '2027-04-01',
          product: 'Urea',
          // None of these belong to a field save.
          status: 'pending',
          completedDate: null,
          completedOperationId: null,
          notes: 'reescrito',
          quantity: 1,
          unit: 'kg',
        })),
      })),
    })
    expect(res.status).toBe(200)

    const saved = res.body.data.field.plantingEvents[0]
    expect(saved.plantCount).toBe(9)
    expect(saved.operations.find((o: any) => o.id === 'op_harvest')).toMatchObject({
      labelEs: 'Cosecha (editado)',
      recommendedDate: '2027-04-01',
      status: 'completed',
      completedDate: '2027-03-05',
      completedOperationId: done.operation.id,
      notes: null,
      product: null,
      quantity: 120,
      unit: 'lb',
    })
    // An open labor takes the plan and its product, nothing else.
    expect(saved.operations.find((o: any) => o.id === 'op_fert')).toMatchObject({
      labelEs: 'Abono (editado)',
      recommendedDate: '2027-04-01',
      status: 'pending',
      product: 'Urea',
      notes: null,
      quantity: null,
      unit: null,
    })
  })

  it('keeps what the payload cannot carry: the simulated flag, an omitted recipe reference', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    await prisma.cropType.create({
      data: { id: 'platano', name: 'Plantain', nameEs: 'Plátano', isBuiltIn: true },
    })
    const recipe = await prisma.recipe.create({
      data: {
        cropTypeId: 'platano', authorUserId: null, name: 'Calendario base', visibility: 'public',
        versions: { create: { number: 1, harvestWindowStartDays: 240, harvestWindowEndDays: 330 } },
      },
      include: { versions: true },
    })
    const versionId = recipe.versions[0].id
    const field = await createTestField(token, farm.id, {
      plantingEvents: [event('pe_1', [op('op_fert')], { isSimulated: true, recipeVersionId: versionId })],
    })
    const stored = () => prisma.plantingEvent.findUnique({ where: { id: 'pe_1' } })

    // Neither key in the payload: both stay as stored.
    const omitted = await patchField(token, farm.id, field.id, {
      plantingEvents: [event('pe_1', [op('op_fert')], { plantCount: 7 })],
    })
    expect(omitted.status).toBe(200)
    expect(await stored()).toMatchObject({ plantCount: 7, isSimulated: true, recipeVersionId: versionId })

    // A reference the payload does carry decides — unknown ids degrade to none.
    const unknown = await patchField(token, farm.id, field.id, {
      plantingEvents: [event('pe_1', [op('op_fert')], { recipeVersionId: 'no-such-version' })],
    })
    expect(unknown.status).toBe(200)
    expect(await stored()).toMatchObject({ isSimulated: true, recipeVersionId: null })
  })

  it('stores a completedOperationId only when the operation is on this farm', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const stranger = await createTestUser()
    const otherFarm = await createTestFarm(stranger.token)
    const logEntry = { type: 'fertilization', actualDate: new Date('2026-07-02') }
    const own = await prisma.operation.create({ data: { farmId: farm.id, ...logEntry } })
    const foreign = await prisma.operation.create({ data: { farmId: otherFarm.id, ...logEntry } })

    const checkedOff = (id: string, completedOperationId: string) =>
      op(id, { status: 'completed', completedDate: '2026-07-02', completedOperationId })

    const field = await createTestField(token, farm.id, {
      plantingEvents: [
        event('pe_1', [checkedOff('op_own', own.id), checkedOff('op_foreign', foreign.id)]),
      ],
    })
    const created = field.plantingEvents[0].operations
    expect(created.find((o: any) => o.id === 'op_own').completedOperationId).toBe(own.id)
    expect(created.find((o: any) => o.id === 'op_foreign').completedOperationId).toBeNull()

    // The same holds for a recommendation a later save adds.
    const res = await patchField(token, farm.id, field.id, {
      plantingEvents: [{
        ...field.plantingEvents[0],
        operations: [...created, checkedOff('op_foreign_later', foreign.id)],
      }],
    })
    expect(res.status).toBe(200)
    const later = await prisma.recommendedOperation.findUnique({ where: { id: 'op_foreign_later' } })
    expect(later).toMatchObject({ status: 'completed', completedOperationId: null })
  })
})

describe('a field save replaces rows and plants', () => {
  it('keeps the free plants when only rows are sent', async () => {
    const { token, farm, field } = await setupPlantedField()

    const res = await patchField(token, farm.id, field.id, {
      rows: [row('row_new', ['plant_new'])],
    })

    expect(res.status).toBe(200)
    expect(res.body.data.field.rows.map((r: any) => r.id)).toEqual(['row_new'])
    expect(res.body.data.field.rows[0].plants.map((p: any) => p.id)).toEqual(['plant_new'])
    expect(res.body.data.field.freePlants.map((p: any) => p.id)).toEqual(['free_1'])
  })

  it('saves contour and straight rows together, and rows of any size', async () => {
    const { token, farm, field } = await setupPlantedField()
    const path = [
      { lat: 18.4655, lng: -66.1057 }, { lat: 18.4656, lng: -66.1056 }, { lat: 18.4657, lng: -66.1057 },
    ]
    const manyPlants = Array.from({ length: 2500 }, (_, i) => `plant_big_${i}`)

    const res = await patchField(token, farm.id, field.id, {
      rows: [
        row('row_straight', ['plant_s']),
        row('row_contour', ['plant_c'], { path, pathClosed: true }),
        row('row_big', manyPlants),
      ],
      freePlants: [plant('free_new')],
      plantingEvents: [
        event('pe_1', [op('op_fert')], {
          plantCount: 2503,
          rowIds: ['row_straight', 'row_contour', 'row_big'],
          freePlantIds: ['free_new'],
        }),
      ],
    })

    expect(res.status).toBe(200)
    const rows = res.body.data.field.rows
    // Rows come back in the order they were drawn.
    expect(rows.map((r: any) => r.id)).toEqual(['row_straight', 'row_contour', 'row_big'])
    const straight = rows.find((r: any) => r.id === 'row_straight')
    expect(straight.path).toBeUndefined()
    expect(straight.pathClosed).toBeUndefined()
    expect(rows.find((r: any) => r.id === 'row_contour')).toMatchObject({ path, pathClosed: true })
    expect(rows.find((r: any) => r.id === 'row_big').plants).toHaveLength(2500)
    expect(res.body.data.field.freePlants.map((p: any) => p.id)).toEqual(['free_new'])
    expect(res.body.data.field.plantingEvents[0].rowIds.sort())
      .toEqual(['row_big', 'row_contour', 'row_straight'])
    expect(await prisma.plantInstance.count({
      where: { fieldId: field.id, plantingEventId: 'pe_1' },
    })).toBe(2503)
  })
})

describe('a rejected save changes nothing', () => {
  it('answers 400 to an invalid date and leaves rows and plants as stored', async () => {
    const { token, farm, field } = await setupPlantedField()
    const before = await storedStructure(field.id)

    const res = await patchField(token, farm.id, field.id, {
      rows: [
        row('row_a', ['plant_a']),
        row('row_b', ['plant_b']),
        row('row_c', ['plant_c'], { plantingDate: 'ayer' }),
      ],
      freePlants: [],
    })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.message).toContain('rows[2].plantingDate')
    expect(await storedStructure(field.id)).toEqual(before)
  })

  it('answers 409 to an id owned by another field and leaves both fields as stored', async () => {
    const { token, farm, field } = await setupPlantedField()
    const other = await createTestField(token, farm.id, {
      name: 'Campo vecino',
      rows: [row('row_other', ['plant_other'])],
      plantingEvents: [event('pe_other', [op('op_other')])],
    })
    const before = await storedStructure(field.id)
    const otherBefore = await storedStructure(other.id)

    // The collision sits in the LAST plant, after everything else was written.
    const plantClash = await patchField(token, farm.id, field.id, {
      rows: [row('row_a', ['plant_a']), row('row_b', ['plant_b', 'plant_other'])],
      freePlants: [],
    })
    expect(plantClash.status).toBe(409)
    expect(plantClash.body.error.code).toBe('CONFLICT')

    const eventClash = await patchField(token, farm.id, field.id, {
      rows: [row('row_a', ['plant_a'])],
      freePlants: [],
      plantingEvents: [event('pe_other', [op('op_stolen')], { plantCount: 99 })],
    })
    expect(eventClash.status).toBe(409)
    expect(eventClash.body.error.code).toBe('CONFLICT')

    expect(await storedStructure(field.id)).toEqual(before)
    expect(await storedStructure(other.id)).toEqual(otherBefore)
    const otherEvent = await prisma.plantingEvent.findUnique({
      where: { id: 'pe_other' },
      include: { recommended: true },
    })
    expect(otherEvent).toMatchObject({ fieldId: other.id, plantCount: 4 })
    expect(otherEvent!.recommended.map(r => r.id)).toEqual(['op_other'])
    expect(await prisma.plantingEvent.count({ where: { fieldId: field.id } })).toBe(1)
  })

  it('answers 409 to a colliding create and leaves no orphan field', async () => {
    const { token, farm } = await setupPlantedField()

    const res = await request
      .post(`/api/v1/farms/${farm.id}/fields`)
      .set(auth(token))
      .send({
        name: 'Campo repetido', color: '#22c55e', shape: 'rectangle',
        farmLat: 18.4655, farmLng: -66.1057,
        rows: [row('row_new', ['plant_new']), row('row_1', ['plant_x'])],
        freePlants: [plant('free_new')],
      })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
    expect(await prisma.field.count({ where: { farmId: farm.id } })).toBe(1)
    expect(await prisma.fieldRow.count({ where: { id: 'row_new' } })).toBe(0)
    expect(await prisma.plantInstance.count({ where: { id: 'free_new' } })).toBe(0)
  })

  it('answers 400, not 500, when rows is not a list', async () => {
    const { token, farm, field } = await setupPlantedField()
    const before = await storedStructure(field.id)

    const res = await patchField(token, farm.id, field.id, { rows: 'abc' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(await storedStructure(field.id)).toEqual(before)
  })

  it.each([
    ['a fractional plantCount', 'plantingEvents[0].plantCount',
      { plantingEvents: [event('pe_1', [], { plantCount: 2.5 })] }],
    ['a negative plantCount', 'plantingEvents[0].plantCount',
      { plantingEvents: [event('pe_1', [], { plantCount: -1 })] }],
    ['a zero spacing', 'rows[0].spacingFt',
      { rows: [row('row_a', [], { spacingFt: 0 })] }],
    ['a spacing beyond the column', 'rows[0].spacingFt',
      { rows: [row('row_a', [], { spacingFt: 10000 })] }],
    ['an unknown status', 'plantingEvents[0].operations[0].status',
      { plantingEvents: [event('pe_1', [op('op_a', { status: 'hecho' })])] }],
    ['an invalid completedDate', 'plantingEvents[0].operations[0].completedDate',
      { plantingEvents: [event('pe_1', [op('op_a', { completedDate: 'ayer' })])] }],
    ['an invalid plant date', 'rows[0].plants[1].plantingDate',
      { rows: [row('row_a', ['plant_a', 'plant_b'])].map(r => ({
        ...r, plants: [r.plants[0], { ...r.plants[1], plantingDate: '2026-13-45' }],
      })) }],
    ['a repeated row id', 'rows[1].id',
      { rows: [row('row_a', ['plant_a']), row('row_a', ['plant_b'])] }],
    ['a plant id repeated between a row and the free plants', 'freePlants[0].id',
      { rows: [row('row_a', ['plant_a'])], freePlants: [plant('plant_a')] }],
    ['a repeated planting id', 'plantingEvents[1].id',
      { plantingEvents: [event('pe_1', []), event('pe_1', [])] }],
    ['an operation id repeated across plantings', 'plantingEvents[1].operations[0].id',
      { plantingEvents: [event('pe_1', [op('op_a')]), event('pe_2', [op('op_a')])] }],
  ])('answers 400 to %s', async (_case, path, body) => {
    const { token, farm, field } = await setupPlantedField()
    const before = await storedStructure(field.id)

    const res = await patchField(token, farm.id, field.id, body)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.message).toContain(path)
    expect(await storedStructure(field.id)).toEqual(before)
    expect(await prisma.recommendedOperation.count()).toBe(2)
  })
})
