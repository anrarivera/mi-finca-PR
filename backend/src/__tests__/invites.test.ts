import {
  request, prisma, createTestUser, createTestFarm, addFarmMember, cleanDatabase,
} from './helpers'

beforeEach(async () => { await cleanDatabase() })

async function generateCode(token: string, farmId: string, role = 'operator') {
  const res = await request
    .post(`/api/v1/farms/${farmId}/members/invites`)
    .set('Authorization', `Bearer ${token}`)
    .send({ role })
  return res
}

describe('POST /api/v1/farms/:farmId/members/invites', () => {
  it('admin generates a code; the plain code is returned once', async () => {
    const owner = await createTestUser()
    const farm = await createTestFarm(owner.token)

    const res = await generateCode(owner.token, farm.id)

    expect(res.status).toBe(201)
    expect(res.body.data.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(res.body.data.role).toBe('operator')

    // Listing invites never exposes the code
    const list = await request
      .get(`/api/v1/farms/${farm.id}/members/invites`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(list.body.data).toHaveLength(1)
    expect(list.body.data[0].code).toBeUndefined()
  })

  it('operators cannot generate codes', async () => {
    const owner = await createTestUser()
    const operator = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await addFarmMember(farm.id, operator.userId, 'operator')

    const res = await generateCode(operator.token, farm.id)
    expect(res.status).toBe(403)
  })
})

describe('POST /api/v1/farms/join', () => {
  it('redeems a code — membership with the baked-in role, forgiving input', async () => {
    const owner = await createTestUser()
    const worker = await createTestUser()
    const farm = await createTestFarm(owner.token)
    const { body } = await generateCode(owner.token, farm.id, 'operator')

    // lowercase + no dash still works
    const res = await request
      .post('/api/v1/farms/join')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ code: body.data.code.toLowerCase().replace('-', ' ') })

    expect(res.status).toBe(201)
    expect(res.body.data.farmId).toBe(farm.id)
    expect(res.body.data.role).toBe('operator')

    const farms = await request
      .get('/api/v1/farms')
      .set('Authorization', `Bearer ${worker.token}`)
    expect(farms.body.data).toHaveLength(1)
    expect(farms.body.data[0].myRole).toBe('operator')
  })

  it('is multi-use: a second worker joins with the same code', async () => {
    const owner = await createTestUser()
    const w1 = await createTestUser()
    const w2 = await createTestUser()
    const farm = await createTestFarm(owner.token)
    const { body } = await generateCode(owner.token, farm.id)

    for (const w of [w1, w2]) {
      const res = await request
        .post('/api/v1/farms/join')
        .set('Authorization', `Bearer ${w.token}`)
        .send({ code: body.data.code })
      expect(res.status).toBe(201)
    }
  })

  it('rejects garbage, revoked, and expired codes', async () => {
    const owner = await createTestUser()
    const worker = await createTestUser()
    const farm = await createTestFarm(owner.token)

    const garbage = await request
      .post('/api/v1/farms/join')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ code: 'NOPE-NOPE' })
    expect(garbage.status).toBe(400)

    const { body: revokable } = await generateCode(owner.token, farm.id)
    await request
      .delete(`/api/v1/farms/${farm.id}/members/invites/${revokable.data.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    const revoked = await request
      .post('/api/v1/farms/join')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ code: revokable.data.code })
    expect(revoked.status).toBe(400)

    const { body: expirable } = await generateCode(owner.token, farm.id)
    await prisma.farmInvite.update({
      where: { id: expirable.data.id },
      data: { expiresAt: new Date('2020-01-01') },
    })
    const expired = await request
      .post('/api/v1/farms/join')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ code: expirable.data.code })
    expect(expired.status).toBe(400)
  })

  it('rejects the owner and existing members', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await addFarmMember(farm.id, member.userId, 'operator')
    const { body } = await generateCode(owner.token, farm.id)

    const self = await request
      .post('/api/v1/farms/join')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ code: body.data.code })
    expect(self.status).toBe(409)

    const dup = await request
      .post('/api/v1/farms/join')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ code: body.data.code })
    expect(dup.status).toBe(409)
  })
})
