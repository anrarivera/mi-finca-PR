import {
  request, prisma, createTestUser, createTestFarm, createTestField,
  addFarmMember, cleanDatabase,
} from './helpers'

beforeEach(async () => { await cleanDatabase() })

describe('DELETE /api/v1/users/me', () => {
  it('requires the correct password', async () => {
    const user = await createTestUser()

    const noPass = await request
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
    expect(noPass.status).toBe(400)

    const wrongPass = await request
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ password: 'not-my-password' })
    expect(wrongPass.status).toBe(400)

    expect(await prisma.user.findUnique({ where: { id: user.userId } })).not.toBeNull()
  })

  it('deletes the user, their farms, and all farm data', async () => {
    const user = await createTestUser()
    const farm = await createTestFarm(user.token)
    const field = await createTestField(user.token, farm.id)
    await request
      .post(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ type: 'irrigation', actualDate: '2026-08-01' })

    const res = await request
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ password: user.password })
    expect(res.status).toBe(200)

    expect(await prisma.user.findUnique({ where: { id: user.userId } })).toBeNull()
    expect(await prisma.farm.findUnique({ where: { id: farm.id } })).toBeNull()
    expect(await prisma.field.findUnique({ where: { id: field.id } })).toBeNull()
    expect(await prisma.operation.count({ where: { farmId: farm.id } })).toBe(0)
    expect(await prisma.refreshToken.count({ where: { userId: user.userId } })).toBe(0)
  })

  it('keeps other farms intact: membership gone, records anonymized', async () => {
    const owner = await createTestUser()
    const worker = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await addFarmMember(farm.id, worker.userId, 'operator')

    // The worker logs an operation on the owner's farm
    await request
      .post(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ type: 'monitoring', actualDate: '2026-08-01' })

    const res = await request
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ password: worker.password })
    expect(res.status).toBe(200)

    // The owner's farm survives; the membership is gone; the record
    // remains but no longer carries the deleted user's identity.
    expect(await prisma.farm.findUnique({ where: { id: farm.id } })).not.toBeNull()
    expect(await prisma.farmMember.count({ where: { farmId: farm.id } })).toBe(0)
    const op = await prisma.operation.findFirst({ where: { farmId: farm.id } })
    expect(op).not.toBeNull()
    expect(op!.performedByUserId).toBeNull()
  })
})
