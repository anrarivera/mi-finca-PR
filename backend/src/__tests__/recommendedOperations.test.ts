import {
  request, prisma, createTestUser, createTestFarm, createTestField,
  seedRecommendedOp, cleanDatabase,
} from './helpers'

beforeEach(async () => { await cleanDatabase() })

describe('GET /api/v1/farms/:farmId/recommended-operations', () => {
  it('requires authentication', async () => {
    const res = await request.get('/api/v1/farms/some-id/recommended-operations')
    expect(res.status).toBe(401)
  })

  it('lists seeded recommendations', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)
    await seedRecommendedOp(field.id)

    const res = await request
      .get(`/api/v1/farms/${farm.id}/recommended-operations`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].labelEs).toBe('Fertilización de prueba')
  })

  it('does not leak another user recommendations', async () => {
    const user1 = await createTestUser()
    const user2 = await createTestUser()
    const farm = await createTestFarm(user1.token)
    const field = await createTestField(user1.token, farm.id)
    await seedRecommendedOp(field.id)

    const res = await request
      .get(`/api/v1/farms/${farm.id}/recommended-operations`)
      .set('Authorization', `Bearer ${user2.token}`)

    expect(res.status).toBe(404)
  })
})

describe('GET /api/v1/farms/:farmId/recommended-operations/due-soon', () => {
  it('splits overdue and due-soon counts', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)
    // Dates RELATIVE to today — hardcoded dates rotted (a date "inside
    // the 14-day window" became overdue as real time passed).
    const daysFromNow = (n: number) => {
      const d = new Date()
      d.setDate(d.getDate() + n)
      return d.toISOString().split('T')[0]
    }
    // One clearly overdue, one inside the 14-day window
    await seedRecommendedOp(field.id, { recommendedDate: daysFromNow(-10) })
    await seedRecommendedOp(field.id, { recommendedDate: daysFromNow(7) })

    const res = await request
      .get(`/api/v1/farms/${farm.id}/recommended-operations/due-soon`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.overdueCount).toBe(1)
    expect(res.body.data.dueSoonCount).toBe(1)
    expect(res.body.data.operations).toHaveLength(2)
  })
})

describe('POST /api/v1/farms/:farmId/recommended-operations/:id/complete', () => {
  it('completes the recommendation and writes an operations-log entry', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)
    const { recOp } = await seedRecommendedOp(field.id)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/recommended-operations/${recOp.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ completedDate: '2026-08-01', notes: 'Hecho' })

    expect(res.status).toBe(201)

    const list = await request
      .get(`/api/v1/farms/${farm.id}/recommended-operations`)
      .set('Authorization', `Bearer ${token}`)
    expect(list.body.data[0].status).toBe('completed')

    const ops = await request
      .get(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${token}`)
    expect(ops.body.data).toHaveLength(1)
  })

  it('404s for a recommendation on another user farm', async () => {
    const user1 = await createTestUser()
    const user2 = await createTestUser()
    const farm = await createTestFarm(user1.token)
    const field = await createTestField(user1.token, farm.id)
    const { recOp } = await seedRecommendedOp(field.id)
    const farm2 = await createTestFarm(user2.token)

    const res = await request
      .post(`/api/v1/farms/${farm2.id}/recommended-operations/${recOp.id}/complete`)
      .set('Authorization', `Bearer ${user2.token}`)
      .send({ completedDate: '2026-08-01' })

    expect(res.status).toBe(404)
  })
})

describe('POST /api/v1/farms/:farmId/recommended-operations/:id/skip + /undo', () => {
  it('skips a recommendation, then undo restores it', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)
    const { recOp } = await seedRecommendedOp(field.id)

    const skipped = await request
      .post(`/api/v1/farms/${farm.id}/recommended-operations/${recOp.id}/skip`)
      .set('Authorization', `Bearer ${token}`)
    expect(skipped.status).toBe(200)
    expect(skipped.body.data.status).toBe('skipped')

    const undone = await request
      .post(`/api/v1/farms/${farm.id}/recommended-operations/${recOp.id}/undo`)
      .set('Authorization', `Bearer ${token}`)
    expect(undone.status).toBe(200)
    expect(['pending', 'due']).toContain(undone.body.data.status)
  })
})

// completedOperationId is stored as the field save sent it, so it can name
// a log entry of ANY farm — undo may only delete inside the farm in the URL.
describe('POST /api/v1/farms/:farmId/recommended-operations/:id/undo — completed check-offs', () => {
  it('deletes the completing log entry and soft-deletes its yield', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)
    const { recOp } = await seedRecommendedOp(field.id, { type: 'harvest' })

    const done = await request
      .post(`/api/v1/farms/${farm.id}/recommended-operations/${recOp.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ completedDate: '2026-08-01', quantity: 40, unit: 'lb' })
    expect(done.status).toBe(201)
    const operationId = done.body.data.operation.id

    const undone = await request
      .post(`/api/v1/farms/${farm.id}/recommended-operations/${recOp.id}/undo`)
      .set('Authorization', `Bearer ${token}`)
    expect(undone.status).toBe(200)
    expect(['pending', 'due']).toContain(undone.body.data.status)
    expect(undone.body.data.completedOperationId).toBeNull()

    expect(await prisma.operation.findUnique({ where: { id: operationId } })).toBeNull()
    const yields = await prisma.harvestYield.findMany({ where: { farmId: farm.id } })
    expect(yields).toHaveLength(1)
    expect(yields[0].deletedAt).not.toBeNull()
  })

  it('leaves a log entry of another farm untouched', async () => {
    const victim = await createTestUser()
    const victimFarm = await createTestFarm(victim.token)
    const logged = await request
      .post(`/api/v1/farms/${victimFarm.id}/operations`)
      .set('Authorization', `Bearer ${victim.token}`)
      .send({ type: 'harvest', actualDate: '2026-08-01', quantity: 40, unit: 'lb', cropTypeId: 'platano' })
    expect(logged.status).toBe(201)
    const victimOperationId = logged.body.data.id

    const caller = await createTestUser()
    const farm = await createTestFarm(caller.token)
    const field = await createTestField(caller.token, farm.id)
    const { recOp } = await seedRecommendedOp(field.id, { status: 'completed' })
    // The stored state a crafted field save leaves behind.
    await prisma.recommendedOperation.update({
      where: { id: recOp.id },
      data: { completedDate: new Date('2026-08-01'), completedOperationId: victimOperationId },
    })

    const undone = await request
      .post(`/api/v1/farms/${farm.id}/recommended-operations/${recOp.id}/undo`)
      .set('Authorization', `Bearer ${caller.token}`)
    expect(undone.status).toBe(200)
    expect(['pending', 'due']).toContain(undone.body.data.status)
    expect(undone.body.data.completedOperationId).toBeNull()

    expect(await prisma.operation.findUnique({ where: { id: victimOperationId } })).not.toBeNull()
    const victimYields = await prisma.harvestYield.findMany({ where: { farmId: victimFarm.id } })
    expect(victimYields).toHaveLength(1)
    expect(victimYields[0].deletedAt).toBeNull()
    expect(victimYields[0].operationId).toBe(victimOperationId)
  })
})
