import {
  request, createTestUser, createTestFarm, createTestField,
  addFarmMember, seedRecommendedOp, cleanDatabase,
} from './helpers'

beforeEach(async () => { await cleanDatabase() })

async function createCorral(token: string, farmId: string, name = 'Corral Norte') {
  const res = await request
    .post(`/api/v1/farms/${farmId}/fields`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      name, kind: 'livestock', color: '#b8860b', shape: 'rectangle',
      farmLat: 18.4655, farmLng: -66.1057,
    })
  return res.body.data?.field
}

async function createHerd(token: string, farmId: string, overrides?: object) {
  const res = await request
    .post(`/api/v1/farms/${farmId}/livestock`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Gallinas ponedoras', animalType: 'chickens',
      currentCount: 12, acquisitionDate: '2026-05-01',
      ...overrides,
    })
  return res
}

describe('livestock fields (corrales)', () => {
  it('creates a livestock-kind field and assigns a herd to it', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const corral = await createCorral(token, farm.id)
    expect(corral.kind).toBe('livestock')

    const herd = await createHerd(token, farm.id, { fieldId: corral.id })
    expect(herd.status).toBe(201)
    expect(herd.body.data.fieldId).toBe(corral.id)
  })

  it('rejects assigning a herd to a crops field or a foreign field', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const cropsField = await createTestField(token, farm.id) // kind defaults to crops

    const res = await createHerd(token, farm.id, { fieldId: cropsField.id })
    expect(res.status).toBe(400)
  })

  it('moves a herd between corrales (pasture rotation) and can clear it', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const a = await createCorral(token, farm.id, 'Pastizal A')
    const b = await createCorral(token, farm.id, 'Pastizal B')
    const herd = await createHerd(token, farm.id, { fieldId: a.id })

    const moved = await request
      .patch(`/api/v1/farms/${farm.id}/livestock/${herd.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fieldId: b.id })
    expect(moved.status).toBe(200)
    expect(moved.body.data.fieldId).toBe(b.id)

    const cleared = await request
      .patch(`/api/v1/farms/${farm.id}/livestock/${herd.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fieldId: null })
    expect(cleared.body.data.fieldId).toBeNull()
  })

  it('rejects invalid field kind on creation', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const res = await request
      .post(`/api/v1/farms/${farm.id}/fields`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Raro', kind: 'aquarium', color: '#fff', shape: 'rectangle',
        farmLat: 18.4655, farmLng: -66.1057,
      })
    expect(res.status).toBe(400)
  })
})

describe('POST /livestock/:id/production', () => {
  it('logs renewable production (eggs): yield in the unified ledger, count unchanged', async () => {
    const owner = await createTestUser()
    const operator = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await addFarmMember(farm.id, operator.userId, 'operator')
    const herd = await createHerd(owner.token, farm.id)

    // Operator work — the livestock parallel of a harvest check-off
    const res = await request
      .post(`/api/v1/farms/${farm.id}/livestock/${herd.body.data.id}/production`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ productId: 'eggs', quantity: 10, unit: 'unidades', date: '2026-08-01' })

    expect(res.status).toBe(201)
    expect(res.body.data.currentCount).toBe(12) // eggs don't shrink the flock

    const harvests = await request
      .get(`/api/v1/farms/${farm.id}/harvests`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(harvests.body.data).toHaveLength(1)
    expect(harvests.body.data[0].productId).toBe('eggs')
    expect(harvests.body.data[0].livestockUnitId).toBe(herd.body.data.id)

    const ops = await request
      .get(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(ops.body.data).toHaveLength(1)
    expect(ops.body.data[0].performedByUserId).toBe(operator.userId)
  })

  it('meat production decrements the herd with a reason, atomically', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const herd = await createHerd(token, farm.id)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/livestock/${herd.body.data.id}/production`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: 'meat', quantity: 18, unit: 'lb', date: '2026-08-01',
        headCount: 3, countReason: 'slaughtered',
      })

    expect(res.status).toBe(201)
    expect(res.body.data.currentCount).toBe(9)
  })

  it('rejects meat without headCount, over-slaughter, and wrong products', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const herd = await createHerd(token, farm.id)
    const base = `/api/v1/farms/${farm.id}/livestock/${herd.body.data.id}/production`

    const noHead = await request.post(base)
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'meat', quantity: 5, unit: 'lb', date: '2026-08-01' })
    expect(noHead.status).toBe(400)

    const tooMany = await request.post(base)
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'meat', quantity: 5, unit: 'lb', date: '2026-08-01', headCount: 50 })
    expect(tooMany.status).toBe(400)

    // Chickens don't give milk
    const wrongProduct = await request.post(base)
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'milk', quantity: 5, unit: 'L', date: '2026-08-01' })
    expect(wrongProduct.status).toBe(400)
  })
})

describe('production revenue', () => {
  it('stores revenue on animal production and returns it in the ledger', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const herd = await createHerd(token, farm.id)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/livestock/${herd.body.data.id}/production`)
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'eggs', quantity: 30, unit: 'unidades', date: '2026-08-02', revenue: 12.5 })
    expect(res.status).toBe(201)

    const ledger = await request
      .get(`/api/v1/farms/${farm.id}/harvests`)
      .set('Authorization', `Bearer ${token}`)
    expect(ledger.body.data[0].revenue).toBe(12.5)
  })

  it('stores revenue on a harvest check-off and allows editing it later', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)
    const { recOp } = await seedRecommendedOp(field.id, { type: 'harvest' })

    const done = await request
      .post(`/api/v1/farms/${farm.id}/recommended-operations/${recOp.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ completedDate: '2026-08-02', quantity: 40, unit: 'lb', revenue: 30 })
    expect(done.status).toBe(201)

    const ledger = await request
      .get(`/api/v1/farms/${farm.id}/harvests`)
      .set('Authorization', `Bearer ${token}`)
    expect(ledger.body.data).toHaveLength(1)
    expect(ledger.body.data[0].revenue).toBe(30)

    const patched = await request
      .patch(`/api/v1/farms/${farm.id}/harvests/${ledger.body.data[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ revenue: 35.5 })
    expect(patched.status).toBe(200)
    expect(patched.body.data.revenue).toBe(35.5)
  })

  it('rejects negative revenue and leaves it null when omitted', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const herd = await createHerd(token, farm.id)
    const base = `/api/v1/farms/${farm.id}/livestock/${herd.body.data.id}/production`

    const bad = await request.post(base)
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'eggs', quantity: 5, unit: 'unidades', date: '2026-08-02', revenue: -3 })
    expect(bad.status).toBe(400)

    const ok = await request.post(base)
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'eggs', quantity: 5, unit: 'unidades', date: '2026-08-02' })
    expect(ok.status).toBe(201)

    const ledger = await request
      .get(`/api/v1/farms/${farm.id}/harvests`)
      .set('Authorization', `Bearer ${token}`)
    expect(ledger.body.data[0].revenue).toBeNull()
  })
})
