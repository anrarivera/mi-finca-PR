import request from 'supertest'
import app from '../index'
import { prisma } from '../lib/prisma'

// The backup contract: export EVERYTHING → clear → restore → identical
// counts, with internal links (check-offs, yields, findings) intact.
// The demo seeder provides a maximally-linked farm to roundtrip.
describe('backup export / clear / restore', () => {
  async function demoAccount() {
    const res = await request(app).post('/api/v1/auth/demo')
    return { token: res.body.data.accessToken as string, userId: res.body.data.user.id as string }
  }

  async function counts(userId: string) {
    const farms = await prisma.farm.count({ where: { userId } })
    const fields = await prisma.field.count({ where: { farm: { userId } } })
    const rows = await prisma.fieldRow.count({ where: { field: { farm: { userId } } } })
    const plants = await prisma.plantInstance.count({ where: { field: { farm: { userId } } } })
    const recOps = await prisma.recommendedOperation.count({
      where: { plantingEvent: { field: { farm: { userId } } } },
    })
    const operations = await prisma.operation.count({ where: { farm: { userId } } })
    const harvests = await prisma.harvestYield.count({ where: { farm: { userId } } })
    const findings = await prisma.finding.count({ where: { field: { farm: { userId } } } })
    const livestock = await prisma.livestockUnit.count({ where: { farm: { userId } } })
    return { farms, fields, rows, plants, recOps, operations, harvests, findings, livestock }
  }

  it('roundtrips a fully-linked account', async () => {
    const { token, userId } = await demoAccount()
    const before = await counts(userId)
    expect(before.farms).toBe(1)
    expect(before.plants).toBeGreaterThan(100)

    // Export
    const exp = await request(app)
      .get('/api/v1/users/me/export')
      .set('Authorization', `Bearer ${token}`)
    expect(exp.status).toBe(200)
    const backup = JSON.parse(exp.text)
    expect(backup.app).toBe('mi-finca-pr')
    expect(backup.version).toBe(2)
    expect(backup.farms).toHaveLength(1)

    // Clear — everything owned is gone
    const clr = await request(app)
      .post('/api/v1/users/me/clear-data')
      .set('Authorization', `Bearer ${token}`)
    expect(clr.status).toBe(200)
    const empty = await counts(userId)
    expect(empty).toEqual({
      farms: 0, fields: 0, rows: 0, plants: 0, recOps: 0,
      operations: 0, harvests: 0, findings: 0, livestock: 0,
    })

    // Restore — identical counts
    const rst = await request(app)
      .post('/api/v1/users/me/restore')
      .set('Authorization', `Bearer ${token}`)
      .send(backup)
    expect(rst.status).toBe(200)
    const after = await counts(userId)
    expect(after).toEqual(before)

    // Internal links survived: the completed check-off still points at its
    // log entry, and the herd is still assigned to its corral.
    const linkedCheckOffs = await prisma.recommendedOperation.count({
      where: {
        plantingEvent: { field: { farm: { userId } } },
        completedOperationId: { not: null },
      },
    })
    expect(linkedCheckOffs).toBeGreaterThanOrEqual(1)
    const herd = await prisma.livestockUnit.findFirst({ where: { farm: { userId } } })
    expect(herd?.fieldId).toBeTruthy()
  })

  it('rejects v1 backups with a clear message', async () => {
    const { token } = await demoAccount()
    const res = await request(app)
      .post('/api/v1/users/me/restore')
      .set('Authorization', `Bearer ${token}`)
      .send({ app: 'mi-finca-pr', version: 1, farms: [], fields: [], livestock: [] })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('versión anterior')
  })

  it('rejects garbage', async () => {
    const { token } = await demoAccount()
    const res = await request(app)
      .post('/api/v1/users/me/restore')
      .set('Authorization', `Bearer ${token}`)
      .send({ app: 'otra-app', version: 2, farms: [] })
    expect(res.status).toBe(400)
  })
})
