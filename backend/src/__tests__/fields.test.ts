import { request, createTestUser, createTestFarm, createTestField, cleanDatabase } from './helpers'

beforeEach(async () => { await cleanDatabase() })

describe('POST /api/v1/farms/:farmId/fields', () => {
  it('creates a field for authenticated user', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/fields`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Parcela Norte',
        color: '#22c55e',
        shape: 'rectangle',
        widthFt: 50,
        heightFt: 80,
        farmLat: 18.4655,
        farmLng: -66.1057,
      })

    expect(res.status).toBe(201)
    expect(res.body.data.field.name).toBe('Parcela Norte')
    expect(res.body.data.field.id).toBeDefined()
  })

  it('rejects missing required fields', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/fields`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Parcela Norte' }) // missing required fields

    expect(res.status).toBe(400)
  })

  it('rejects field creation on another user farm', async () => {
    const user1 = await createTestUser({ email: 'user1@test.com' })
    const user2 = await createTestUser({ email: 'user2@test.com' })
    const farm = await createTestFarm(user1.token)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/fields`)
      .set('Authorization', `Bearer ${user2.token}`)
      .send({
        name: 'Parcela Hacked',
        color: '#22c55e',
        shape: 'rectangle',
        widthFt: 50,
        heightFt: 80,
        farmLat: 18.4655,
        farmLng: -66.1057,
      })

    expect(res.status).toBe(404)
  })
})

describe('GET /api/v1/farms/:farmId/fields', () => {
  it('returns all fields for a farm', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)

    await createTestField(token, farm.id, { name: 'Campo 1' })
    await createTestField(token, farm.id, { name: 'Campo 2' })

    const res = await request
      .get(`/api/v1/farms/${farm.id}/fields`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.fields).toHaveLength(2)
  })

  it('does not return deleted fields', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)

    await request
      .delete(`/api/v1/farms/${farm.id}/fields/${field.id}`)
      .set('Authorization', `Bearer ${token}`)

    const res = await request
      .get(`/api/v1/farms/${farm.id}/fields`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.body.data.fields).toHaveLength(0)
  })
})

describe('PATCH /api/v1/farms/:farmId/fields/:id', () => {
  it('updates a field', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)

    const res = await request
      .patch(`/api/v1/farms/${farm.id}/fields/${field.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nombre Nuevo' })

    expect(res.status).toBe(200)
    expect(res.body.data.field.name).toBe('Nombre Nuevo')
  })

  it('prevents updating a field on another user farm', async () => {
    const user1 = await createTestUser({ email: 'user1@test.com' })
    const user2 = await createTestUser({ email: 'user2@test.com' })
    const farm = await createTestFarm(user1.token)
    const field = await createTestField(user1.token, farm.id)

    const res = await request
      .patch(`/api/v1/farms/${farm.id}/fields/${field.id}`)
      .set('Authorization', `Bearer ${user2.token}`)
      .send({ name: 'Hacked' })

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/v1/farms/:farmId/fields/:id', () => {
  it('soft deletes a field', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)

    const res = await request
      .delete(`/api/v1/farms/${farm.id}/fields/${field.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.success).toBe(true)
  })

  it('returns 404 for already deleted field', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)

    await request
      .delete(`/api/v1/farms/${farm.id}/fields/${field.id}`)
      .set('Authorization', `Bearer ${token}`)

    const res = await request
      .delete(`/api/v1/farms/${farm.id}/fields/${field.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })
})