import {
  request, createTestUser, createTestFarm, addFarmMember, cleanDatabase,
} from './helpers'

beforeEach(async () => { await cleanDatabase() })

describe('GET /api/v1/farms/:farmId/members', () => {
  it('lists owner plus members; any member can view', async () => {
    const owner = await createTestUser()
    const operator = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await addFarmMember(farm.id, operator.userId, 'operator')

    const res = await request
      .get(`/api/v1/farms/${farm.id}/members`)
      .set('Authorization', `Bearer ${operator.token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.data[0].role).toBe('owner')
    expect(res.body.data[1].role).toBe('operator')
  })
})

describe('POST /api/v1/farms/:farmId/members', () => {
  it('admin adds an existing account by email', async () => {
    const owner = await createTestUser()
    const invitee = await createTestUser()
    const farm = await createTestFarm(owner.token)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: invitee.email, role: 'operator' })

    expect(res.status).toBe(201)
    expect(res.body.data.userId).toBe(invitee.userId)
    expect(res.body.data.role).toBe('operator')

    // The farm now shows up in the invitee's list
    const farms = await request
      .get('/api/v1/farms')
      .set('Authorization', `Bearer ${invitee.token}`)
    expect(farms.body.data).toHaveLength(1)
    expect(farms.body.data[0].myRole).toBe('operator')
  })

  it('rejects unknown emails with a clear message', async () => {
    const owner = await createTestUser()
    const farm = await createTestFarm(owner.token)

    const res = await request
      .post(`/api/v1/farms/${farm.id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: 'nadie@example.com', role: 'operator' })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/registre/)
  })

  it('rejects duplicates, the owner, and invalid roles', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await addFarmMember(farm.id, member.userId, 'operator')

    const dup = await request
      .post(`/api/v1/farms/${farm.id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: member.email, role: 'admin' })
    expect(dup.status).toBe(409)

    const self = await request
      .post(`/api/v1/farms/${farm.id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: owner.email, role: 'admin' })
    expect(self.status).toBe(409)

    const badRole = await request
      .post(`/api/v1/farms/${farm.id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: member.email, role: 'king' })
    expect(badRole.status).toBe(400)
  })

  it('operators cannot manage the team', async () => {
    const owner = await createTestUser()
    const operator = await createTestUser()
    const other = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await addFarmMember(farm.id, operator.userId, 'operator')

    const res = await request
      .post(`/api/v1/farms/${farm.id}/members`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ email: other.email, role: 'operator' })

    expect(res.status).toBe(403)
  })
})

describe('PATCH + DELETE /api/v1/farms/:farmId/members/:userId', () => {
  it('admin changes a role and removes a member', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await addFarmMember(farm.id, member.userId, 'operator')

    const promoted = await request
      .patch(`/api/v1/farms/${farm.id}/members/${member.userId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ role: 'admin' })
    expect(promoted.status).toBe(200)
    expect(promoted.body.data.role).toBe('admin')

    const removed = await request
      .delete(`/api/v1/farms/${farm.id}/members/${member.userId}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(removed.status).toBe(200)

    // Farm no longer visible to the ex-member
    const farms = await request
      .get('/api/v1/farms')
      .set('Authorization', `Bearer ${member.token}`)
    expect(farms.body.data).toHaveLength(0)
  })

  it('a member can leave the farm themselves', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await addFarmMember(farm.id, member.userId, 'operator')

    const res = await request
      .delete(`/api/v1/farms/${farm.id}/members/${member.userId}`)
      .set('Authorization', `Bearer ${member.token}`)
    expect(res.status).toBe(200)
  })

  it('the owner cannot be removed', async () => {
    const owner = await createTestUser()
    const admin = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await addFarmMember(farm.id, admin.userId, 'admin')

    const res = await request
      .delete(`/api/v1/farms/${farm.id}/members/${owner.userId}`)
      .set('Authorization', `Bearer ${admin.token}`)
    // The owner is not a member row — nothing to delete
    expect(res.status).toBe(404)
  })
})
