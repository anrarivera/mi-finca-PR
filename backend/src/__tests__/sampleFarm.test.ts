import {
  request, prisma, createTestUser, createTestFarm, createTestField,
  seedRecommendedOp, addFarmMember, cleanDatabase,
} from './helpers'
import { setMailer, type MailMessage } from '../lib/mailer'
import { runDailyDigest } from '../lib/dailyDigest'
import { signAccessToken } from '../lib/jwt'
import * as demoSeed from '../lib/demoSeed'
import { resetStaleSampleFarms, SAMPLE_FARM_TTL_DAYS } from '../lib/sampleFarm'
import { todayInAppTz } from '../lib/today'

const BASE = '/api/v1/users/me/sample-farm'
const DAY_MS = 24 * 60 * 60 * 1000
const OFF = { enabled: false, farmId: null, seededAt: null, resetsAt: null, ttlDays: 7 }

let outbox: MailMessage[] = []

beforeAll(() => {
  setMailer({ async send(msg) { outbox.push(msg) } })
})

beforeEach(async () => {
  await cleanDatabase()
  outbox = []
})

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

const getStatus = (token: string) => request.get(BASE).set(auth(token))

const setSampleFarm = (token: string, enabled: boolean) =>
  request.put(BASE).set(auth(token)).send({ enabled })

const resetNow = (token: string) => request.post(`${BASE}/reset`).set(auth(token))

// Switch it on and hand back the new farm's id.
async function enable(token: string): Promise<string> {
  const res = await setSampleFarm(token, true)
  expect(res.status).toBe(200)
  return res.body.data.farmId
}

async function demoAccount() {
  const res = await request.post('/api/v1/auth/demo')
  return { token: res.body.data.accessToken as string, userId: res.body.data.user.id as string }
}

const sampleFarmsOf = (userId: string) =>
  prisma.farm.findMany({ where: { userId, isSample: true } })

const backdate = (farmId: string, days: number) =>
  prisma.farm.update({
    where: { id: farmId },
    data: { createdAt: new Date(Date.now() - days * DAY_MS) },
  })

// Row counts of every table a farm owns rows in. The database is wiped
// before each test, so two equal snapshots mean nothing was left behind.
async function snapshot() {
  const [
    farms, fields, rows, plants, plantings, labores, operations, harvests,
    findings, observations, herds, members, invites, recipeDefaults,
    sensors, readings, rules,
  ] = await Promise.all([
    prisma.farm.count(), prisma.field.count(), prisma.fieldRow.count(),
    prisma.plantInstance.count(), prisma.plantingEvent.count(),
    prisma.recommendedOperation.count(), prisma.operation.count(),
    prisma.harvestYield.count(), prisma.finding.count(),
    prisma.findingObservation.count(), prisma.livestockUnit.count(),
    prisma.farmMember.count(), prisma.farmInvite.count(),
    prisma.recipeDefault.count(), prisma.sensor.count(),
    prisma.sensorReading.count(), prisma.automationRule.count(),
  ])
  return {
    farms, fields, rows, plants, plantings, labores, operations, harvests,
    findings, observations, herds, members, invites, recipeDefaults,
    sensors, readings, rules,
  }
}

async function overdueLabor(token: string, farmId: string) {
  const due = await request
    .get(`/api/v1/farms/${farmId}/recommended-operations/due-soon`)
    .set(auth(token))
  return due.body.data.operations.find((o: any) => o.status === 'due')
}

describe('GET / PUT /api/v1/users/me/sample-farm', () => {
  it('requires authentication', async () => {
    expect((await request.get(BASE)).status).toBe(401)
    expect((await request.put(BASE).send({ enabled: true })).status).toBe(401)
    expect((await request.post(`${BASE}/reset`)).status).toBe(401)
  })

  it('is off for a new account', async () => {
    const { token } = await createTestUser()

    const res = await getStatus(token)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: OFF })
  })

  it('switching it on seeds ONE flagged farm next to the user\'s own', async () => {
    const { token, userId } = await createTestUser()
    const own = await createTestFarm(token, { name: 'Finca Real' })
    expect(own.isSample).toBe(false)

    const res = await setSampleFarm(token, true)

    expect(res.status).toBe(200)
    const status = res.body.data
    expect(Object.keys(status).sort()).toEqual(Object.keys(OFF).sort())
    expect(status.enabled).toBe(true)
    expect(status.ttlDays).toBe(SAMPLE_FARM_TTL_DAYS)
    // ISO timestamps, one TTL apart
    expect(new Date(status.seededAt).toISOString()).toBe(status.seededAt)
    expect(new Date(status.resetsAt).toISOString()).toBe(status.resetsAt)
    expect(new Date(status.resetsAt).getTime() - new Date(status.seededAt).getTime())
      .toBe(SAMPLE_FARM_TTL_DAYS * DAY_MS)
    expect((await getStatus(token)).body.data).toEqual(status)

    const seeded = await sampleFarmsOf(userId)
    expect(seeded).toHaveLength(1)
    expect(seeded[0].id).toBe(status.farmId)

    // Complete enough to explore: fields, plantings, an overdue labor, a
    // finding and a herd.
    const fields = await request
      .get(`/api/v1/farms/${status.farmId}/fields`)
      .set(auth(token))
    expect(fields.body.data.fields).toHaveLength(3)
    const platanos = fields.body.data.fields.find((f: any) => f.name === 'Los Plátanos')
    expect(platanos.rows).toHaveLength(6)
    expect(platanos.plantingEvents).toHaveLength(1)
    expect(await overdueLabor(token, status.farmId)).toBeTruthy()
    const findings = await request
      .get(`/api/v1/farms/${status.farmId}/findings`)
      .set(auth(token))
    expect(findings.body.data).toHaveLength(1)
    const herds = await request
      .get(`/api/v1/farms/${status.farmId}/livestock`)
      .set(auth(token))
    expect(herds.body.data).toHaveLength(1)

    // Every farm answer carries the flag
    const list = await request.get('/api/v1/farms').set(auth(token))
    expect(list.body.data).toHaveLength(2)
    const flags = Object.fromEntries(list.body.data.map((f: any) => [f.id, f.isSample]))
    expect(flags).toEqual({ [own.id]: false, [status.farmId]: true })
    const single = await request.get(`/api/v1/farms/${status.farmId}`).set(auth(token))
    expect(single.body.data.isSample).toBe(true)
  })

  it('switching it on twice still leaves one farm — a fresh one', async () => {
    const { token, userId } = await createTestUser()
    const first = await enable(token)

    const second = await enable(token)

    expect(second).not.toBe(first)
    expect((await sampleFarmsOf(userId)).map(f => f.id)).toEqual([second])
  })

  it('two requests at the same time still leave one farm', async () => {
    const { token, userId } = await createTestUser()

    const [a, b] = await Promise.all([
      setSampleFarm(token, true),
      setSampleFarm(token, true),
    ])

    expect([a.status, b.status]).toEqual([200, 200])
    expect(await sampleFarmsOf(userId)).toHaveLength(1)
  })

  it('rejects a body without a boolean "enabled"', async () => {
    const { token, userId } = await createTestUser()

    for (const body of [{}, { enabled: 'true' }, { enabled: null }]) {
      const res = await request.put(BASE).set(auth(token)).send(body)
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    }
    expect(await sampleFarmsOf(userId)).toHaveLength(0)
  })
})

describe('the flag', () => {
  it('cannot be set or cleared through the farm routes', async () => {
    const { token } = await createTestUser()
    const sampleId = await enable(token)

    const created = await request
      .post('/api/v1/farms')
      .set(auth(token))
      .send({ name: 'Finca Real', location: 'Lares, PR', isSample: true })
    expect(created.status).toBe(201)
    expect(created.body.data.isSample).toBe(false)
    const patched = await request
      .patch(`/api/v1/farms/${created.body.data.id}`)
      .set(auth(token))
      .send({ location: 'Utuado, PR', isSample: true })
    expect(patched.status).toBe(200)
    expect(patched.body.data).toMatchObject({ location: 'Utuado, PR', isSample: false })

    // The sample farm is edited like any farm — and stays the sample farm
    const renamed = await request
      .patch(`/api/v1/farms/${sampleId}`)
      .set(auth(token))
      .send({ name: 'Mi finca de ejemplo', isSample: false })
    expect(renamed.status).toBe(200)
    expect(renamed.body.data).toMatchObject({ name: 'Mi finca de ejemplo', isSample: true })
    expect((await getStatus(token)).body.data).toMatchObject({ enabled: true, farmId: sampleId })
  })
})

describe('the favorite', () => {
  it('stays with the user\'s own farm', async () => {
    const { token } = await createTestUser()
    const own = await createTestFarm(token)
    expect(own.isFavorite).toBe(true)

    const sampleId = await enable(token)

    const list = await request.get('/api/v1/farms').set(auth(token))
    const favorites = list.body.data.filter((f: any) => f.isFavorite).map((f: any) => f.id)
    expect(favorites).toEqual([own.id])
    expect(favorites).not.toContain(sampleId)
  })

  it('goes to the sample farm in an account with no farms', async () => {
    const { token } = await createTestUser()

    const sampleId = await enable(token)

    const list = await request.get('/api/v1/farms').set(auth(token))
    expect(list.body.data).toHaveLength(1)
    expect(list.body.data[0]).toMatchObject({ id: sampleId, isFavorite: true })
  })

  it('is handed to the user\'s own farm when the sample farm leaves', async () => {
    const { token } = await createTestUser()
    const own = await createTestFarm(token)
    const sampleId = await enable(token)
    // The user stars the sample farm while exploring it
    const starred = await request
      .patch(`/api/v1/farms/${sampleId}`)
      .set(auth(token))
      .send({ isFavorite: true })
    expect(starred.status).toBe(200)
    expect(starred.body.data.isFavorite).toBe(true)

    // A reset seeds next to an own farm — the favorite moves over…
    const reset = await resetNow(token)
    expect(reset.status).toBe(200)
    let list = await request.get('/api/v1/farms').set(auth(token))
    expect(list.body.data.filter((f: any) => f.isFavorite).map((f: any) => f.id))
      .toEqual([own.id])

    // …and stays there when the sample farm is switched off.
    await setSampleFarm(token, false)
    list = await request.get('/api/v1/farms').set(auth(token))
    expect(list.body.data).toHaveLength(1)
    expect(list.body.data[0]).toMatchObject({ id: own.id, isFavorite: true })
  })
})

describe('switching it off', () => {
  it('leaves nothing behind and the user\'s own farm untouched', async () => {
    const owner = await createTestUser()
    const teammate = await createTestUser()
    const own = await createTestFarm(owner.token, { name: 'Finca Real' })
    const ownField = await createTestField(owner.token, own.id)
    const { recOp: ownLabor } = await seedRecommendedOp(ownField.id)
    const before = await snapshot()

    const sampleId = await enable(owner.token)
    expect((await snapshot()).plants).toBeGreaterThan(before.plants + 100)

    // What the user can leave in it through the app…
    const labor = await overdueLabor(owner.token, sampleId)
    const done = await request
      .post(`/api/v1/farms/${sampleId}/recommended-operations/${labor.id}/complete`)
      .set(auth(owner.token))
      .send({ notes: 'Hecho' })
    expect(done.status).toBe(201)

    // …and what only the database can hold today: a team (the API refuses
    // one), a farm-scoped recipe default, a sensor with a reading and an
    // automation rule, and a herd-level labor — the one child that is
    // detached rather than deleted when its herd goes.
    await addFarmMember(sampleId, teammate.userId, 'operator')
    await prisma.farmInvite.create({
      data: {
        farmId: sampleId, role: 'operator', codeHash: 'sample-farm-test',
        createdBy: owner.userId, expiresAt: new Date(Date.now() + DAY_MS),
      },
    })
    const crop = await prisma.cropType.create({
      data: { userId: owner.userId, name: 'Test crop', nameEs: 'Cultivo de prueba' },
    })
    const recipe = await prisma.recipe.create({
      data: { authorUserId: owner.userId, cropTypeId: crop.id, name: 'Receta de prueba' },
    })
    await prisma.recipeDefault.create({
      data: { cropTypeId: crop.id, recipeId: recipe.id, farmId: sampleId },
    })
    await prisma.sensor.create({
      data: {
        farmId: sampleId, name: 'Sensor de prueba', sensorType: 'soil_moisture',
        readings: { create: [{ value: 41.5, unit: '%', recordedAt: new Date() }] },
      },
    })
    await prisma.automationRule.create({
      data: { farmId: sampleId, name: 'Regla de prueba', sensorCondition: {}, action: {} },
    })
    const herd = await prisma.livestockUnit.findFirstOrThrow({ where: { farmId: sampleId } })
    await prisma.recommendedOperation.create({
      data: {
        livestockUnitId: herd.id, templateId: 'test-template', type: 'vaccination',
        labelEs: 'Vacunación de prueba', recommendedDate: new Date(),
      },
    })

    const res = await setSampleFarm(owner.token, false)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: OFF })
    expect(await snapshot()).toEqual(before)
    // None of the seed's own ids survive either
    expect(await prisma.plantingEvent.count({ where: { id: { startsWith: 'pe_demo_' } } })).toBe(0)
    expect(await prisma.recommendedOperation.count({ where: { id: { startsWith: 'ro_demo_' } } })).toBe(0)
    expect(await prisma.fieldRow.count({ where: { id: { startsWith: 'row_demo_' } } })).toBe(0)
    expect(await prisma.plantInstance.count({ where: { id: { startsWith: 'row_demo_' } } })).toBe(0)

    // The user's own records are all still there
    const farms = await prisma.farm.findMany({ where: { userId: owner.userId } })
    expect(farms.map(f => f.id)).toEqual([own.id])
    expect(await prisma.field.findUnique({ where: { id: ownField.id } })).toBeTruthy()
    expect(await prisma.recommendedOperation.findUnique({ where: { id: ownLabor.id } })).toBeTruthy()
    expect(await prisma.recipe.findUnique({ where: { id: recipe.id } })).toBeTruthy()
  })

  it('is fine when it is already off', async () => {
    const { token } = await createTestUser()

    const res = await setSampleFarm(token, false)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual(OFF)
  })

  it('off → on → off → on works, also after deleting it like any farm', async () => {
    const { token, userId } = await createTestUser()

    const first = await enable(token)
    expect((await setSampleFarm(token, false)).body.data).toEqual(OFF)
    const second = await enable(token)
    expect(second).not.toBe(first)

    // The normal delete button (a soft delete) switches it off too…
    const del = await request.delete(`/api/v1/farms/${second}`).set(auth(token))
    expect(del.status).toBe(200)
    expect((await getStatus(token)).body.data).toEqual(OFF)
    expect(await sampleFarmsOf(userId)).toHaveLength(1) // the soft-deleted leftover

    // …and switching it on again clears the leftover.
    const third = await enable(token)
    expect((await sampleFarmsOf(userId)).map(f => f.id)).toEqual([third])
    expect((await getStatus(token)).body.data).toMatchObject({ enabled: true, farmId: third })
  })
})

describe('the seed', () => {
  it('uses ids of its own every time, also for the same user', async () => {
    const { userId } = await createTestUser()

    const first = await demoSeed.seedDemoFarm(userId)
    const second = await demoSeed.seedDemoFarm(userId, { isFavorite: false })

    expect(second).not.toBe(first)
    const farms = await prisma.farm.findMany({
      where: { userId },
      include: { fields: { include: { plantingEvents: true, rows: true } } },
      orderBy: { createdAt: 'asc' },
    })
    expect(farms.map(f => [f.id, f.isSample, f.isFavorite])).toEqual([
      [first, true, true],
      [second, true, false],
    ])
    for (const farm of farms) {
      expect(farm.fields.flatMap(f => f.plantingEvents)).toHaveLength(2)
      expect(farm.fields.flatMap(f => f.rows)).toHaveLength(10)
    }
  })

  it('leaves nothing behind when the transaction it runs in rolls back', async () => {
    const { userId } = await createTestUser()
    const before = await snapshot()

    await expect(prisma.$transaction(async tx => {
      await demoSeed.seedDemoFarm(userId, { tx })
      throw new Error('rolled back')
    }, { timeout: 30000 })).rejects.toThrow('rolled back')

    expect(await snapshot()).toEqual(before)
  })

  it('works for two users whose ids share their first 8 characters', async () => {
    // The seed used to derive its ids from that prefix.
    const ids = [
      '5a3f9c1e-0000-4000-8000-000000000001',
      '5a3f9c1e-0000-4000-8000-000000000002',
    ]
    for (const id of ids) {
      const email = `${id}@mifincapr.com`
      await prisma.user.create({ data: { id, email, fullName: 'Test User' } })

      const res = await setSampleFarm(signAccessToken({ userId: id, email }), true)

      expect(res.status).toBe(200)
      expect(await sampleFarmsOf(id)).toHaveLength(1)
    }
  })
})

describe('POST /api/v1/users/me/sample-farm/reset', () => {
  it('puts the default data back in a NEW farm', async () => {
    const { token, userId } = await createTestUser()
    const before = (await setSampleFarm(token, true)).body.data

    // It is a sandbox — ordinary edits are allowed
    const labor = await overdueLabor(token, before.farmId)
    const done = await request
      .post(`/api/v1/farms/${before.farmId}/recommended-operations/${labor.id}/complete`)
      .set(auth(token))
      .send({ notes: 'Hecho' })
    expect(done.status).toBe(201)
    const fields = await request.get(`/api/v1/farms/${before.farmId}/fields`).set(auth(token))
    const platanos = fields.body.data.fields.find((f: any) => f.name === 'Los Plátanos')
    const renamed = await request
      .patch(`/api/v1/farms/${before.farmId}/fields/${platanos.id}`)
      .set(auth(token))
      .send({ name: 'Mi Platanal' })
    expect(renamed.status).toBe(200)
    expect(await overdueLabor(token, before.farmId)).toBeUndefined()

    const res = await resetNow(token)

    expect(res.status).toBe(200)
    const after = res.body.data
    expect(after.enabled).toBe(true)
    // A reset REPLACES the farm: new id, the old one is gone
    expect(after.farmId).not.toBe(before.farmId)
    expect((await sampleFarmsOf(userId)).map(f => f.id)).toEqual([after.farmId])
    expect((await request.get(`/api/v1/farms/${before.farmId}`).set(auth(token))).status).toBe(404)
    expect(new Date(after.seededAt).getTime()).toBeGreaterThan(new Date(before.seededAt).getTime())
    expect(new Date(after.resetsAt).getTime()).toBeGreaterThan(new Date(before.resetsAt).getTime())

    // Default data: the labor is overdue again, the field has its name,
    // and the log holds only the seed's own entry.
    expect(await overdueLabor(token, after.farmId)).toBeTruthy()
    const fresh = await request.get(`/api/v1/farms/${after.farmId}/fields`).set(auth(token))
    expect(fresh.body.data.fields.map((f: any) => f.name).sort())
      .toEqual(['Café de Altura', 'El Gallinero', 'Los Plátanos'])
    const log = await request.get(`/api/v1/farms/${after.farmId}/operations`).set(auth(token))
    expect(log.body.data).toHaveLength(1)
  })

  it('answers 409 while the sample farm is off', async () => {
    const { token, userId } = await createTestUser()

    const res = await resetNow(token)

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
    expect(res.body.error.message).toMatch(/finca de ejemplo/)
    expect(await sampleFarmsOf(userId)).toHaveLength(0)
  })
})

describe('resetStaleSampleFarms (the nightly job)', () => {
  it('re-seeds what expired, purges what was deleted, leaves the rest alone', async () => {
    const stale = await createTestUser()
    const young = await createTestUser()
    const removed = await createTestUser()
    const demo = await demoAccount()

    const staleFarm = await enable(stale.token)
    await backdate(staleFarm, SAMPLE_FARM_TTL_DAYS + 1)
    const youngFarm = await enable(young.token)
    await backdate(youngFarm, SAMPLE_FARM_TTL_DAYS - 1)
    const youngBefore = await prisma.farm.findUniqueOrThrow({ where: { id: youngFarm } })
    const removedFarm = await enable(removed.token)
    await request.delete(`/api/v1/farms/${removedFarm}`).set(auth(removed.token))
    // Demo accounts belong to the demo purge, however old their farm is
    const [demoFarm] = await sampleFarmsOf(demo.userId)
    await backdate(demoFarm.id, SAMPLE_FARM_TTL_DAYS + 1)

    const now = new Date()
    const result = await resetStaleSampleFarms(now)

    expect(result).toEqual({ reset: 1, purged: 1, failed: 0 })

    const [reseeded] = await sampleFarmsOf(stale.userId)
    expect(reseeded.id).not.toBe(staleFarm)
    expect(reseeded.createdAt.getTime()).toBeGreaterThanOrEqual(now.getTime() - 1000)
    expect(await prisma.farm.findUnique({ where: { id: staleFarm } })).toBeNull()
    expect(await overdueLabor(stale.token, reseeded.id)).toBeTruthy()

    const [untouched] = await sampleFarmsOf(young.userId)
    expect(untouched.id).toBe(youngFarm)
    expect(untouched.createdAt).toEqual(youngBefore.createdAt)

    expect(await sampleFarmsOf(removed.userId)).toHaveLength(0)
    expect((await getStatus(removed.token)).body.data).toEqual(OFF)

    expect((await sampleFarmsOf(demo.userId)).map(f => f.id)).toEqual([demoFarm.id])

    // Nothing left to do on a second run
    expect(await resetStaleSampleFarms(now)).toEqual({ reset: 0, purged: 0, failed: 0 })
  })

  it('takes its clock from the caller', async () => {
    const { token, userId } = await createTestUser()
    const farmId = await enable(token)

    const tooEarly = new Date(Date.now() + (SAMPLE_FARM_TTL_DAYS - 1) * DAY_MS)
    expect(await resetStaleSampleFarms(tooEarly)).toEqual({ reset: 0, purged: 0, failed: 0 })
    expect((await sampleFarmsOf(userId)).map(f => f.id)).toEqual([farmId])

    const afterTtl = new Date(Date.now() + (SAMPLE_FARM_TTL_DAYS + 1) * DAY_MS)
    expect(await resetStaleSampleFarms(afterTtl)).toEqual({ reset: 1, purged: 0, failed: 0 })
    expect((await sampleFarmsOf(userId)).map(f => f.id)).not.toContain(farmId)
  })

  it('keeps going when one account fails — and that account keeps its farm', async () => {
    const unlucky = await createTestUser()
    const lucky = await createTestUser()
    const unluckyFarm = await enable(unlucky.token)
    const luckyFarm = await enable(lucky.token)
    await backdate(unluckyFarm, SAMPLE_FARM_TTL_DAYS + 2)
    await backdate(luckyFarm, SAMPLE_FARM_TTL_DAYS + 1)

    const seed = demoSeed.seedDemoFarm
    const spy = jest.spyOn(demoSeed, 'seedDemoFarm').mockImplementation(
      (userId, options) => userId === unlucky.userId
        ? Promise.reject(new Error('seed failed'))
        : seed(userId, options)
    )
    let result
    try {
      result = await resetStaleSampleFarms()
    } finally {
      spy.mockRestore()
    }

    expect(result).toEqual({ reset: 1, purged: 0, failed: 1 })
    // Delete + seed are one transaction: the failed one rolled back whole
    expect((await sampleFarmsOf(unlucky.userId)).map(f => f.id)).toEqual([unluckyFarm])
    expect(await overdueLabor(unlucky.token, unluckyFarm)).toBeTruthy()
    expect((await sampleFarmsOf(lucky.userId)).map(f => f.id)).not.toContain(luckyFarm)
  })
})

describe('team features', () => {
  it('are refused on the sample farm, whoever the address belongs to', async () => {
    const owner = await createTestUser()
    const registered = await createTestUser()
    const sampleId = await enable(owner.token)
    outbox = []

    const invite = await request
      .post(`/api/v1/farms/${sampleId}/members/invites`)
      .set(auth(owner.token))
      .send({ role: 'operator' })
    expect(invite.status).toBe(403)
    expect(invite.body.error.code).toBe('FORBIDDEN')
    expect(invite.body.error.message).toMatch(/finca de ejemplo/)

    const known = await request
      .post(`/api/v1/farms/${sampleId}/members`)
      .set(auth(owner.token))
      .send({ email: registered.email, role: 'operator' })
    const unknown = await request
      .post(`/api/v1/farms/${sampleId}/members`)
      .set(auth(owner.token))
      .send({ email: 'nadie@example.com', role: 'operator' })
    expect(known.status).toBe(403)
    expect(known.body.error.message).toMatch(/finca de ejemplo/)
    // Same answer either way — nothing about the address leaks
    expect(unknown.status).toBe(known.status)
    expect(unknown.body).toEqual(known.body)

    expect(await prisma.farmMember.count()).toBe(0)
    expect(await prisma.farmInvite.count()).toBe(0)
    expect(outbox).toHaveLength(0)
  })

  it('still work on the user\'s own farm', async () => {
    const owner = await createTestUser()
    const registered = await createTestUser()
    const own = await createTestFarm(owner.token)
    await enable(owner.token)

    const invite = await request
      .post(`/api/v1/farms/${own.id}/members/invites`)
      .set(auth(owner.token))
      .send({ role: 'operator' })
    expect(invite.status).toBe(201)

    const member = await request
      .post(`/api/v1/farms/${own.id}/members`)
      .set(auth(owner.token))
      .send({ email: registered.email, role: 'operator' })
    expect(member.status).toBe(201)
    expect(member.body.data.userId).toBe(registered.userId)
  })
})

describe('kept out of the farmer\'s records', () => {
  // A labor that became overdue yesterday is a digest trigger. Yesterday
  // on the FARM's calendar, like the digest itself: from 8 PM to midnight
  // in Puerto Rico the UTC date is already tomorrow, and "UTC yesterday"
  // is the farm's today — due, not overdue.
  const yesterday = (now: Date) => new Date(todayInAppTz(now).getTime() - DAY_MS)

  const verify = (userId: string) =>
    prisma.user.update({ where: { id: userId }, data: { emailVerified: true } })

  it('no digest when the only overdue labor is in the sample farm', async () => {
    const { token, userId } = await createTestUser()
    await verify(userId)
    const sampleId = await enable(token)
    const now = new Date()
    await prisma.recommendedOperation.updateMany({
      where: { status: 'due', plantingEvent: { field: { farmId: sampleId } } },
      data: { recommendedDate: yesterday(now) },
    })
    outbox = []

    expect((await runDailyDigest(now)).sent).toBe(0)
    expect(outbox).toHaveLength(0)

    // The flag is the only reason: the same farm, unflagged, does send.
    await prisma.farm.update({ where: { id: sampleId }, data: { isSample: false } })
    expect((await runDailyDigest(now)).sent).toBe(1)
  })

  it('the digest for a real farm does not mention the sample farm', async () => {
    const { token, userId, email } = await createTestUser()
    await verify(userId)
    const own = await createTestFarm(token, { name: 'Finca Real' })
    const field = await createTestField(token, own.id)
    const now = new Date()
    await seedRecommendedOp(field.id, {
      recommendedDate: yesterday(now).toISOString(), status: 'due',
    })
    await enable(token)
    outbox = []

    expect((await runDailyDigest(now)).sent).toBe(1)

    expect(outbox).toHaveLength(1)
    expect(outbox[0].to).toBe(email)
    // One overdue labor, no findings: the sample farm's are not counted
    expect(outbox[0].subject).toBe('Mi Finca PR — 1 labor vencida')
    expect(outbox[0].text).toContain('Finca Real')
    expect(outbox[0].text).not.toContain('Finca Demostración')
  })

  it('the backup export does not contain the sample farm', async () => {
    const { token, userId } = await createTestUser()
    const own = await createTestFarm(token, { name: 'Finca Real' })
    const sampleId = await enable(token)
    // A recipe default set on a farm names that farm in the backup too
    const crop = await prisma.cropType.create({
      data: { userId, name: 'Test crop', nameEs: 'Cultivo de prueba' },
    })
    const recipe = await prisma.recipe.create({
      data: { authorUserId: userId, cropTypeId: crop.id, name: 'Receta de prueba' },
    })
    for (const farmId of [own.id, sampleId]) {
      const set = await request
        .put('/api/v1/recipes/defaults')
        .set(auth(token))
        .send({ cropTypeId: crop.id, recipeId: recipe.id, scope: 'farm', farmId })
      expect(set.status).toBe(200)
    }

    const exp = await request.get('/api/v1/users/me/export').set(auth(token))

    expect(exp.status).toBe(200)
    const backup = JSON.parse(exp.text)
    expect(backup.farms.map((f: any) => f.id)).toEqual([own.id])
    expect(backup.recipeDefaults.map((d: any) => d.farmId)).toEqual([own.id])
    expect(exp.text).not.toContain(sampleId)
    expect(exp.text).not.toContain('Finca Demostración')
  })

  it('restoring a backup switches it off — it can be switched on again', async () => {
    const { token, userId } = await createTestUser()
    const own = await createTestFarm(token, { name: 'Finca Real' })
    await enable(token)
    const exp = await request.get('/api/v1/users/me/export').set(auth(token))

    // A restore replaces every farm the account owns
    const res = await request
      .post('/api/v1/users/me/restore')
      .set(auth(token))
      .send(JSON.parse(exp.text))

    expect(res.status).toBe(200)
    expect((await getStatus(token)).body.data).toEqual(OFF)
    const farms = await prisma.farm.findMany({ where: { userId } })
    expect(farms.map(f => f.id)).toEqual([own.id])
    expect(await prisma.plantingEvent.count()).toBe(0)

    const sampleId = await enable(token)
    expect((await sampleFarmsOf(userId)).map(f => f.id)).toEqual([sampleId])
  })
})

describe('demo accounts', () => {
  it('have no switch — the whole account already is the demo', async () => {
    const { token, userId } = await demoAccount()

    const status = await getStatus(token)
    expect(status.status).toBe(200)
    expect(status.body).toEqual({ success: true, data: OFF })

    for (const res of [
      await setSampleFarm(token, true),
      await setSampleFarm(token, false),
      await resetNow(token),
    ]) {
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
      expect(res.body.error.message).toMatch(/demostración/)
    }

    // The demo's own farm is a sample farm, and none of that touched it
    const farms = await request.get('/api/v1/farms').set(auth(token))
    expect(farms.body.data).toHaveLength(1)
    expect(farms.body.data[0]).toMatchObject({
      name: 'Finca Demostración', isSample: true, isFavorite: true,
    })
    expect(await sampleFarmsOf(userId)).toHaveLength(1)
  })

  it('still export their farm — it is all the account has', async () => {
    const { token } = await demoAccount()

    const exp = await request.get('/api/v1/users/me/export').set(auth(token))

    expect(JSON.parse(exp.text).farms).toHaveLength(1)
  })
})

describe('the user\'s first own farm', () => {
  it('takes the favorite over from the sample farm', async () => {
    const { token } = await createTestUser()
    const sampleId = await enable(token)
    const before = await request.get('/api/v1/farms').set(auth(token))
    expect(before.body.data.find((f: any) => f.id === sampleId).isFavorite).toBe(true)

    const own = await createTestFarm(token)
    expect(own.isFavorite).toBe(true)

    const list = await request.get('/api/v1/farms').set(auth(token))
    const favorites = list.body.data.filter((f: any) => f.isFavorite).map((f: any) => f.id)
    expect(favorites).toEqual([own.id])

    // …and only the first: a second farm leaves the favorite where it is.
    const second = await createTestFarm(token, { name: 'Segunda finca' })
    expect(second.isFavorite).toBe(false)
  })
})

describe('recipe evidence', () => {
  async function recipeWithPlantingIn(token: string, farmId: string, eventId: string) {
    await prisma.cropType.upsert({
      where: { id: 'platano_test' },
      update: {},
      create: { id: 'platano_test', name: 'Plantain', nameEs: 'Plátano', isBuiltIn: true },
    })
    const created = await request.post('/api/v1/recipes').set(auth(token)).send({
      cropTypeId: 'platano_test', name: 'Plátano de altura',
      schedule: {
        harvestWindowStartDays: 270, harvestWindowEndDays: 365,
        operations: [{ type: 'fertilization', labelEs: 'Abono inicial', offsetDays: 30 }],
      },
    })
    expect(created.status).toBe(201)
    const field = await createTestField(token, farmId, {
      plantingEvents: [{
        id: eventId, cropTypeId: 'platano_test', plantingDate: '2026-01-01',
        plantCount: 20, recipeVersionId: created.body.data.currentVersion.id,
      }],
    })
    expect(field.id).toBeDefined()
    const evidence = await request
      .get(`/api/v1/recipes/${created.body.data.id}/evidence`)
      .set(auth(token))
    expect(evidence.status).toBe(200)
    return evidence.body.data.versions.find((v: any) => v.number === 1)
  }

  it('does not count a planting made in the sample farm', async () => {
    const { token } = await createTestUser()
    const sampleId = await enable(token)
    const v1 = await recipeWithPlantingIn(token, sampleId, 'pe_sample_evidence')
    expect(v1.totals.plantings).toBe(0)
  })

  it('still counts a planting made in the user\'s own farm', async () => {
    const { token } = await createTestUser()
    await enable(token)
    const own = await createTestFarm(token)
    const v1 = await recipeWithPlantingIn(token, own.id, 'pe_own_evidence')
    expect(v1.totals.plantings).toBe(1)
  })

  it('counts a demo visitor\'s plantings — their farm is all there is', async () => {
    const demo = await demoAccount()
    const farm = await prisma.farm.findFirstOrThrow({ where: { userId: demo.userId } })
    const v1 = await recipeWithPlantingIn(demo.token, farm.id, 'pe_demo_evidence')
    expect(v1.totals.plantings).toBe(1)
  })
})
