import {
  request, prisma, createTestUser, createTestFarm, createTestField,
  addFarmMember, cleanDatabase,
} from './helpers'

// ── Recipes (Recetas de Cultivo design) ─────────────────────────────────
// Versions freeze on first planting reference and edits mint the next
// number (R1). The resolved endpoint materializes the R2 ladder — field
// default → farm default → the farm OWNER's personal default → system
// recipe — and the planter's own recipes never apply. Defaults at farm/
// field scope are admin+ and pick from the owner's recipes (R4).

const SCHEDULE = {
  harvestWindowStartDays: 270,
  harvestWindowEndDays: 365,
  operations: [
    { type: 'fertilization', labelEs: 'Abono inicial', offsetDays: 30 },
    { type: 'harvest', labelEs: 'Primera cosecha', offsetDays: 270 },
  ],
}

let systemVersionId: string

async function seedBuiltins() {
  await prisma.cropType.create({
    data: {
      id: 'platano_test', name: 'Plantain', nameEs: 'Plátano', emoji: '🍌',
      category: 'Frutales', isBuiltIn: true,
    },
  })
  await prisma.cropType.create({
    data: {
      id: 'aguacate_test', name: 'Avocado', nameEs: 'Aguacate', emoji: '🥑',
      category: 'Frutales', isBuiltIn: true,
    },
  })
  const system = await prisma.recipe.create({
    data: {
      cropTypeId: 'platano_test', authorUserId: null,
      name: 'Calendario base', visibility: 'public',
      versions: {
        create: {
          number: 1, harvestWindowStartDays: 240, harvestWindowEndDays: 330,
          operations: [{ id: 'sys-op-1', type: 'fertilization', labelEs: 'Abono del sistema', offsetDays: 60 }],
        },
      },
    },
    include: { versions: true },
  })
  systemVersionId = system.versions[0].id
}

async function createRecipe(token: string, overrides?: object) {
  const res = await request.post('/api/v1/recipes')
    .set('Authorization', `Bearer ${token}`)
    .send({ cropTypeId: 'platano_test', name: 'Plátano de altura', schedule: SCHEDULE, ...overrides })
  return res.body.data
}

// A planting that stamps from a recipe version — the reference freezes it.
async function plantWithVersion(token: string, farmId: string, versionId: string | null) {
  return createTestField(token, farmId, {
    plantingEvents: [{
      id: `pe_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      cropTypeId: 'platano_test',
      plantingDate: '2026-06-01',
      plantCount: 10,
      recipeVersionId: versionId,
      operations: [],
    }],
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

describe('recipe CRUD', () => {
  it('authors a recipe as v1 with template ids filled', async () => {
    const user = await createTestUser()
    const recipe = await createRecipe(user.token)
    expect(recipe.currentVersion.number).toBe(1)
    expect(recipe.currentVersion.referenced).toBe(false)
    expect(recipe.currentVersion.operations).toHaveLength(2)
    for (const op of recipe.currentVersion.operations) {
      expect(typeof op.id).toBe('string')
      expect(op.id.length).toBeGreaterThan(0)
    }
  })

  it('allows several recipes per crop — comparison is the point', async () => {
    const user = await createTestUser()
    await createRecipe(user.token, { name: 'Plátano de riego' })
    await createRecipe(user.token, { name: 'Plátano de secano' })
    const list = await request.get('/api/v1/recipes?cropTypeId=platano_test')
      .set('Authorization', `Bearer ${user.token}`)
    const own = list.body.data.filter((r: any) => r.authorUserId !== null)
    expect(own).toHaveLength(2)
  })

  it('lists system recipes plus own — never other users’', async () => {
    const ana = await createTestUser()
    const luis = await createTestUser()
    await createRecipe(ana.token)
    const list = await request.get('/api/v1/recipes')
      .set('Authorization', `Bearer ${luis.token}`)
    expect(list.body.data.some((r: any) => r.authorUserId === null)).toBe(true)
    expect(list.body.data.some((r: any) => r.name === 'Plátano de altura')).toBe(false)
  })

  it('only the author edits: foreign and system recipes 404', async () => {
    const ana = await createTestUser()
    const luis = await createTestUser()
    const recipe = await createRecipe(ana.token)

    const foreign = await request.put(`/api/v1/recipes/${recipe.id}`)
      .set('Authorization', `Bearer ${luis.token}`)
      .send({ name: 'Robada' })
    expect(foreign.status).toBe(404)

    const system = await prisma.recipe.findFirst({ where: { authorUserId: null } })
    const sysEdit = await request.put(`/api/v1/recipes/${system!.id}/schedule`)
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ schedule: SCHEDULE })
    expect(sysEdit.status).toBe(404)
  })

  it('rejects recipes on invisible crops and bad windows', async () => {
    const ana = await createTestUser()
    const luis = await createTestUser()
    const cropRes = await request.post('/api/v1/crops')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ nameEs: 'Parcha especial' })

    const onForeign = await request.post('/api/v1/recipes')
      .set('Authorization', `Bearer ${luis.token}`)
      .send({ cropTypeId: cropRes.body.data.id, name: 'x', schedule: SCHEDULE })
    expect(onForeign.status).toBe(404)

    const badWindow = await request.post('/api/v1/recipes')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({
        cropTypeId: 'platano_test', name: 'x',
        schedule: { ...SCHEDULE, harvestWindowStartDays: 500, harvestWindowEndDays: 100 },
      })
    expect(badWindow.status).toBe(400)
  })
})

describe('versioning (R1: freeze on reference)', () => {
  it('edits an unreferenced version in place', async () => {
    const user = await createTestUser()
    const recipe = await createRecipe(user.token)
    const edited = await request.put(`/api/v1/recipes/${recipe.id}/schedule`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ schedule: { ...SCHEDULE, harvestWindowStartDays: 300 } })
    expect(edited.body.data.currentVersion.number).toBe(1)
    expect(edited.body.data.currentVersion.harvestWindowStartDays).toBe(300)
    expect(await prisma.recipeVersion.count({ where: { recipeId: recipe.id } })).toBe(1)
  })

  it('a planting reference freezes the version; the next edit mints v2', async () => {
    const user = await createTestUser()
    const recipe = await createRecipe(user.token)
    const farm = await createTestFarm(user.token)
    const field = await plantWithVersion(user.token, farm.id, recipe.currentVersion.id)

    // The reference round-trips and the version is now frozen.
    expect(field.plantingEvents[0].recipeVersionId).toBe(recipe.currentVersion.id)
    const frozen = await prisma.recipeVersion.findUnique({ where: { id: recipe.currentVersion.id } })
    expect(frozen!.referencedAt).not.toBeNull()

    const edited = await request.put(`/api/v1/recipes/${recipe.id}/schedule`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ schedule: { ...SCHEDULE, harvestWindowStartDays: 300 }, note: 'más abono' })
    expect(edited.body.data.currentVersion.number).toBe(2)
    expect(edited.body.data.currentVersion.note).toBe('más abono')

    // v1 is untouched — the evidence stays honest.
    const v1 = await prisma.recipeVersion.findUnique({ where: { id: recipe.currentVersion.id } })
    expect(v1!.harvestWindowStartDays).toBe(SCHEDULE.harvestWindowStartDays)
  })

  it('an unknown recipeVersionId on a planting degrades to null, not a 500', async () => {
    const user = await createTestUser()
    const farm = await createTestFarm(user.token)
    const field = await plantWithVersion(user.token, farm.id, 'no-such-version')
    expect(field.plantingEvents[0].recipeVersionId).toBeNull()
  })
})

describe('deletion vs archive', () => {
  it('hard-deletes an unreferenced recipe', async () => {
    const user = await createTestUser()
    const recipe = await createRecipe(user.token)
    const res = await request.delete(`/api/v1/recipes/${recipe.id}`)
      .set('Authorization', `Bearer ${user.token}`)
    expect(res.body.data.deleted).toBe(true)
    expect(await prisma.recipe.count({ where: { id: recipe.id } })).toBe(0)
  })

  it('archives a referenced recipe (evidence survives) and clears its defaults', async () => {
    const user = await createTestUser()
    const recipe = await createRecipe(user.token)
    const farm = await createTestFarm(user.token)
    await plantWithVersion(user.token, farm.id, recipe.currentVersion.id)
    await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: recipe.id, scope: 'user' })

    const res = await request.delete(`/api/v1/recipes/${recipe.id}`)
      .set('Authorization', `Bearer ${user.token}`)
    expect(res.body.data.archived).toBe(true)
    expect(await prisma.recipe.count({ where: { id: recipe.id } })).toBe(1)
    expect(await prisma.recipeDefault.count({ where: { recipeId: recipe.id } })).toBe(0)

    // Archived recipes leave the default listing.
    const list = await request.get('/api/v1/recipes')
      .set('Authorization', `Bearer ${user.token}`)
    expect(list.body.data.some((r: any) => r.id === recipe.id)).toBe(false)
  })
})

describe('resolved ladder (R2)', () => {
  it('resolves field default → farm default → owner personal → system', async () => {
    const owner = await createTestUser()
    const farm = await createTestFarm(owner.token)
    const field = await createTestField(owner.token, farm.id)

    // Rung 4: nothing set — system recipe resolves.
    let res = await request.get(`/api/v1/recipes/resolved?farmId=${farm.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    let entry = res.body.data.entries.find((e: any) => e.cropTypeId === 'platano_test' && e.fieldId === null)
    expect(entry.authorUserId).toBeNull()
    expect(entry.versionId).toBe(systemVersionId)

    // Rung 3: owner's personal default wins over system.
    const personal = await createRecipe(owner.token, { name: 'Mi plátano' })
    await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: personal.id, scope: 'user' })
    res = await request.get(`/api/v1/recipes/resolved?farmId=${farm.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    entry = res.body.data.entries.find((e: any) => e.cropTypeId === 'platano_test' && e.fieldId === null)
    expect(entry.recipeId).toBe(personal.id)

    // Rung 2: farm default wins over personal.
    const farmRecipe = await createRecipe(owner.token, { name: 'Plátano de esta finca' })
    await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: farmRecipe.id, scope: 'farm', farmId: farm.id })
    res = await request.get(`/api/v1/recipes/resolved?farmId=${farm.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    entry = res.body.data.entries.find((e: any) => e.cropTypeId === 'platano_test' && e.fieldId === null)
    expect(entry.recipeId).toBe(farmRecipe.id)

    // Rung 1: a field default appears as its own entry.
    const fieldRecipe = await createRecipe(owner.token, { name: 'Plátano de la ladera' })
    await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: fieldRecipe.id, scope: 'field', farmId: farm.id, fieldId: field.id })
    res = await request.get(`/api/v1/recipes/resolved?farmId=${farm.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    const fieldEntry = res.body.data.entries.find((e: any) => e.fieldId === field.id)
    expect(fieldEntry.recipeId).toBe(fieldRecipe.id)
    // The farm-level entry still resolves independently.
    entry = res.body.data.entries.find((e: any) => e.cropTypeId === 'platano_test' && e.fieldId === null)
    expect(entry.recipeId).toBe(farmRecipe.id)
  })

  it('the owner’s plan governs — a member’s own recipes never apply', async () => {
    const owner = await createTestUser()
    const worker = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await addFarmMember(farm.id, worker.userId, 'operator')

    // The worker has their own personal default for the crop.
    const workerRecipe = await createRecipe(worker.token, { name: 'Mi versión' })
    await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: workerRecipe.id, scope: 'user' })

    // On the owner's farm, the worker still resolves to the system recipe.
    const res = await request.get(`/api/v1/recipes/resolved?farmId=${farm.id}`)
      .set('Authorization', `Bearer ${worker.token}`)
    expect(res.status).toBe(200)
    const entry = res.body.data.entries.find((e: any) => e.cropTypeId === 'platano_test' && e.fieldId === null)
    expect(entry.recipeId).not.toBe(workerRecipe.id)
    expect(entry.authorUserId).toBeNull()
  })

  it('outsiders get a 404', async () => {
    const owner = await createTestUser()
    const outsider = await createTestUser()
    const farm = await createTestFarm(owner.token)
    const res = await request.get(`/api/v1/recipes/resolved?farmId=${farm.id}`)
      .set('Authorization', `Bearer ${outsider.token}`)
    expect(res.status).toBe(404)
  })
})

describe('defaults permissions (R4)', () => {
  it('operators cannot set farm defaults; admins can, from the owner’s recipes only', async () => {
    const owner = await createTestUser()
    const admin = await createTestUser()
    const operator = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await addFarmMember(farm.id, admin.userId, 'admin')
    await addFarmMember(farm.id, operator.userId, 'operator')
    const ownerRecipe = await createRecipe(owner.token)

    const asOperator = await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: ownerRecipe.id, scope: 'farm', farmId: farm.id })
    expect(asOperator.status).toBe(403)

    const asAdmin = await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: ownerRecipe.id, scope: 'farm', farmId: farm.id })
    expect(asAdmin.status).toBe(200)

    // The admin's own recipe is not eligible as a farm default —
    // the farm plants by the OWNER's cookbook.
    const adminRecipe = await createRecipe(admin.token, { name: 'Del administrador' })
    const notEligible = await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: adminRecipe.id, scope: 'farm', farmId: farm.id })
    expect(notEligible.status).toBe(404)
  })

  it('clears a default with recipeId null, and re-setting replaces in place', async () => {
    const user = await createTestUser()
    const a = await createRecipe(user.token, { name: 'A' })
    const b = await createRecipe(user.token, { name: 'B' })

    await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: a.id, scope: 'user' })
    await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: b.id, scope: 'user' })
    expect(await prisma.recipeDefault.count({ where: { userId: user.userId } })).toBe(1)

    await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: null, scope: 'user' })
    expect(await prisma.recipeDefault.count({ where: { userId: user.userId } })).toBe(0)
  })

  it('GET /defaults lists personal pointers, plus farm pointers with farmId', async () => {
    const owner = await createTestUser()
    const worker = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await addFarmMember(farm.id, worker.userId, 'operator')
    const recipe = await createRecipe(owner.token)

    await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: recipe.id, scope: 'user' })
    await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: recipe.id, scope: 'farm', farmId: farm.id })

    const mine = await request.get(`/api/v1/recipes/defaults?farmId=${farm.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(mine.body.data.personal).toEqual([{ cropTypeId: 'platano_test', recipeId: recipe.id }])
    expect(mine.body.data.farm).toEqual([{ cropTypeId: 'platano_test', recipeId: recipe.id, fieldId: null }])

    // The operator sees the farm's pointers but not the owner's personal ones.
    const theirs = await request.get(`/api/v1/recipes/defaults?farmId=${farm.id}`)
      .set('Authorization', `Bearer ${worker.token}`)
    expect(theirs.body.data.personal).toEqual([])
    expect(theirs.body.data.farm).toHaveLength(1)

    // Outsiders are refused farm context.
    const outsider = await createTestUser()
    const refused = await request.get(`/api/v1/recipes/defaults?farmId=${farm.id}`)
      .set('Authorization', `Bearer ${outsider.token}`)
    expect(refused.status).toBe(404)
  })

  it('field-scope defaults require the field to belong to the farm', async () => {
    const owner = await createTestUser()
    const farm = await createTestFarm(owner.token)
    const otherFarm = await createTestFarm(owner.token, { name: 'Otra finca' })
    const foreignField = await createTestField(owner.token, otherFarm.id)
    const recipe = await createRecipe(owner.token)

    const res = await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        cropTypeId: 'platano_test', recipeId: recipe.id,
        scope: 'field', farmId: farm.id, fieldId: foreignField.id,
      })
    expect(res.status).toBe(404)
  })
})

describe('backup roundtrip', () => {
  it('recipes, versions, defaults, and planting references survive export → clear → restore', async () => {
    const user = await createTestUser()
    const recipe = await createRecipe(user.token)
    await request.put('/api/v1/recipes/defaults')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ cropTypeId: 'platano_test', recipeId: recipe.id, scope: 'user' })
    const farm = await createTestFarm(user.token)
    await plantWithVersion(user.token, farm.id, recipe.currentVersion.id)

    const exp = await request.get('/api/v1/users/me/export')
      .set('Authorization', `Bearer ${user.token}`)
    const backup = JSON.parse(exp.text)
    expect(backup.recipes).toHaveLength(1)
    expect(backup.recipeDefaults).toHaveLength(1)

    await request.post('/api/v1/users/me/clear-data')
      .set('Authorization', `Bearer ${user.token}`)
    expect(await prisma.recipe.count({ where: { authorUserId: user.userId } })).toBe(0)

    const rst = await request.post('/api/v1/users/me/restore')
      .set('Authorization', `Bearer ${user.token}`)
      .send(backup)
    expect(rst.status).toBe(200)

    const restored = await prisma.recipe.findFirst({
      where: { authorUserId: user.userId },
      include: { versions: true, defaults: true },
    })
    expect(restored!.name).toBe('Plátano de altura')
    expect(restored!.versions[0].id).toBe(recipe.currentVersion.id)
    expect(restored!.versions[0].referencedAt).not.toBeNull()
    expect(restored!.defaults).toHaveLength(1)

    const event = await prisma.plantingEvent.findFirst({
      where: { field: { farm: { userId: user.userId } } },
    })
    expect(event!.recipeVersionId).toBe(recipe.currentVersion.id)
  })
})
