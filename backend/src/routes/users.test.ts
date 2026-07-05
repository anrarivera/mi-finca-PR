import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'

vi.mock('../lib/prisma', async () => {
  const { prismaMock } = await import('../test/mockPrisma')
  return { prisma: prismaMock }
})

import { prismaMock } from '../test/mockPrisma'
import { createApp } from '../app'
import { signAccessToken } from '../lib/jwt'

const app = createApp()
const authHeader = ['Authorization', `Bearer ${signAccessToken({ userId: 'user-1', email: 'ana@example.com' })}`] as const

describe('GET /api/v1/users/me/notification-prefs', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/users/me/notification-prefs')
    expect(res.status).toBe(401)
  })

  it('fills defaults for a user who never saved preferences', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ notificationPrefs: {} } as never)

    const res = await request(app)
      .get('/api/v1/users/me/notification-prefs')
      .set(...authHeader)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      enabled: true,
      notifyOverdue: true,
      notifyDueSoon: true,
      notifyHarvest: true,
      dueSoonLeadDays: 14,
    })
  })

  it('overlays stored values on the defaults', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      notificationPrefs: { enabled: false, dueSoonLeadDays: 7 },
    } as never)

    const res = await request(app)
      .get('/api/v1/users/me/notification-prefs')
      .set(...authHeader)

    expect(res.body.data.enabled).toBe(false)
    expect(res.body.data.dueSoonLeadDays).toBe(7)
    expect(res.body.data.notifyHarvest).toBe(true)
  })
})

describe('PUT /api/v1/users/me/notification-prefs', () => {
  it('merges a partial patch and persists the result', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      notificationPrefs: { notifyHarvest: false },
    } as never)
    prismaMock.user.update.mockResolvedValue({} as never)

    const res = await request(app)
      .put('/api/v1/users/me/notification-prefs')
      .set(...authHeader)
      .send({ dueSoonLeadDays: 21 })

    expect(res.status).toBe(200)
    expect(res.body.data.dueSoonLeadDays).toBe(21)
    expect(res.body.data.notifyHarvest).toBe(false) // stored value survives
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { notificationPrefs: expect.objectContaining({ dueSoonLeadDays: 21 }) },
      })
    )
  })

  it('rejects an out-of-range lead time', async () => {
    const res = await request(app)
      .put('/api/v1/users/me/notification-prefs')
      .set(...authHeader)
      .send({ dueSoonLeadDays: 0 })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
