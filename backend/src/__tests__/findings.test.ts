import { request, createTestUser, createTestFarm, createTestField, cleanDatabase } from './helpers'

beforeEach(async () => { await cleanDatabase() })

async function createFinding(token: string, farmId: string, fieldId: string, severity = 2) {
  const res = await request
    .post(`/api/v1/farms/${farmId}/findings`)
    .set('Authorization', `Bearer ${token}`)
    .send({ fieldId, pestId: 'pulgones', severity })
  return res
}

describe('POST /api/v1/farms/:farmId/findings', () => {
  it('creates a finding on a field', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)

    const res = await createFinding(token, farm.id, field.id)

    expect(res.status).toBe(201)
    expect(res.body.data.id).toBeDefined()
    expect(res.body.data.pestId).toBe('pulgones')
    expect(res.body.data.status).toBe('open')
  })

  it('rejects missing required fields', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/findings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pestId: 'pulgones' })

    expect(res.status).toBe(400)
  })

  it('rejects creation on another user farm', async () => {
    const user1 = await createTestUser()
    const user2 = await createTestUser()
    const farm = await createTestFarm(user1.token)
    const field = await createTestField(user1.token, farm.id)

    const res = await createFinding(user2.token, farm.id, field.id)
    expect(res.status).toBe(404)
  })
})

describe('GET /api/v1/farms/:farmId/findings', () => {
  it('lists findings for the farm', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)
    await createFinding(token, farm.id, field.id, 1)
    await createFinding(token, farm.id, field.id, 3)

    const res = await request
      .get(`/api/v1/farms/${farm.id}/findings`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })
})

describe('finding lifecycle', () => {
  it('patches status, appends observations, deletes', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)
    const created = await createFinding(token, farm.id, field.id)
    const findingId = created.body.data.id

    const treated = await request
      .patch(`/api/v1/farms/${farm.id}/findings/${findingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'treated' })
    expect(treated.status).toBe(200)
    expect(treated.body.data.status).toBe('treated')

    const observed = await request
      .post(`/api/v1/farms/${farm.id}/findings/${findingId}/observations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ severity: 3, notes: 'Se extendió a la hilera vecina' })
    expect(observed.status).toBe(201)

    const deleted = await request
      .delete(`/api/v1/farms/${farm.id}/findings/${findingId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleted.status).toBe(200)

    const list = await request
      .get(`/api/v1/farms/${farm.id}/findings`)
      .set('Authorization', `Bearer ${token}`)
    expect(list.body.data).toHaveLength(0)
  })
})

describe('POST /findings/:id/create-operation', () => {
  it('schedules the treatment for the chosen date, not today', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)
    const finding = await createFinding(token, farm.id, field.id)

    const { prisma } = await import('./helpers')
    const event = await prisma.plantingEvent.create({
      data: { fieldId: field.id, cropTypeId: 'platano', plantingDate: new Date('2026-06-01'), plantCount: 5 },
    })

    const res = await request
      .post(`/api/v1/farms/${farm.id}/findings/${finding.body.data.id}/create-operation`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        plantingEventId: event.id,
        labelEs: 'Tratamiento — pulgones',
        type: 'spray',
        recommendedDate: '2026-09-15',
      })

    expect(res.status).toBe(201)
    expect(res.body.data.recommendedOperation.recommendedDate).toBe('2026-09-15')
    expect(res.body.data.recommendedOperation.status).toBe('pending')
  })
})
