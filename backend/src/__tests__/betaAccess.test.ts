import {
  request, prisma, createTestUser, createTestFarm, cleanDatabase,
} from './helpers'
import { setMailer, type MailMessage } from '../lib/mailer'

let outbox: MailMessage[] = []

beforeAll(() => {
  setMailer({ async send(msg) { outbox.push(msg) } })
})

beforeEach(async () => {
  await cleanDatabase()
  outbox = []
})

// A demo visitor — no code needed, and it OWNS the farm it was seeded with.
async function createDemoAccount() {
  const res = await request.post('/api/v1/auth/demo')
  const userId = res.body.data.user.id as string
  const farm = await prisma.farm.findFirstOrThrow({ where: { userId } })
  return { token: res.body.data.accessToken as string, userId, farmId: farm.id }
}

describe('demo accounts have no team features', () => {
  it('cannot generate an invite code', async () => {
    const demo = await createDemoAccount()

    const res = await request
      .post(`/api/v1/farms/${demo.farmId}/members/invites`)
      .set('Authorization', `Bearer ${demo.token}`)
      .send({ role: 'operator' })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect(res.body.error.message).toMatch(/Crea tu cuenta/)
    expect(await prisma.farmInvite.count()).toBe(0)
  })

  it('cannot add anyone by email, and never tells which addresses are registered', async () => {
    const demo = await createDemoAccount()
    const real = await createTestUser()

    const registered = await request
      .post(`/api/v1/farms/${demo.farmId}/members`)
      .set('Authorization', `Bearer ${demo.token}`)
      .send({ email: real.email, role: 'operator' })
    const unregistered = await request
      .post(`/api/v1/farms/${demo.farmId}/members`)
      .set('Authorization', `Bearer ${demo.token}`)
      .send({ email: 'nadie@example.com', role: 'operator' })

    expect(registered.status).toBe(403)
    expect(unregistered.status).toBe(403)
    expect(registered.body).toEqual(unregistered.body)

    expect(await prisma.farmMember.count()).toBe(0)
    expect(outbox).toHaveLength(0)
  })

  it('cannot join a farm, even with a valid code', async () => {
    const owner = await createTestUser()
    const farm = await createTestFarm(owner.token)
    const invite = await request
      .post(`/api/v1/farms/${farm.id}/members/invites`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ role: 'operator' })
    expect(invite.status).toBe(201)

    const demo = await createDemoAccount()
    const res = await request
      .post('/api/v1/farms/join')
      .set('Authorization', `Bearer ${demo.token}`)
      .send({ code: invite.body.data.code })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect(await prisma.farmMember.count()).toBe(0)
  })

  it('restore ignores team members named in the uploaded file', async () => {
    const demo = await createDemoAccount()
    const real = await createTestUser()

    const exp = await request
      .get('/api/v1/users/me/export')
      .set('Authorization', `Bearer ${demo.token}`)
    const backup = JSON.parse(exp.text)
    backup.farms[0].members = [{ userId: real.userId, role: 'admin' }]

    const res = await request
      .post('/api/v1/users/me/restore')
      .set('Authorization', `Bearer ${demo.token}`)
      .send(backup)

    // The farm itself comes back; the membership does not.
    expect(res.status).toBe(200)
    expect(await prisma.farm.count({ where: { userId: demo.userId } })).toBe(1)
    expect(await prisma.farmMember.count()).toBe(0)
  })
})

describe('real accounts keep their team features', () => {
  it('restore still brings back the team', async () => {
    const owner = await createTestUser()
    const teammate = await createTestUser()
    const farm = await createTestFarm(owner.token)
    await prisma.farmMember.create({
      data: { farmId: farm.id, userId: teammate.userId, role: 'operator' },
    })

    const exp = await request
      .get('/api/v1/users/me/export')
      .set('Authorization', `Bearer ${owner.token}`)
    const res = await request
      .post('/api/v1/users/me/restore')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(JSON.parse(exp.text))

    expect(res.status).toBe(200)
    const members = await prisma.farmMember.findMany({ where: { farmId: farm.id } })
    expect(members.map(m => m.userId)).toEqual([teammate.userId])
  })
})
