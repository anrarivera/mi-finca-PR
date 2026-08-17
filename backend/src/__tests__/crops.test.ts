import { request, prisma, createTestUser, cleanDatabase } from './helpers'

// ── Crop knowledge base + recipes ───────────────────────────────────────
// Built-ins are readable by everyone and immutable in identity, but any
// user can save "mi calendario" for one — a per-user override row that
// wins over the seeded schedule for them alone. Custom crops carry their
// recipe on the base row and stay fully owner-editable.

const RECIPE = {
  harvestWindowStartDays: 300,
  harvestWindowEndDays: 420,
  operations: [
    { type: 'fertilization', labelEs: 'Abono inicial', offsetDays: 30 },
    { type: 'harvest', labelEs: 'Primera cosecha', offsetDays: 300, product: 'n/a' },
  ],
}

// A seeded built-in WITH a base schedule (like plátano) and one without
// (like aguacate — the gap that motivated recipes).
async function seedBuiltins() {
  await prisma.cropType.create({
    data: {
      id: 'platano_test', name: 'Plantain', nameEs: 'Plátano', emoji: '🍌',
      category: 'Frutales', isBuiltIn: true,
      schedules: {
        create: {
          harvestWindowStartDays: 270,
          harvestWindowEndDays: 365,
          operations: [{ id: 'seed-op-1', type: 'fertilization', labelEs: 'Abono del seed', offsetDays: 60 }],
        },
      },
    },
  })
  await prisma.cropType.create({
    data: {
      id: 'aguacate_test', name: 'Avocado', nameEs: 'Aguacate', emoji: '🥑',
      category: 'Frutales', isBuiltIn: true,
    },
  })
}

beforeEach(async () => {
  await cleanDatabase()
  await seedBuiltins()
})

afterAll(async () => {
  await cleanDatabase()
  await prisma.$disconnect()
})

describe('GET /api/v1/crops', () => {
  it('serves built-ins with their base schedule to anonymous callers', async () => {
    const res = await request.get('/api/v1/crops')
    expect(res.status).toBe(200)
    const platano = res.body.data.find((c: any) => c.id === 'platano_test')
    expect(platano.schedule.operations).toHaveLength(1)
    expect(platano.scheduleSource).toBe('default')
    const aguacate = res.body.data.find((c: any) => c.id === 'aguacate_test')
    expect(aguacate.schedule).toBeNull()
    expect(aguacate.scheduleSource).toBeNull()
  })

  it('hides other users custom crops', async () => {
    const ana = await createTestUser()
    const luis = await createTestUser()
    await request.post('/api/v1/crops')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ nameEs: 'Parcha especial' })

    const res = await request.get('/api/v1/crops')
      .set('Authorization', `Bearer ${luis.token}`)
    expect(res.body.data.some((c: any) => c.nameEs === 'Parcha especial')).toBe(false)
  })
})

describe('custom crop lifecycle', () => {
  it('creates a custom crop with a recipe, fills template ids', async () => {
    const user = await createTestUser()
    const res = await request.post('/api/v1/crops')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ nameEs: 'Aguacate injertado', schedule: RECIPE })
    expect(res.status).toBe(201)
    expect(res.body.data.schedule.operations).toHaveLength(2)
    for (const op of res.body.data.schedule.operations) {
      expect(typeof op.id).toBe('string')
      expect(op.id.length).toBeGreaterThan(0)
    }
    expect(res.body.data.scheduleSource).toBe('default')
  })

  it('updates and removes the recipe through the legacy PUT tri-state', async () => {
    const user = await createTestUser()
    const created = await request.post('/api/v1/crops')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ nameEs: 'Aguacate injertado', schedule: RECIPE })
    const cropId = created.body.data.id

    const updated = await request.put(`/api/v1/crops/${cropId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ schedule: { ...RECIPE, harvestWindowStartDays: 310 } })
    expect(updated.status).toBe(200)
    expect(updated.body.data.schedule.harvestWindowStartDays).toBe(310)

    const removed = await request.put(`/api/v1/crops/${cropId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ schedule: null })
    expect(removed.body.data.schedule).toBeNull()
    expect(await prisma.cropSchedule.count({ where: { cropTypeId: cropId } })).toBe(0)
  })

  it('deleting a custom crop cascades its schedule rows', async () => {
    const user = await createTestUser()
    const created = await request.post('/api/v1/crops')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ nameEs: 'Aguacate injertado', schedule: RECIPE })
    const cropId = created.body.data.id

    const res = await request.delete(`/api/v1/crops/${cropId}`)
      .set('Authorization', `Bearer ${user.token}`)
    expect(res.status).toBe(200)
    expect(await prisma.cropSchedule.count({ where: { cropTypeId: cropId } })).toBe(0)
  })

  it('keeps built-in identity immutable and other users crops invisible', async () => {
    const ana = await createTestUser()
    const luis = await createTestUser()
    const builtinPut = await request.put('/api/v1/crops/platano_test')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ nameEs: 'Plátano hackeado' })
    expect(builtinPut.status).toBe(404)

    const created = await request.post('/api/v1/crops')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ nameEs: 'Parcha especial' })
    const foreign = await request.put(`/api/v1/crops/${created.body.data.id}`)
      .set('Authorization', `Bearer ${luis.token}`)
      .send({ nameEs: 'Robada' })
    expect(foreign.status).toBe(404)
  })
})

describe('PUT /api/v1/crops/:id/schedule — "mi calendario"', () => {
  it('overrides a built-in schedule for the caller only', async () => {
    const ana = await createTestUser()
    const luis = await createTestUser()

    const saved = await request.put('/api/v1/crops/platano_test/schedule')
      .set('Authorization', `Bearer ${ana.token}`)
      .send(RECIPE)
    expect(saved.status).toBe(200)
    expect(saved.body.data.schedule.operations).toHaveLength(2)
    expect(saved.body.data.scheduleSource).toBe('user')

    // Ana lists her recipe; Luis still gets the seeded schedule.
    const anaList = await request.get('/api/v1/crops')
      .set('Authorization', `Bearer ${ana.token}`)
    const anaPlatano = anaList.body.data.find((c: any) => c.id === 'platano_test')
    expect(anaPlatano.schedule.harvestWindowStartDays).toBe(300)
    expect(anaPlatano.scheduleSource).toBe('user')

    const luisList = await request.get('/api/v1/crops')
      .set('Authorization', `Bearer ${luis.token}`)
    const luisPlatano = luisList.body.data.find((c: any) => c.id === 'platano_test')
    expect(luisPlatano.schedule.harvestWindowStartDays).toBe(270)
    expect(luisPlatano.scheduleSource).toBe('default')

    // The seeded base row is untouched underneath.
    expect(await prisma.cropSchedule.count({ where: { cropTypeId: 'platano_test' } })).toBe(2)
  })

  it('gives a schedule-less built-in a recipe (the avocado gap)', async () => {
    const user = await createTestUser()
    const saved = await request.put('/api/v1/crops/aguacate_test/schedule')
      .set('Authorization', `Bearer ${user.token}`)
      .send(RECIPE)
    expect(saved.status).toBe(200)
    expect(saved.body.data.scheduleSource).toBe('user')

    // Anonymous callers still see no schedule.
    const anon = await request.get('/api/v1/crops')
    expect(anon.body.data.find((c: any) => c.id === 'aguacate_test').schedule).toBeNull()
  })

  it('saving twice replaces the override instead of stacking rows', async () => {
    const user = await createTestUser()
    await request.put('/api/v1/crops/platano_test/schedule')
      .set('Authorization', `Bearer ${user.token}`)
      .send(RECIPE)
    const again = await request.put('/api/v1/crops/platano_test/schedule')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ ...RECIPE, harvestWindowEndDays: 500 })
    expect(again.body.data.schedule.harvestWindowEndDays).toBe(500)
    expect(await prisma.cropSchedule.count({
      where: { cropTypeId: 'platano_test', userId: user.userId },
    })).toBe(1)
  })

  it('edits the base recipe of an own custom crop', async () => {
    const user = await createTestUser()
    const created = await request.post('/api/v1/crops')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ nameEs: 'Aguacate injertado', schedule: RECIPE })
    const cropId = created.body.data.id

    const saved = await request.put(`/api/v1/crops/${cropId}/schedule`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ ...RECIPE, harvestWindowStartDays: 350 })
    expect(saved.body.data.schedule.harvestWindowStartDays).toBe(350)
    // Base row edited in place — no override row minted for own crops.
    expect(await prisma.cropSchedule.count({ where: { cropTypeId: cropId } })).toBe(1)
    expect(saved.body.data.scheduleSource).toBe('default')
  })

  it('rejects foreign custom crops, bad windows, and anonymous saves', async () => {
    const ana = await createTestUser()
    const luis = await createTestUser()
    const created = await request.post('/api/v1/crops')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ nameEs: 'Parcha especial' })

    const foreign = await request.put(`/api/v1/crops/${created.body.data.id}/schedule`)
      .set('Authorization', `Bearer ${luis.token}`)
      .send(RECIPE)
    expect(foreign.status).toBe(404)

    const badWindow = await request.put('/api/v1/crops/platano_test/schedule')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ ...RECIPE, harvestWindowStartDays: 500, harvestWindowEndDays: 100 })
    expect(badWindow.status).toBe(400)

    const badType = await request.put('/api/v1/crops/platano_test/schedule')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ ...RECIPE, operations: [{ type: 'brujeria', labelEs: 'x', offsetDays: 1 }] })
    expect(badType.status).toBe(400)

    const anon = await request.put('/api/v1/crops/platano_test/schedule').send(RECIPE)
    expect(anon.status).toBe(401)
  })
})

describe('DELETE /api/v1/crops/:id/schedule', () => {
  it('reverts a built-in override to the seeded default', async () => {
    const user = await createTestUser()
    await request.put('/api/v1/crops/platano_test/schedule')
      .set('Authorization', `Bearer ${user.token}`)
      .send(RECIPE)

    const res = await request.delete('/api/v1/crops/platano_test/schedule')
      .set('Authorization', `Bearer ${user.token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.schedule.harvestWindowStartDays).toBe(270)
    expect(res.body.data.scheduleSource).toBe('default')
  })

  it('leaves an own custom crop recipe-less', async () => {
    const user = await createTestUser()
    const created = await request.post('/api/v1/crops')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ nameEs: 'Aguacate injertado', schedule: RECIPE })

    const res = await request.delete(`/api/v1/crops/${created.body.data.id}/schedule`)
      .set('Authorization', `Bearer ${user.token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.schedule).toBeNull()
  })
})

describe('backup roundtrip', () => {
  it('carries built-in overrides through export → clear → restore', async () => {
    const user = await createTestUser()
    await request.put('/api/v1/crops/platano_test/schedule')
      .set('Authorization', `Bearer ${user.token}`)
      .send(RECIPE)

    const exp = await request.get('/api/v1/users/me/export')
      .set('Authorization', `Bearer ${user.token}`)
    const backup = JSON.parse(exp.text)
    expect(backup.scheduleOverrides).toHaveLength(1)

    await request.post('/api/v1/users/me/clear-data')
      .set('Authorization', `Bearer ${user.token}`)
    expect(await prisma.cropSchedule.count({ where: { userId: user.userId } })).toBe(0)

    const rst = await request.post('/api/v1/users/me/restore')
      .set('Authorization', `Bearer ${user.token}`)
      .send(backup)
    expect(rst.status).toBe(200)

    const list = await request.get('/api/v1/crops')
      .set('Authorization', `Bearer ${user.token}`)
    const platano = list.body.data.find((c: any) => c.id === 'platano_test')
    expect(platano.scheduleSource).toBe('user')
    expect(platano.schedule.harvestWindowStartDays).toBe(300)
  })
})
