import supertest from 'supertest'
import { PrismaClient } from '@prisma/client'
import app from '../index'

export const request = supertest(app)
export const prisma = new PrismaClient()

// Monotonic suffix so parallel calls in one test can't collide on email.
let userSeq = 0

// ── Auth helper — register (or login if taken), return token + userId ──
export async function createTestUser(overrides?: {
  email?: string
  password?: string
  fullName?: string
}) {
  const email = overrides?.email ?? `test_${Date.now()}_${userSeq++}@mifincapr.com`
  const password = overrides?.password ?? 'TestPassword123!'
  const fullName = overrides?.fullName ?? 'Test User'

  const res = await request
    .post('/api/v1/auth/register')
    .send({ email, password, fullName })

  if (res.status === 201) {
    return {
      email, password, fullName,
      token: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
    }
  }

  // Already registered (e.g. fixed email reused within a test) — log in.
  const loginRes = await request
    .post('/api/v1/auth/login')
    .send({ email, password })
  return {
    email, password, fullName,
    token: loginRes.body.data?.accessToken as string,
    userId: loginRes.body.data?.user?.id as string,
  }
}

// ── Farm helper — POST /farms returns the farm directly under data ────
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

  return res.body.data
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
      farmLat: 18.4655,
      farmLng: -66.1057,
      ...overrides,
    })

  return res.body.data?.field
}

// ── Recommendation seeding — the calendar rows the check-off flows act
// on. Created directly via prisma: through the API they only arise from
// full field payloads with planting events, which isn't what these tests
// are exercising. ──────────────────────────────────────────────────────
export async function seedRecommendedOp(fieldId: string, overrides?: {
  recommendedDate?: string
  status?: string
  type?: string
}) {
  const event = await prisma.plantingEvent.create({
    data: {
      fieldId,
      cropTypeId: 'platano',
      plantingDate: new Date('2026-06-01'),
      plantCount: 10,
    },
  })
  const recOp = await prisma.recommendedOperation.create({
    data: {
      plantingEventId: event.id,
      templateId: 'test-template',
      type: overrides?.type ?? 'fertilization',
      labelEs: 'Fertilización de prueba',
      recommendedDate: new Date(overrides?.recommendedDate ?? '2026-08-05'),
      status: overrides?.status ?? 'pending',
    },
  })
  return { event, recOp }
}

// ── Cleanup — wipe test data between tests ────────────────────────
export async function cleanDatabase() {
  // Delete in order to respect foreign keys
  await prisma.findingObservation.deleteMany()
  await prisma.finding.deleteMany()
  await prisma.harvestYield.deleteMany()
  await prisma.recommendedOperation.deleteMany()
  await prisma.operation.deleteMany()
  await prisma.plantingEvent.deleteMany()
  await prisma.plantInstance.deleteMany()
  await prisma.fieldRow.deleteMany()
  await prisma.field.deleteMany()
  await prisma.livestockUnit.deleteMany()
  await prisma.farm.deleteMany()
  await prisma.refreshToken.deleteMany()
  // Single-use email links (verification / reset / change-email) all live
  // in action_tokens now — the old per-type token tables are gone.
  await prisma.actionToken.deleteMany()
  await prisma.user.deleteMany()
}
