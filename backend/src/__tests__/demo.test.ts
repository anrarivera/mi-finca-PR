import request from 'supertest'
import app from '../index'
import { prisma } from '../lib/prisma'

describe('POST /api/v1/auth/demo', () => {
  it('creates a signed-in ephemeral account with a seeded farm', async () => {
    const res = await request(app).post('/api/v1/auth/demo')

    expect(res.status).toBe(201)
    expect(res.body.data.accessToken).toBeTruthy()
    expect(res.body.data.user.isDemo).toBe(true)

    const token = res.body.data.accessToken

    // The seeded farm is there, complete enough for the guided tour.
    const farms = await request(app)
      .get('/api/v1/farms')
      .set('Authorization', `Bearer ${token}`)
    expect(farms.status).toBe(200)
    expect(farms.body.data).toHaveLength(1)
    const farm = farms.body.data[0]
    expect(farm.name).toBe('Finca Demostración')
    expect(farm.boundary.length).toBeGreaterThanOrEqual(3)

    const fields = await request(app)
      .get(`/api/v1/farms/${farm.id}/fields`)
      .set('Authorization', `Bearer ${token}`)
    expect(fields.status).toBe(200)
    expect(fields.body.data.fields).toHaveLength(3) // plátanos, café, gallinero
    const platanos = fields.body.data.fields.find((f: any) => f.name === 'Los Plátanos')
    expect(platanos.rows).toHaveLength(6)
    expect(platanos.plantingEvents[0].operations.length).toBeGreaterThanOrEqual(4)

    // The overdue check-off hook exists.
    const due = await request(app)
      .get(`/api/v1/farms/${farm.id}/recommended-operations/due-soon`)
      .set('Authorization', `Bearer ${token}`)
    expect(due.body.data.overdueCount).toBeGreaterThanOrEqual(1)

    // Sanidad and the production ledger have content.
    const findings = await request(app)
      .get(`/api/v1/farms/${farm.id}/findings`)
      .set('Authorization', `Bearer ${token}`)
    expect(findings.body.data.length).toBeGreaterThanOrEqual(1)

    const harvests = await request(app)
      .get(`/api/v1/farms/${farm.id}/harvests`)
      .set('Authorization', `Bearer ${token}`)
    expect(harvests.body.data.length).toBeGreaterThanOrEqual(3)
  })

  it('demo accounts cannot log in with a password', async () => {
    const res = await request(app).post('/api/v1/auth/demo')
    const email = res.body.data.user.email

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'whatever123' })
    expect(login.status).toBeGreaterThanOrEqual(400)
  })

  it('purge criteria matches only stale demo users', async () => {
    const res = await request(app).post('/api/v1/auth/demo')
    const userId = res.body.data.user.id

    // Fresh demo user: not matched by the purge window.
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const stale = await prisma.user.findMany({
      where: { isDemo: true, createdAt: { lt: cutoff } },
      select: { id: true },
    })
    expect(stale.map(u => u.id)).not.toContain(userId)

    // Backdate it — now it is matched.
    await prisma.user.update({ where: { id: userId }, data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } })
    const stale2 = await prisma.user.findMany({
      where: { isDemo: true, createdAt: { lt: cutoff } },
      select: { id: true },
    })
    expect(stale2.map(u => u.id)).toContain(userId)
  })
})
