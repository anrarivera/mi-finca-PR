import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'

vi.mock('../lib/prisma', async () => {
  const { prismaMock } = await import('../test/mockPrisma')
  return { prisma: prismaMock }
})

import { prismaMock } from '../test/mockPrisma'
import { createApp } from '../app'
import { signAccessToken } from '../lib/jwt'
import { setMailer, type MailMessage } from '../lib/mailer'
import { hashActionToken } from '../lib/actionTokens'

const app = createApp()
const authHeader = ['Authorization', `Bearer ${signAccessToken({ userId: 'user-1', email: 'ana@example.com' })}`] as const

let passwordHash: string
beforeAll(async () => {
  passwordHash = await bcrypt.hash('secreto123', 4)
})

let sentMail: MailMessage[]
beforeEach(() => {
  sentMail = []
  setMailer({ send: async msg => { sentMail.push(msg) } })
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

function fakeToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tok-1',
    userId: 'user-1',
    type: 'verify_email',
    tokenHash: hashActionToken('raw-token'),
    newEmail: null,
    expiresAt: new Date(Date.now() + 3_600_000),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('verify email', () => {
  it('emails a verification link containing a token', async () => {
    prismaMock.user.findUnique.mockResolvedValue(fakeUser() as never)
    prismaMock.actionToken.deleteMany.mockResolvedValue({ count: 0 } as never)
    prismaMock.actionToken.create.mockResolvedValue({} as never)

    const res = await request(app)
      .post('/api/v1/auth/verify-email/request')
      .set(...authHeader)

    expect(res.status).toBe(200)
    expect(sentMail).toHaveLength(1)
    expect(sentMail[0].to).toBe('ana@example.com')
    expect(sentMail[0].text).toMatch(/verify-email\?token=[0-9a-f]{64}/)
    // Only the HASH of the token is persisted
    const raw = sentMail[0].text.match(/token=([0-9a-f]{64})/)![1]
    expect(prismaMock.actionToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenHash: hashActionToken(raw), type: 'verify_email' }),
      })
    )
  })

  it('skips sending when the email is already verified', async () => {
    prismaMock.user.findUnique.mockResolvedValue(fakeUser({ emailVerified: true }) as never)

    const res = await request(app)
      .post('/api/v1/auth/verify-email/request')
      .set(...authHeader)

    expect(res.status).toBe(200)
    expect(sentMail).toHaveLength(0)
  })

  it('confirms a valid token and marks the email verified', async () => {
    prismaMock.actionToken.findUnique.mockResolvedValue(fakeToken() as never)
    prismaMock.actionToken.update.mockResolvedValue({} as never)
    prismaMock.user.update.mockResolvedValue({} as never)

    const res = await request(app)
      .post('/api/v1/auth/verify-email/confirm')
      .send({ token: 'raw-token' })

    expect(res.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerified: true },
    })
    // Single use: the token is marked spent
    expect(prismaMock.actionToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { usedAt: expect.any(Date) } })
    )
  })

  it('rejects an expired token', async () => {
    prismaMock.actionToken.findUnique.mockResolvedValue(
      fakeToken({ expiresAt: new Date(Date.now() - 1000) }) as never
    )
    const res = await request(app)
      .post('/api/v1/auth/verify-email/confirm')
      .send({ token: 'raw-token' })
    expect(res.status).toBe(400)
  })

  it('rejects a token that was already used', async () => {
    prismaMock.actionToken.findUnique.mockResolvedValue(
      fakeToken({ usedAt: new Date() }) as never
    )
    const res = await request(app)
      .post('/api/v1/auth/verify-email/confirm')
      .send({ token: 'raw-token' })
    expect(res.status).toBe(400)
  })
})

describe('forgot / reset password', () => {
  it('answers 200 without sending mail for an unknown email (no enumeration)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nadie@example.com' })

    expect(res.status).toBe(200)
    expect(sentMail).toHaveLength(0)
  })

  it('sends a reset link to a registered email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(fakeUser() as never)
    prismaMock.actionToken.deleteMany.mockResolvedValue({ count: 0 } as never)
    prismaMock.actionToken.create.mockResolvedValue({} as never)

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ana@example.com' })

    expect(res.status).toBe(200)
    expect(sentMail).toHaveLength(1)
    expect(sentMail[0].text).toMatch(/reset-password\?token=[0-9a-f]{64}/)
  })

  it('resets the password and revokes every session', async () => {
    prismaMock.actionToken.findUnique.mockResolvedValue(
      fakeToken({ type: 'reset_password' }) as never
    )
    prismaMock.actionToken.update.mockResolvedValue({} as never)
    prismaMock.user.update.mockResolvedValue({} as never)
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 2 } as never)

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'raw-token', newPassword: 'nueva-clave-123' })

    expect(res.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { passwordHash: expect.any(String) } })
    )
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
  })

  it('rejects a reset with an invalid token', async () => {
    prismaMock.actionToken.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'bogus', newPassword: 'nueva-clave-123' })
    expect(res.status).toBe(400)
  })

  it('rejects a token of the wrong type (verify token cannot reset a password)', async () => {
    prismaMock.actionToken.findUnique.mockResolvedValue(
      fakeToken({ type: 'verify_email' }) as never
    )
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'raw-token', newPassword: 'nueva-clave-123' })
    expect(res.status).toBe(400)
  })
})

describe('change email', () => {
  it('requires the correct current password', async () => {
    prismaMock.user.findUnique.mockResolvedValue(fakeUser() as never)

    const res = await request(app)
      .post('/api/v1/auth/change-email/request')
      .set(...authHeader)
      .send({ newEmail: 'nueva@example.com', password: 'incorrecta' })

    expect(res.status).toBe(400)
    expect(sentMail).toHaveLength(0)
  })

  it('rejects an address that already belongs to another account', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(fakeUser() as never)                       // requester
      .mockResolvedValueOnce(fakeUser({ id: 'user-2' }) as never)       // taken check

    const res = await request(app)
      .post('/api/v1/auth/change-email/request')
      .set(...authHeader)
      .send({ newEmail: 'ocupada@example.com', password: 'secreto123' })

    expect(res.status).toBe(409)
  })

  it('mails the confirmation link to the NEW address', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(fakeUser() as never)
      .mockResolvedValueOnce(null)
    prismaMock.actionToken.deleteMany.mockResolvedValue({ count: 0 } as never)
    prismaMock.actionToken.create.mockResolvedValue({} as never)

    const res = await request(app)
      .post('/api/v1/auth/change-email/request')
      .set(...authHeader)
      .send({ newEmail: 'Nueva@Example.com', password: 'secreto123' })

    expect(res.status).toBe(200)
    expect(sentMail).toHaveLength(1)
    expect(sentMail[0].to).toBe('nueva@example.com')
    expect(sentMail[0].text).toMatch(/change-email\?token=[0-9a-f]{64}/)
  })

  it('confirms the change, swaps the address and revokes sessions', async () => {
    prismaMock.actionToken.findUnique.mockResolvedValue(
      fakeToken({ type: 'change_email', newEmail: 'nueva@example.com' }) as never
    )
    prismaMock.actionToken.update.mockResolvedValue({} as never)
    prismaMock.user.findUnique.mockResolvedValue(null) // still not taken
    prismaMock.user.update.mockResolvedValue({} as never)
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 } as never)

    const res = await request(app)
      .post('/api/v1/auth/change-email/confirm')
      .send({ token: 'raw-token' })

    expect(res.status).toBe(200)
    expect(res.body.data.email).toBe('nueva@example.com')
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { email: 'nueva@example.com', emailVerified: true },
    })
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalled()
  })

  it('fails the confirm if the address was registered in the meantime', async () => {
    prismaMock.actionToken.findUnique.mockResolvedValue(
      fakeToken({ type: 'change_email', newEmail: 'nueva@example.com' }) as never
    )
    prismaMock.actionToken.update.mockResolvedValue({} as never)
    prismaMock.user.findUnique.mockResolvedValue(fakeUser({ id: 'user-2' }) as never)

    const res = await request(app)
      .post('/api/v1/auth/change-email/confirm')
      .send({ token: 'raw-token' })

    expect(res.status).toBe(409)
  })
})
