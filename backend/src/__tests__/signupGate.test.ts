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
