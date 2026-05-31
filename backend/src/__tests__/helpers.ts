import supertest from 'supertest'
import { PrismaClient } from '@prisma/client'
import app from '../index'

export const request = supertest(app)
export const prisma = new PrismaClient()

// ── Auth helper — register + login, return token + userId ─────────
export async function createTestUser(overrides?: {
  email?: string
  password?: string
  name?: string
}) {
  const email = overrides?.email ?? `test_${Date.now()}@mifincapr.com`
  const password = overrides?.password ?? 'TestPassword123!'
  const name = overrides?.name ?? 'Test User'

  const res = await request
    .post('/api/v1/auth/register')
    .send({ email, password, name })

  // If already exists, just login
  const loginRes = await request
    .post('/api/v1/auth/login')
    .send({ email, password })

  const token = loginRes.body.data?.accessToken
  const userId = loginRes.body.data?.user?.id

  return { email, password, name, token, userId }
}

// ── Farm helper — create a farm, return it ────────────────────────
export async function createTestFarm(token: string, overrides?: {
  name?: string
  location?: string
}) {
  const res = await request
    .post('/api/v1/farms')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: overrides?.name ?? 'Finca de Prueba',
      location: overrides?.location ?? 'Aguadilla, PR',
    })

  return res.body.data?.farm
}

// ── Field helper — create a field, return it ──────────────────────
export async function createTestField(token: string, farmId: string, overrides?: object) {
  const res = await request
    .post(`/api/v1/farms/${farmId}/fields`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Campo de Prueba',
      color: '#22c55e',
      shape: 'rectangle',
      widthFt: 50,
      heightFt: 80,
      farmLat: 18.4655,
      farmLng: -66.1057,
      ...overrides,
    })

  return res.body.data?.field
}

// ── Cleanup — wipe test data between tests ────────────────────────
export async function cleanDatabase() {
  // Delete in order to respect foreign keys
  await prisma.operation.deleteMany()
  await prisma.plantingEvent.deleteMany()
  await prisma.plantInstance.deleteMany()
  await prisma.fieldRow.deleteMany()
  await prisma.field.deleteMany()
  await prisma.farm.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.passwordResetToken.deleteMany()
  await prisma.emailVerificationToken.deleteMany()
  await prisma.user.deleteMany()
}