import { request, createTestUser, createTestFarm, cleanDatabase } from './helpers'

beforeEach(async () => { await cleanDatabase() })

describe('/api/v1/farms/:farmId/harvests', () => {
  it('creates and lists a harvest yield', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)

    const created = await request
      .post(`/api/v1/farms/${farm.id}/harvests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cropTypeId: 'platano', quantity: 40, unit: 'lb', harvestDate: '2026-07-20' })
    expect(created.status).toBe(201)
    expect(created.body.data.quantity).toBe(40)

    const list = await request
      .get(`/api/v1/farms/${farm.id}/harvests`)
      .set('Authorization', `Bearer ${token}`)
    expect(list.status).toBe(200)
    expect(list.body.data).toHaveLength(1)
  })

  it('rejects missing fields', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/harvests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cropTypeId: 'platano' })
    expect(res.status).toBe(400)
  })

  it('rejects access to another user farm', async () => {
    const user1 = await createTestUser()
    const user2 = await createTestUser()
    const farm = await createTestFarm(user1.token)

    const res = await request
      .get(`/api/v1/farms/${farm.id}/harvests`)
      .set('Authorization', `Bearer ${user2.token}`)
    expect(res.status).toBe(404)
  })
})

describe('/api/v1/farms/:farmId/livestock', () => {
  it('creates, updates, and lists a livestock unit', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)

    const created = await request
      .post(`/api/v1/farms/${farm.id}/livestock`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Gallinas ponedoras', animalType: 'chicken',
        currentCount: 12, acquisitionDate: '2026-05-01',
      })
    expect(created.status).toBe(201)
    const unitId = created.body.data.id

    const patched = await request
      .patch(`/api/v1/farms/${farm.id}/livestock/${unitId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentCount: 15 })
    expect(patched.status).toBe(200)
    expect(patched.body.data.currentCount).toBe(15)

    const list = await request
      .get(`/api/v1/farms/${farm.id}/livestock`)
      .set('Authorization', `Bearer ${token}`)
    expect(list.status).toBe(200)
    expect(list.body.data).toHaveLength(1)
  })

  it('rejects creation on another user farm', async () => {
    const user1 = await createTestUser()
    const user2 = await createTestUser()
    const farm = await createTestFarm(user1.token)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/livestock`)
      .set('Authorization', `Bearer ${user2.token}`)
      .send({
        name: 'Cabras', animalType: 'goat',
        currentCount: 3, acquisitionDate: '2026-05-01',
      })
    expect(res.status).toBe(404)
  })
})
