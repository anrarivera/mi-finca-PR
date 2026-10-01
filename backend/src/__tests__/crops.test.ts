import { request, prisma, createTestUser, cleanDatabase } from './helpers'

// ── Crops are IDENTITY only (name/emoji/category) — practice lives on
// recipes (recipes.test.ts). Built-ins are immutable through the API;
// custom crops are owner-private.

async function seedBuiltins() {
  await prisma.cropType.create({
    data: {
      id: 'platano_test', name: 'Plantain', nameEs: 'Plátano', emoji: '🍌',
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
  it('serves built-ins to anonymous callers, plus own custom crops when authed', async () => {
    const ana = await createTestUser()
    const luis = await createTestUser()
    await request.post('/api/v1/crops')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ nameEs: 'Parcha especial' })

    const anon = await request.get('/api/v1/crops')
    expect(anon.status).toBe(200)
    expect(anon.body.data.some((c: any) => c.id === 'platano_test')).toBe(true)
    expect(anon.body.data.some((c: any) => c.nameEs === 'Parcha especial')).toBe(false)

    const asAna = await request.get('/api/v1/crops')
      .set('Authorization', `Bearer ${ana.token}`)
    expect(asAna.body.data.some((c: any) => c.nameEs === 'Parcha especial')).toBe(true)

    const asLuis = await request.get('/api/v1/crops')
      .set('Authorization', `Bearer ${luis.token}`)
    expect(asLuis.body.data.some((c: any) => c.nameEs === 'Parcha especial')).toBe(false)
  })
})

describe('custom crop lifecycle', () => {
  it('creates, updates, and deletes an own custom crop', async () => {
    const user = await createTestUser()
    const created = await request.post('/api/v1/crops')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ nameEs: 'Guanábana', emoji: '🍈' })
    expect(created.status).toBe(201)
    const cropId = created.body.data.id

    const updated = await request.put(`/api/v1/crops/${cropId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ nameEs: 'Guanábana criolla' })
    expect(updated.body.data.nameEs).toBe('Guanábana criolla')

    const deleted = await request.delete(`/api/v1/crops/${cropId}`)
      .set('Authorization', `Bearer ${user.token}`)
    expect(deleted.status).toBe(200)
    expect(await prisma.cropType.count({ where: { id: cropId } })).toBe(0)
  })

  it('deleting a custom crop cascades its recipes and versions', async () => {
    const user = await createTestUser()
    const created = await request.post('/api/v1/crops')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ nameEs: 'Guanábana' })
    const cropId = created.body.data.id

    const recipe = await request.post('/api/v1/recipes')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        cropTypeId: cropId, name: 'Mi guanábana',
        schedule: { harvestWindowStartDays: 700, harvestWindowEndDays: 900, operations: [] },
      })
    expect(recipe.status).toBe(201)

    await request.delete(`/api/v1/crops/${cropId}`)
      .set('Authorization', `Bearer ${user.token}`)
    expect(await prisma.recipe.count({ where: { cropTypeId: cropId } })).toBe(0)
    expect(await prisma.recipeVersion.count({ where: { recipe: { cropTypeId: cropId } } })).toBe(0)
  })

  it('keeps built-in identity immutable and foreign custom crops invisible', async () => {
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

    const anonPost = await request.post('/api/v1/crops').send({ nameEs: 'Sin cuenta' })
    expect(anonPost.status).toBe(401)
  })
})
