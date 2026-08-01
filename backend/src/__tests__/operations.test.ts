import { request, createTestUser, createTestFarm, createTestField, cleanDatabase } from './helpers'

beforeEach(async () => { await cleanDatabase() })

describe('POST /api/v1/farms/:farmId/operations', () => {
  it('creates a standalone operation', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'fertilization', actualDate: '2026-07-15', notes: 'Abono 10-10-10' })

    expect(res.status).toBe(201)
    expect(res.body.data.id).toBeDefined()
    expect(res.body.data.type).toBe('fertilization')
    expect(res.body.data.actualDate).toBe('2026-07-15')
  })

  it('rejects an invalid operation type', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'partying', actualDate: '2026-07-15' })

    expect(res.status).toBe(400)
  })

  it('rejects a fieldId that belongs to another farm', async () => {
    const { token } = await createTestUser()
    const farm1 = await createTestFarm(token, { name: 'Finca 1' })
    const farm2 = await createTestFarm(token, { name: 'Finca 2' })
    const foreignField = await createTestField(token, farm2.id)

    const res = await request
      .post(`/api/v1/farms/${farm1.id}/operations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'irrigation', actualDate: '2026-07-15', fieldId: foreignField.id })

    expect(res.status).toBe(404)
  })

  it('rejects creation on another user farm', async () => {
    const user1 = await createTestUser()
    const user2 = await createTestUser()
    const farm = await createTestFarm(user1.token)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${user2.token}`)
      .send({ type: 'irrigation', actualDate: '2026-07-15' })

    expect(res.status).toBe(404)
  })

  it('mirrors a harvest with quantity into harvest yields', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'harvest', actualDate: '2026-07-20',
        fieldId: field.id, cropTypeId: 'platano', quantity: 25, unit: 'lb',
      })
    expect(res.status).toBe(201)

    const harvests = await request
      .get(`/api/v1/farms/${farm.id}/harvests`)
      .set('Authorization', `Bearer ${token}`)
    expect(harvests.status).toBe(200)
    expect(harvests.body.data).toHaveLength(1)
    expect(harvests.body.data[0].cropTypeId).toBe('platano')
  })
})

describe('GET /api/v1/farms/:farmId/operations', () => {
  it('requires authentication', async () => {
    const res = await request.get('/api/v1/farms/some-id/operations')
    expect(res.status).toBe(401)
  })

  it('lists operations for the farm', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)

    await request
      .post(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'irrigation', actualDate: '2026-07-10' })
    await request
      .post(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'monitoring', actualDate: '2026-07-11' })

    const res = await request
      .get(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })
})

describe('PATCH + DELETE /api/v1/farms/:farmId/operations/:id', () => {
  it('updates then deletes an operation', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)

    const created = await request
      .post(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'irrigation', actualDate: '2026-07-10' })
    const opId = created.body.data.id

    const patched = await request
      .patch(`/api/v1/farms/${farm.id}/operations/${opId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Riego por goteo' })
    expect(patched.status).toBe(200)
    expect(patched.body.data.notes).toBe('Riego por goteo')

    const deleted = await request
      .delete(`/api/v1/farms/${farm.id}/operations/${opId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleted.status).toBe(200)

    const list = await request
      .get(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${token}`)
    expect(list.body.data).toHaveLength(0)
  })
})
