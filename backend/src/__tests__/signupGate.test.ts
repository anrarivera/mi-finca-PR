import { request, prisma, createTestUser, createTestFarm, cleanDatabase } from './helpers'
import { generateInviteCode, hashInviteCode } from '../lib/farmInvites'

beforeEach(async () => { await cleanDatabase() })

// The gate reads SIGNUP_MODE per request — flip it per test and always
// restore so the rest of the suite registers freely.
afterEach(() => { delete process.env.SIGNUP_MODE })

function gateUp() { process.env.SIGNUP_MODE = 'invite' }

async function seedSignupCode(overrides: { maxUses?: number | null; expiresAt?: Date; revokedAt?: Date } = {}) {
  const code = generateInviteCode()
  await prisma.signupCode.create({
    data: {
      codeHash: hashInviteCode(code),
      maxUses: overrides.maxUses === undefined ? 1 : overrides.maxUses,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000),
      revokedAt: overrides.revokedAt ?? null,
    },
  })
  return code
}

function registerBody(accessCode?: string) {
  return {
    fullName: 'Beta Tester',
    email: `beta_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.com`,
    password: 'Password123!',
    ...(accessCode ? { accessCode } : {}),
  }
}

describe('signup gate', () => {
  it('reports its mode publicly', async () => {
    const open = await request.get('/api/v1/auth/config')
    expect(open.body.data.signupMode).toBe('open')

    gateUp()
    const gated = await request.get('/api/v1/auth/config')
    expect(gated.body.data.signupMode).toBe('invite')
  })

  it('blocks registration without a code while gated, admits with one', async () => {
    gateUp()
    const blocked = await request.post('/api/v1/auth/register').send(registerBody())
    expect(blocked.status).toBe(400)

    const garbage = await request.post('/api/v1/auth/register')
      .send(registerBody('NOPE-NOPE'))
    expect(garbage.status).toBe(400)

    const code = await seedSignupCode()
    const ok = await request.post('/api/v1/auth/register').send(registerBody(code))
    expect(ok.status).toBe(201)
    expect(ok.body.data.accessKind).toBe('signup')
  })

  it('enforces the use cap and expiry', async () => {
    gateUp()
    const single = await seedSignupCode({ maxUses: 1 })
    expect((await request.post('/api/v1/auth/register').send(registerBody(single))).status).toBe(201)
    // Exhausted after one use
    expect((await request.post('/api/v1/auth/register').send(registerBody(single))).status).toBe(400)

    const expired = await seedSignupCode({ expiresAt: new Date('2020-01-01') })
    expect((await request.post('/api/v1/auth/register').send(registerBody(expired))).status).toBe(400)
  })

  it('accepts a valid farm invite code as app access', async () => {
    // Owner + farm + invite created while the gate is open
    const owner = await createTestUser()
    const farm = await createTestFarm(owner.token)
    const invite = await request
      .post(`/api/v1/farms/${farm.id}/members/invites`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ role: 'operator' })

    gateUp()
    const res = await request.post('/api/v1/auth/register')
      .send(registerBody(invite.body.data.code))
    expect(res.status).toBe(201)
    expect(res.body.data.accessKind).toBe('farmInvite')
  })

  it('registration is unrestricted while the gate is open', async () => {
    const res = await request.post('/api/v1/auth/register').send(registerBody())
    expect(res.status).toBe(201)
    expect(res.body.data.accessKind).toBeNull()
  })
})

// A code inserted straight into the table — models one minted before the
// owner's account lost the right to admit people (or to invite at all).
async function seedFarmInvite(farmId: string, createdBy: string, role = 'operator') {
  const code = generateInviteCode()
  await prisma.farmInvite.create({
    data: {
      farmId,
      role,
      codeHash: hashInviteCode(code),
      createdBy,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  })
  return code
}

async function joinWith(token: string, code: string) {
  return request
    .post('/api/v1/farms/join')
    .set('Authorization', `Bearer ${token}`)
    .send({ code })
}

describe('farm invite codes at the gate', () => {
  it('registering with one joins that farm in the same step', async () => {
    const owner = await createTestUser()
    const farm = await createTestFarm(owner.token)
    const code = await seedFarmInvite(farm.id, owner.userId, 'admin')

    gateUp()
    const res = await request.post('/api/v1/auth/register').send(registerBody(code))

    expect(res.status).toBe(201)
    expect(res.body.data.accessKind).toBe('farmInvite')
    expect(res.body.data.joinedFarm).toEqual({
      farmId: farm.id, farmName: farm.name, role: 'admin',
    })

    const userId = res.body.data.user.id
    const member = await prisma.farmMember.findUnique({
      where: { farmId_userId: { farmId: farm.id, userId } },
    })
    expect(member?.role).toBe('admin')
    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(user?.admittedVia).toBe('farm_invite')
  })

  it('a code from a demo-owned farm creates no account, but still joins', async () => {
    const demo = await request.post('/api/v1/auth/demo')
    const demoUserId = demo.body.data.user.id
    const demoFarm = await prisma.farm.findFirstOrThrow({ where: { userId: demoUserId } })
    const code = await seedFarmInvite(demoFarm.id, demoUserId)
    const existing = await createTestUser()

    gateUp()
    const body = registerBody(code)
    const res = await request.post('/api/v1/auth/register').send(body)

    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/cuenta existente/)
    expect(await prisma.user.findUnique({ where: { email: body.email } })).toBeNull()

    expect((await joinWith(existing.token, code)).status).toBe(201)
  })

  it('a code from an owner who came in by farm invite creates no account, but still joins', async () => {
    const owner = await createTestUser()
    await prisma.user.update({
      where: { id: owner.userId }, data: { admittedVia: 'farm_invite' },
    })
    const farm = await createTestFarm(owner.token)
    const code = await seedFarmInvite(farm.id, owner.userId)
    const existing = await createTestUser()

    gateUp()
    const body = registerBody(code)
    const res = await request.post('/api/v1/auth/register').send(body)

    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/cuenta existente/)
    expect(await prisma.user.findUnique({ where: { email: body.email } })).toBeNull()

    const joined = await joinWith(existing.token, code)
    expect(joined.status).toBe(201)
    expect(joined.body.data.farmId).toBe(farm.id)
  })

  it('the owner decides, not the admin who generated the code', async () => {
    const owner = await createTestUser()
    const admin = await createTestUser()
    await prisma.user.update({
      where: { id: admin.userId }, data: { admittedVia: 'farm_invite' },
    })
    const farm = await createTestFarm(owner.token)
    await prisma.farmMember.create({
      data: { farmId: farm.id, userId: admin.userId, role: 'admin' },
    })
    const invite = await request
      .post(`/api/v1/farms/${farm.id}/members/invites`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'operator' })

    gateUp()
    const res = await request.post('/api/v1/auth/register')
      .send(registerBody(invite.body.data.code))
    expect(res.status).toBe(201)
    expect(res.body.data.joinedFarm.farmId).toBe(farm.id)
  })

  it('owners that predate admittedVia (NULL) still admit', async () => {
    const owner = await createTestUser()
    await prisma.user.update({
      where: { id: owner.userId }, data: { admittedVia: null },
    })
    const farm = await createTestFarm(owner.token)
    const code = await seedFarmInvite(farm.id, owner.userId)

    gateUp()
    const res = await request.post('/api/v1/auth/register').send(registerBody(code))
    expect(res.status).toBe(201)
    expect(res.body.data.joinedFarm.farmId).toBe(farm.id)
  })
})

describe('admittedVia', () => {
  async function admittedVia(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    return user?.admittedVia
  }

  it('records how each account got in', async () => {
    const open = await request.post('/api/v1/auth/register').send(registerBody())
    expect(open.body.data.joinedFarm).toBeNull()
    expect(await admittedVia(open.body.data.user.id)).toBe('open')

    const demo = await request.post('/api/v1/auth/demo')
    expect(await admittedVia(demo.body.data.user.id)).toBe('demo')

    gateUp()
    const code = await seedSignupCode()
    const beta = await request.post('/api/v1/auth/register').send(registerBody(code))
    expect(beta.body.data.joinedFarm).toBeNull()
    expect(await admittedVia(beta.body.data.user.id)).toBe('signup_code')
  })
})

describe('registration is all-or-nothing', () => {
  async function usedCount(code: string) {
    const row = await prisma.signupCode.findUnique({
      where: { codeHash: hashInviteCode(code) },
    })
    return row?.usedCount
  }

  it('a registration that fails uses up nothing', async () => {
    const owner = await createTestUser()
    const farm = await createTestFarm(owner.token)
    const invite = await seedFarmInvite(farm.id, owner.userId)

    gateUp()
    const signup = await seedSignupCode({ maxUses: 1 })
    const taken = { ...registerBody(signup), email: owner.email }
    expect((await request.post('/api/v1/auth/register').send(taken)).status).toBe(409)
    expect(await usedCount(signup)).toBe(0)

    const takenToo = { ...registerBody(invite), email: owner.email }
    expect((await request.post('/api/v1/auth/register').send(takenToo)).status).toBe(409)
    expect(await prisma.farmMember.count({ where: { farmId: farm.id } })).toBe(0)
  })

  it('two registrations at once cannot share a one-use code', async () => {
    gateUp()
    const code = await seedSignupCode({ maxUses: 1 })

    const results = await Promise.all([
      request.post('/api/v1/auth/register').send(registerBody(code)),
      request.post('/api/v1/auth/register').send(registerBody(code)),
    ])

    expect(results.map(r => r.status).sort()).toEqual([201, 400])
    expect(await usedCount(code)).toBe(1)
    expect(await prisma.user.count()).toBe(1)
  })

  it('the same email twice at once: one account, one use, a 409 for the loser', async () => {
    gateUp()
    const code = await seedSignupCode({ maxUses: 5 })
    const body = registerBody(code)

    const results = await Promise.all([
      request.post('/api/v1/auth/register').send(body),
      request.post('/api/v1/auth/register').send(body),
    ])

    expect(results.map(r => r.status).sort()).toEqual([201, 409])
    expect(await usedCount(code)).toBe(1)
    expect(await prisma.user.count()).toBe(1)
  })
})
