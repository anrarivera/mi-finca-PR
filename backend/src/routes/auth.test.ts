import { describe, it, expect, vi, beforeAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'

vi.mock('../lib/prisma', async () => {
  const { prismaMock } = await import('../test/mockPrisma')
  return { prisma: prismaMock }
})

import { prismaMock } from '../test/mockPrisma'
import { createApp } from '../app'
import { signAccessToken, signRefreshToken } from '../lib/jwt'

const app = createApp()

// Low bcrypt cost keeps the suite fast; compare() works at any cost.
let passwordHash: string
beforeAll(async () => {
  passwordHash = await bcrypt.hash('secreto123', 4)
})

function fakeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'ana@example.com',
    passwordHash,
    fullName: 'Ana Rivera',
    profilePhotoUrl: null,
    language: 'es',
    unitSystem: 'imperial',
    emailVerified: false,
    notificationPrefs: {},
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('POST /api/v1/auth/register', () => {
  it('creates a user and returns an access token plus refresh cookie', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue(fakeUser() as never)
    prismaMock.refreshToken.create.mockResolvedValue({} as never)

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'Ana@Example.com', password: 'secreto123', fullName: 'Ana Rivera' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.accessToken).toBeTruthy()
    expect(res.body.data.user.email).toBe('ana@example.com')
    // Email is normalized to lowercase before storage
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'ana@example.com' }),
      })
    )
    const cookies = res.headers['set-cookie'] as unknown as string[]
    expect(cookies.some(c => c.startsWith('refreshToken=') && c.includes('HttpOnly'))).toBe(true)
  })

  it('rejects a duplicate email with 409', async () => {
    prismaMock.user.findUnique.mockResolvedValue(fakeUser() as never)

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'ana@example.com', password: 'secreto123', fullName: 'Ana' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
  })

  it('rejects an invalid body with a validation error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'x', fullName: '' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/v1/auth/login', () => {
  it('returns tokens for valid credentials', async () => {
    prismaMock.user.findUnique.mockResolvedValue(fakeUser() as never)
    prismaMock.refreshToken.create.mockResolvedValue({} as never)

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@example.com', password: 'secreto123' })

    expect(res.status).toBe(200)
    expect(res.body.data.accessToken).toBeTruthy()
    expect(res.body.data.user.fullName).toBe('Ana Rivera')
  })

  it('rejects a wrong password without revealing which part failed', async () => {
    prismaMock.user.findUnique.mockResolvedValue(fakeUser() as never)

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@example.com', password: 'incorrecta' })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('Invalid email or password')
  })

  it('answers an unknown email with the same generic error', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nadie@example.com', password: 'secreto123' })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('Invalid email or password')
  })
})

describe('GET /api/v1/auth/me', () => {
  it('returns the profile for a valid access token', async () => {
    prismaMock.user.findUnique.mockResolvedValue(fakeUser() as never)
    const token = signAccessToken({ userId: 'user-1', email: 'ana@example.com' })

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.email).toBe('ana@example.com')
  })

  it('rejects a missing token with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the refresh token and returns a new access token', async () => {
    const refreshToken = signRefreshToken({ userId: 'user-1', email: 'ana@example.com' })
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1', userId: 'user-1', token: refreshToken,
      expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(),
    } as never)
    prismaMock.user.findUnique.mockResolvedValue(fakeUser() as never)
    prismaMock.refreshToken.delete.mockResolvedValue({} as never)
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 0 } as never)
    prismaMock.refreshToken.create.mockResolvedValue({} as never)

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`])

    expect(res.status).toBe(200)
    expect(res.body.data.accessToken).toBeTruthy()
    // Single use: the redeemed token is deleted
    expect(prismaMock.refreshToken.delete).toHaveBeenCalledWith({ where: { token: refreshToken } })
  })

  it('rejects when no refresh cookie is present', async () => {
    const res = await request(app).post('/api/v1/auth/refresh')
    expect(res.status).toBe(401)
  })

  it('rejects a token that was already revoked in the database', async () => {
    const refreshToken = signRefreshToken({ userId: 'user-1', email: 'ana@example.com' })
    prismaMock.refreshToken.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`])

    expect(res.status).toBe(401)
  })
})
