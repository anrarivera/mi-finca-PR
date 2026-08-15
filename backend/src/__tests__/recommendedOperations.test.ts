import {
  request, createTestUser, createTestFarm, createTestField,
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
