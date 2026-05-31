import { request, createTestUser, createTestFarm, cleanDatabase } from './helpers'

beforeEach(async () => { await cleanDatabase() })

describe('POST /api/v1/farms', () => {
  it('creates a farm for authenticated user', async () => {
    const { token } = await createTestUser()

    const res = await request
      .post('/api/v1/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mi Finca', location: 'Aguadilla, PR' })

    expect(res.status).toBe(201)
    expect(res.body.data.farm.name).toBe('Mi Finca')
    expect(res.body.data.farm.id).toBeDefined()
  })

  it('rejects unauthenticated request', async () => {
    const res = await request
      .post('/api/v1/farms')
      .send({ name: 'Mi Finca', location: 'Aguadilla, PR' })

    expect(res.status).toBe(401)
  })
})

describe('GET /api/v1/farms', () => {
  it('returns only the requesting user farms', async () => {
    const user1 = await createTestUser({ email: 'user1@test.com' })
    const user2 = await createTestUser({ email: 'user2@test.com' })

    await createTestFarm(user1.token, { name: 'Finca User 1' })
    await createTestFarm(user2.token, { name: 'Finca User 2' })

    const res = await request
      .get('/api/v1/farms')
      .set('Authorization', `Bearer ${user1.token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.farms).toHaveLength(1)
    expect(res.body.data.farms[0].name).toBe('Finca User 1')
  })
})

describe('PATCH /api/v1/farms/:id', () => {
  it('updates farm name', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)

    const res = await request
      .patch(`/api/v1/farms/${farm.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nombre Actualizado' })

    expect(res.status).toBe(200)
    expect(res.body.data.farm.name).toBe('Nombre Actualizado')
  })

  it('prevents updating another user farm', async () => {
    const user1 = await createTestUser({ email: 'user1@test.com' })
    const user2 = await createTestUser({ email: 'user2@test.com' })
    const farm = await createTestFarm(user1.token)

    const res = await request
      .patch(`/api/v1/farms/${farm.id}`)
      .set('Authorization', `Bearer ${user2.token}`)
      .send({ name: 'Hacked' })

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/v1/farms/:id', () => {
  it('soft deletes a farm', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)

    const res = await request
      .delete(`/api/v1/farms/${farm.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)

    // Should not appear in list anymore
    const listRes = await request
      .get('/api/v1/farms')
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.body.data.farms).toHaveLength(0)
  })
})