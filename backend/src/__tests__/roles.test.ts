import {
  request, prisma, createTestUser, createTestFarm, createTestField,
  addFarmMember, seedRecommendedOp, cleanDatabase,
} from './helpers'

beforeEach(async () => { await cleanDatabase() })

// Shared cast: owner creates the farm; admin and operator are members.
async function setupFarmWithTeam() {
  const owner = await createTestUser()
  const admin = await createTestUser()
  const operator = await createTestUser()
  const farm = await createTestFarm(owner.token)
  await addFarmMember(farm.id, admin.userId, 'admin')
  await addFarmMember(farm.id, operator.userId, 'operator')
  return { owner, admin, operator, farm }
}

describe('membership visibility', () => {
  it('members see the farm in their list with myRole', async () => {
    const { operator, farm } = await setupFarmWithTeam()

    const res = await request
      .get('/api/v1/farms')
      .set('Authorization', `Bearer ${operator.token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].id).toBe(farm.id)
    expect(res.body.data[0].myRole).toBe('operator')
  })

  it('owner sees myRole owner; non-members still get 404', async () => {
    const { owner, farm } = await setupFarmWithTeam()
    const outsider = await createTestUser()

    const mine = await request
      .get(`/api/v1/farms/${farm.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(mine.body.data.myRole).toBe('owner')

    const res = await request
      .get(`/api/v1/farms/${farm.id}`)
      .set('Authorization', `Bearer ${outsider.token}`)
    expect(res.status).toBe(404)
  })
})

describe('operator permissions', () => {
  it('can log an operation, stamped with their identity', async () => {
    const { operator, farm } = await setupFarmWithTeam()

    const res = await request
      .post(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ type: 'irrigation', actualDate: '2026-08-01' })

    expect(res.status).toBe(201)
    expect(res.body.data.performedByUserId).toBe(operator.userId)
  })

  it('can check off a recommended operation', async () => {
    const { owner, operator, farm } = await setupFarmWithTeam()
    const field = await createTestField(owner.token, farm.id)
    const { recOp } = await seedRecommendedOp(field.id)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/recommended-operations/${recOp.id}/complete`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ completedDate: '2026-08-01' })

    expect(res.status).toBe(201)
    const op = await prisma.operation.findFirst({ where: { farmId: farm.id } })
    expect(op?.performedByUserId).toBe(operator.userId)
  })

  it('can register a finding, stamped with their identity', async () => {
    const { owner, operator, farm } = await setupFarmWithTeam()
    const field = await createTestField(owner.token, farm.id)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/findings`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ fieldId: field.id, pestId: 'pulgones', severity: 2 })

    expect(res.status).toBe(201)
    expect(res.body.data.performedByUserId).toBe(operator.userId)
  })

  it('CANNOT create a field (403, not 404 — they are a real member)', async () => {
    const { operator, farm } = await setupFarmWithTeam()

    const res = await request
      .post(`/api/v1/farms/${farm.id}/fields`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({
        name: 'Campo pirata', color: '#22c55e', shape: 'rectangle',
        farmLat: 18.4655, farmLng: -66.1057,
      })

    expect(res.status).toBe(403)
  })

  it('CANNOT update or delete the farm', async () => {
    const { operator, farm } = await setupFarmWithTeam()

    const patch = await request
      .patch(`/api/v1/farms/${farm.id}`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ name: 'Renombrada' })
    expect(patch.status).toBe(403)

    const del = await request
      .delete(`/api/v1/farms/${farm.id}`)
      .set('Authorization', `Bearer ${operator.token}`)
    expect(del.status).toBe(403)
  })

  it('can read fields (the map needs them)', async () => {
    const { owner, operator, farm } = await setupFarmWithTeam()
    await createTestField(owner.token, farm.id)

    const res = await request
      .get(`/api/v1/farms/${farm.id}/fields`)
      .set('Authorization', `Bearer ${operator.token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.fields).toHaveLength(1)
  })
})

describe('admin permissions', () => {
  it('can create fields and update the farm', async () => {
    const { admin, farm } = await setupFarmWithTeam()

    const field = await request
      .post(`/api/v1/farms/${farm.id}/fields`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Campo del administrador', color: '#22c55e', shape: 'rectangle',
        farmLat: 18.4655, farmLng: -66.1057,
      })
    expect(field.status).toBe(201)

    const patch = await request
      .patch(`/api/v1/farms/${farm.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Finca renombrada' })
    expect(patch.status).toBe(200)
    expect(patch.body.data.name).toBe('Finca renombrada')
  })

  it('CANNOT delete the farm — that is owner-only', async () => {
    const { admin, owner, farm } = await setupFarmWithTeam()

    const res = await request
      .delete(`/api/v1/farms/${farm.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
    expect(res.status).toBe(403)

    const ownerRes = await request
      .delete(`/api/v1/farms/${farm.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(ownerRes.status).toBe(200)
  })
})
