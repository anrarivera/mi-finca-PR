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

function builtInCrop(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plantain',
    userId: null,
    name: 'Plantain',
    nameEs: 'Plátano',
    emoji: '🍌',
    category: 'Musáceas',
    isBuiltIn: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    schedule: null,
    ...overrides,
  }
}

describe('GET /api/v1/crops', () => {
  it('serves built-in crops to anonymous callers', async () => {
    prismaMock.cropType.findMany.mockResolvedValue([builtInCrop()] as never)

    const res = await request(app).get('/api/v1/crops')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(prismaMock.cropType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isBuiltIn: true } })
    )
  })

  it('adds the caller\'s custom crops when authenticated', async () => {
    prismaMock.cropType.findMany.mockResolvedValue([] as never)

    await request(app).get('/api/v1/crops').set(...authHeader)

    expect(prismaMock.cropType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ isBuiltIn: true }, { userId: 'user-1' }] },
      })
    )
  })

  it('treats an invalid bearer token as anonymous instead of failing', async () => {
    prismaMock.cropType.findMany.mockResolvedValue([] as never)

    const res = await request(app)
      .get('/api/v1/crops')
      .set('Authorization', 'Bearer garbage')

    expect(res.status).toBe(200)
    expect(prismaMock.cropType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isBuiltIn: true } })
    )
  })
})

describe('POST /api/v1/crops', () => {
  it('rejects anonymous creation', async () => {
    const res = await request(app)
      .post('/api/v1/crops')
      .send({ nameEs: 'Acerola' })
    expect(res.status).toBe(401)
  })

  it('creates a custom crop with a schedule recipe', async () => {
    prismaMock.cropType.create.mockImplementation(
      (args: { data: unknown }) => Promise.resolve({ id: 'crop-9', ...(args.data as object), schedule: null }) as never
    )

    const res = await request(app)
      .post('/api/v1/crops')
      .set(...authHeader)
      .send({
        nameEs: 'Acerola',
        emoji: '🍒',
        schedule: {
          harvestWindowStartDays: 60,
          harvestWindowEndDays: 90,
          operations: [
            { type: 'fertilization', labelEs: 'Primera fertilización', offsetDays: 15 },
          ],
        },
      })

    expect(res.status).toBe(201)
    const createArgs = prismaMock.cropType.create.mock.calls[0][0] as {
      data: {
        userId: string
        isBuiltIn: boolean
        schedule: { create: { operations: Array<{ id: string; labelEs: string }> } }
      }
    }
    expect(createArgs.data.userId).toBe('user-1')
    expect(createArgs.data.isBuiltIn).toBe(false)
    // Operation templates get server-side ids when the client omits them
    expect(createArgs.data.schedule.create.operations[0].id).toBeTruthy()
    expect(createArgs.data.schedule.create.operations[0].labelEs).toBe('Primera fertilización')
  })

  it('rejects a schedule whose window ends before it starts', async () => {
    const res = await request(app)
      .post('/api/v1/crops')
      .set(...authHeader)
      .send({
        nameEs: 'Acerola',
        schedule: { harvestWindowStartDays: 90, harvestWindowEndDays: 60, operations: [] },
      })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a crop without a name', async () => {
    const res = await request(app)
      .post('/api/v1/crops')
      .set(...authHeader)
      .send({ emoji: '🍒' })
    expect(res.status).toBe(400)
  })
})

describe('PUT / DELETE /api/v1/crops/:id', () => {
  it('404s when updating a crop the user does not own (or a built-in)', async () => {
    prismaMock.cropType.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .put('/api/v1/crops/plantain')
      .set(...authHeader)
      .send({ nameEs: 'Plátano mío' })

    expect(res.status).toBe(404)
    // Ownership + isBuiltIn:false are both part of the lookup
    expect(prismaMock.cropType.findFirst).toHaveBeenCalledWith({
      where: { id: 'plantain', userId: 'user-1', isBuiltIn: false },
    })
  })

  it('deletes an owned custom crop', async () => {
    prismaMock.cropType.findFirst.mockResolvedValue(builtInCrop({
      id: 'crop-9', userId: 'user-1', isBuiltIn: false,
    }) as never)
    prismaMock.cropType.delete.mockResolvedValue({} as never)

    const res = await request(app)
      .delete('/api/v1/crops/crop-9')
      .set(...authHeader)

    expect(res.status).toBe(200)
    expect(prismaMock.cropType.delete).toHaveBeenCalledWith({ where: { id: 'crop-9' } })
  })
})
