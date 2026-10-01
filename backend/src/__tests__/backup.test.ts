import { randomUUID } from 'crypto'
import request from 'supertest'
import app from '../index'
import { prisma } from '../lib/prisma'
import {
  createTestUser, createTestFarm, createTestField, seedRecommendedOp, cleanDatabase,
} from './helpers'

// The backup contract: export EVERYTHING → clear → restore → identical
// counts, with internal links (check-offs, yields, findings) intact.
// The demo seeder provides a maximally-linked farm to roundtrip.
describe('backup export / clear / restore', () => {
  async function demoAccount() {
    const res = await request(app).post('/api/v1/auth/demo')
    return { token: res.body.data.accessToken as string, userId: res.body.data.user.id as string }
  }

  async function counts(userId: string) {
    const farms = await prisma.farm.count({ where: { userId } })
    const fields = await prisma.field.count({ where: { farm: { userId } } })
    const rows = await prisma.fieldRow.count({ where: { field: { farm: { userId } } } })
    const plants = await prisma.plantInstance.count({ where: { field: { farm: { userId } } } })
    const recOps = await prisma.recommendedOperation.count({
      where: { plantingEvent: { field: { farm: { userId } } } },
    })
    const operations = await prisma.operation.count({ where: { farm: { userId } } })
    const harvests = await prisma.harvestYield.count({ where: { farm: { userId } } })
    const findings = await prisma.finding.count({ where: { field: { farm: { userId } } } })
    const livestock = await prisma.livestockUnit.count({ where: { farm: { userId } } })
    return { farms, fields, rows, plants, recOps, operations, harvests, findings, livestock }
  }

  it('roundtrips a fully-linked account', async () => {
    const { token, userId } = await demoAccount()
    const before = await counts(userId)
    expect(before.farms).toBe(1)
    expect(before.plants).toBeGreaterThan(100)

    // Export
    const exp = await request(app)
      .get('/api/v1/users/me/export')
      .set('Authorization', `Bearer ${token}`)
    expect(exp.status).toBe(200)
    const backup = JSON.parse(exp.text)
    expect(backup.app).toBe('mi-finca-pr')
    expect(backup.version).toBe(2)
    expect(backup.farms).toHaveLength(1)

    // Clear — everything owned is gone
    const clr = await request(app)
      .post('/api/v1/users/me/clear-data')
      .set('Authorization', `Bearer ${token}`)
    expect(clr.status).toBe(200)
    const empty = await counts(userId)
    expect(empty).toEqual({
      farms: 0, fields: 0, rows: 0, plants: 0, recOps: 0,
      operations: 0, harvests: 0, findings: 0, livestock: 0,
    })

    // Restore — identical counts
    const rst = await request(app)
      .post('/api/v1/users/me/restore')
      .set('Authorization', `Bearer ${token}`)
      .send(backup)
    expect(rst.status).toBe(200)
    const after = await counts(userId)
    expect(after).toEqual(before)

    // Internal links survived: the completed check-off still points at its
    // log entry, and the herd is still assigned to its corral.
    const linkedCheckOffs = await prisma.recommendedOperation.count({
      where: {
        plantingEvent: { field: { farm: { userId } } },
        completedOperationId: { not: null },
      },
    })
    expect(linkedCheckOffs).toBeGreaterThanOrEqual(1)
    const herd = await prisma.livestockUnit.findFirst({ where: { farm: { userId } } })
    expect(herd?.fieldId).toBeTruthy()
  })

  it('rejects v1 backups with a clear message', async () => {
    const { token } = await demoAccount()
    const res = await request(app)
      .post('/api/v1/users/me/restore')
      .set('Authorization', `Bearer ${token}`)
      .send({ app: 'mi-finca-pr', version: 1, farms: [], fields: [], livestock: [] })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('versión anterior')
  })

  it('rejects garbage', async () => {
    const { token } = await demoAccount()
    const res = await request(app)
      .post('/api/v1/users/me/restore')
      .set('Authorization', `Bearer ${token}`)
      .send({ app: 'otra-app', version: 2, farms: [] })
    expect(res.status).toBe(400)
  })
})

// A backup is a file the user uploads, so every id in it is untrusted. A
// reference may only land on a row restored into the same farm — never on
// one that merely exists somewhere else in the database.
describe('restore keeps every reference inside the restored farm', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterAll(async () => { await cleanDatabase() })

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

  const restore = (token: string, backup: object) =>
    request(app).post('/api/v1/users/me/restore').set(auth(token)).send(backup)

  // Hand-written v2 backup: one farm, shaped by the overrides.
  const backupOf = (farm: object, extra: object = {}) => ({
    app: 'mi-finca-pr',
    version: 2,
    farms: [{ id: randomUUID(), name: 'Finca restaurada', location: 'Lares, PR', ...farm }],
    ...extra,
  })

  const fieldEntry = (overrides: object = {}) => ({
    id: randomUUID(), name: 'Campo restaurado', color: '#22c55e', shape: 'rectangle',
    farmLat: 18.26, farmLng: -66.71, ...overrides,
  })

  const recipeEntry = (overrides: object = {}) => ({
    id: randomUUID(), cropTypeId: 'platano_test', name: 'Mi receta',
    versions: [{
      id: randomUUID(), number: 1,
      harvestWindowStartDays: 240, harvestWindowEndDays: 330, operations: [],
    }],
    ...overrides,
  })

  async function seedBuiltinCrop() {
    await prisma.cropType.create({
      data: { id: 'platano_test', name: 'Plantain', nameEs: 'Plátano', isBuiltIn: true },
    })
  }

  // Another account holding one of everything a backup could point at.
  async function victimAccount() {
    const user = await createTestUser()
    const farm = await createTestFarm(user.token)
    const field = await createTestField(user.token, farm.id)
    const { event, recOp } = await seedRecommendedOp(field.id)
    const herd = await prisma.livestockUnit.create({
      data: {
        farmId: farm.id, name: 'Cabras', animalType: 'goats',
        currentCount: 4, acquisitionDate: new Date('2026-01-10'),
      },
    })
    const operation = await prisma.operation.create({
      data: { farmId: farm.id, fieldId: field.id, type: 'harvest', actualDate: new Date('2026-08-01') },
    })
    return { ...user, farm, field, event, recOp, herd, operation }
  }

  async function victimRecipe(userId: string, cropTypeId: string) {
    return prisma.recipe.create({
      data: {
        authorUserId: userId, cropTypeId, name: 'Receta secreta',
        versions: { create: { number: 1, harvestWindowStartDays: 240, harvestWindowEndDays: 330 } },
      },
      include: { versions: true },
    })
  }

  it('skips a finding aimed at another account field', async () => {
    const victim = await victimAccount()
    const caller = await createTestUser()
    const ownField = fieldEntry()
    const foreignFindingId = randomUUID()
    const ownFindingId = randomUUID()

    const res = await restore(caller.token, backupOf({
      fields: [ownField],
      findings: [
        {
          id: foreignFindingId, fieldId: victim.field.id,
          pestId: 'broca_cafe', severity: 3, foundDate: '2026-08-01',
          observations: [{ id: randomUUID(), date: '2026-08-01', severity: 3 }],
        },
        {
          id: ownFindingId, fieldId: ownField.id,
          pestId: 'broca_cafe', severity: 2, foundDate: '2026-08-01',
          treatmentRecommendedOperationId: victim.recOp.id,
        },
      ],
    }))
    expect(res.status).toBe(200)

    expect(await prisma.finding.findUnique({ where: { id: foreignFindingId } })).toBeNull()
    const victimList = await request(app)
      .get(`/api/v1/farms/${victim.farm.id}/findings`)
      .set(auth(victim.token))
    expect(victimList.body.data).toHaveLength(0)

    // The rest of the file restores — minus the foreign treatment link.
    const own = await prisma.finding.findUnique({ where: { id: ownFindingId } })
    expect(own).toMatchObject({ fieldId: ownField.id, treatmentRecommendedOperationId: null })
  })

  it('nulls log, herd and yield references to another account rows', async () => {
    const victim = await victimAccount()
    const caller = await createTestUser()
    const operationId = randomUUID()
    const herdId = randomUUID()
    const harvestId = randomUUID()

    const res = await restore(caller.token, backupOf({
      livestock: [{
        id: herdId, fieldId: victim.field.id, name: 'Gallinas', animalType: 'chickens',
        currentCount: 6, acquisitionDate: '2026-01-10',
      }],
      operations: [{
        id: operationId, type: 'harvest', actualDate: '2026-08-01',
        fieldId: victim.field.id, plantingEventId: victim.event.id,
        livestockUnitId: victim.herd.id, recommendedOperationId: victim.recOp.id,
      }],
      harvests: [{
        id: harvestId, quantity: 10, unit: 'lb', harvestDate: '2026-08-01',
        fieldId: victim.field.id, operationId: victim.operation.id,
        livestockUnitId: victim.herd.id,
      }],
    }))
    expect(res.status).toBe(200)

    expect(await prisma.operation.findUnique({ where: { id: operationId } })).toMatchObject({
      fieldId: null, plantingEventId: null, livestockUnitId: null, recommendedOperationId: null,
    })
    expect(await prisma.livestockUnit.findUnique({ where: { id: herdId } })).toMatchObject({
      fieldId: null,
    })
    expect(await prisma.harvestYield.findUnique({ where: { id: harvestId } })).toMatchObject({
      fieldId: null, operationId: null, livestockUnitId: null,
    })
  })

  it('does not attach a restored plant to another account planting', async () => {
    const victim = await victimAccount()
    const caller = await createTestUser()
    const plant = (id: string, plantingEventId: string) => ({
      id, plantingEventId, cropTypeId: 'platano', lat: 18.26, lng: -66.71, plantingDate: '2026-06-01',
    })

    const res = await restore(caller.token, backupOf({
      fields: [fieldEntry({
        plantingEvents: [{
          id: 'pe_restore_plants', cropTypeId: 'platano', plantingDate: '2026-06-01', plantCount: 2,
        }],
        freePlants: [
          plant('pl_restore_foreign', victim.event.id),
          plant('pl_restore_own', 'pe_restore_plants'),
        ],
      })],
    }))
    expect(res.status).toBe(200)

    const foreign = await prisma.plantInstance.findUnique({ where: { id: 'pl_restore_foreign' } })
    expect(foreign?.plantingEventId).toBeNull()
    const own = await prisma.plantInstance.findUnique({ where: { id: 'pl_restore_own' } })
    expect(own?.plantingEventId).toBe('pe_restore_plants')
  })

  it('links a check-off only to a log entry restored in the same farm', async () => {
    const victim = await victimAccount()
    const caller = await createTestUser()
    const ownOperationId = randomUUID()
    const recOp = (id: string, completedOperationId: string) => ({
      id, templateId: 'fertilization-1', type: 'fertilization', labelEs: 'Fertilización',
      recommendedDate: '2026-08-01', status: 'completed', completedDate: '2026-08-01',
      completedOperationId,
    })

    const res = await restore(caller.token, backupOf({
      fields: [fieldEntry({
        plantingEvents: [{
          id: 'pe_restore_links', cropTypeId: 'platano', plantingDate: '2026-06-01', plantCount: 10,
          operations: [
            recOp('ro_restore_foreign', victim.operation.id),
            recOp('ro_restore_own', ownOperationId),
          ],
        }],
      })],
      operations: [{ id: ownOperationId, type: 'fertilization', actualDate: '2026-08-01' }],
    }))
    expect(res.status).toBe(200)

    const foreign = await prisma.recommendedOperation.findUnique({ where: { id: 'ro_restore_foreign' } })
    expect(foreign?.completedOperationId).toBeNull()
    const own = await prisma.recommendedOperation.findUnique({ where: { id: 'ro_restore_own' } })
    expect(own?.completedOperationId).toBe(ownOperationId)
  })

  it('restores only real membership roles', async () => {
    const teammate = await createTestUser()
    const caller = await createTestUser()
    const farmId = randomUUID()

    // 'owner' is never a membership role — farmAccess ranks it highest.
    const asOwner = await restore(caller.token, backupOf({
      id: farmId, members: [{ userId: teammate.userId, role: 'owner' }],
    }))
    expect(asOwner.status).toBe(200)
    expect(await prisma.farmMember.count({ where: { farmId } })).toBe(0)

    const asOperator = await restore(caller.token, backupOf({
      id: farmId, members: [{ userId: teammate.userId, role: 'operator' }],
    }))
    expect(asOperator.status).toBe(200)
    const members = await prisma.farmMember.findMany({ where: { farmId } })
    expect(members).toHaveLength(1)
    expect(members[0]).toMatchObject({ userId: teammate.userId, role: 'operator' })
  })

  it('does not adopt another account private recipe as a default', async () => {
    await seedBuiltinCrop()
    const victim = await createTestUser()
    const secret = await victimRecipe(victim.userId, 'platano_test')
    const caller = await createTestUser()
    const farmId = randomUUID()
    const ownRecipe = recipeEntry()

    const res = await restore(caller.token, backupOf({ id: farmId }, {
      recipes: [ownRecipe],
      recipeDefaults: [
        { recipeId: secret.id, personal: true },
        { recipeId: ownRecipe.id, personal: false, farmId },
      ],
    }))
    expect(res.status).toBe(200)

    expect(await prisma.recipeDefault.count({ where: { recipeId: secret.id } })).toBe(0)
    const own = await prisma.recipeDefault.findMany({ where: { recipeId: ownRecipe.id } })
    expect(own).toHaveLength(1)
    expect(own[0]).toMatchObject({ farmId, userId: null, cropTypeId: 'platano_test' })
  })

  it('does not reference another account private crop or recipe version', async () => {
    await seedBuiltinCrop()
    const victim = await createTestUser()
    const victimCrop = await prisma.cropType.create({
      data: { userId: victim.userId, name: 'Secret crop', nameEs: 'Cultivo secreto' },
    })
    const secret = await victimRecipe(victim.userId, victimCrop.id)
    const caller = await createTestUser()
    const onVictimCrop = recipeEntry({ cropTypeId: victimCrop.id })
    const ownRecipe = recipeEntry()

    const res = await restore(caller.token, backupOf({
      fields: [fieldEntry({
        plantingEvents: [
          {
            id: 'pe_restore_foreign', cropTypeId: 'platano_test', plantingDate: '2026-06-01',
            plantCount: 10, recipeVersionId: secret.versions[0].id,
          },
          {
            id: 'pe_restore_own', cropTypeId: 'platano_test', plantingDate: '2026-06-01',
            plantCount: 10, recipeVersionId: ownRecipe.versions[0].id,
          },
        ],
      })],
    }, { recipes: [onVictimCrop, ownRecipe] }))
    expect(res.status).toBe(200)

    expect(await prisma.recipe.findUnique({ where: { id: onVictimCrop.id } })).toBeNull()
    const foreign = await prisma.plantingEvent.findUnique({ where: { id: 'pe_restore_foreign' } })
    expect(foreign?.recipeVersionId).toBeNull()
    const own = await prisma.plantingEvent.findUnique({ where: { id: 'pe_restore_own' } })
    expect(own?.recipeVersionId).toBe(ownRecipe.versions[0].id)
  })

  // Exports carry the whole operations log but only live fields and herds,
  // so a genuine backup can point at parents that are not in the file.
  it('restores a genuine backup whose log points at a deleted field', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)
    const logged = await request(app)
      .post(`/api/v1/farms/${farm.id}/operations`)
      .set(auth(token))
      .send({ type: 'fertilization', actualDate: '2026-08-01', fieldId: field.id })
    expect(logged.status).toBe(201)
    const removed = await request(app)
      .delete(`/api/v1/farms/${farm.id}/fields/${field.id}`)
      .set(auth(token))
    expect(removed.status).toBe(200)

    const exp = await request(app).get('/api/v1/users/me/export').set(auth(token))
    expect(exp.status).toBe(200)
    const clr = await request(app).post('/api/v1/users/me/clear-data').set(auth(token))
    expect(clr.status).toBe(200)

    const rst = await restore(token, JSON.parse(exp.text))
    expect(rst.status).toBe(200)
    expect(await prisma.operation.findUnique({ where: { id: logged.body.data.id } })).toMatchObject({
      farmId: farm.id, fieldId: null, type: 'fertilization',
    })
  })
})
