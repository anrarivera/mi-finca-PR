import { request, createTestUser, cleanDatabase } from './helpers'
import { SAMPLE_FARM_SEEDS_PER_WINDOW } from '../routes/sampleFarm'

const BASE = '/api/v1/users/me/sample-farm'

// Rate limiters are off for the test suite; this file is about the limiter.
beforeAll(() => { process.env.RATE_LIMIT_IN_TESTS = '1' })
afterAll(() => { delete process.env.RATE_LIMIT_IN_TESTS })

beforeEach(async () => { await cleanDatabase() })

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

const getStatus = (token: string) => request.get(BASE).set(auth(token))

const setSampleFarm = (token: string, enabled: boolean) =>
  request.put(BASE).set(auth(token)).send({ enabled })

const resetNow = (token: string) => request.post(`${BASE}/reset`).set(auth(token))

// Uses up the account's budget. A reset while the sample farm is off is
// answered 409 without seeding anything, and still counts.
async function spendBudget(token: string) {
  for (let i = 0; i < SAMPLE_FARM_SEEDS_PER_WINDOW; i++) {
    const res = await resetNow(token)
    expect(res.status).toBe(409)
  }
}

describe('rate limit on seeding the sample farm', () => {
  it('refuses the reset and the switch-on once the budget is spent', async () => {
    const { token } = await createTestUser()
    await spendBudget(token)

    const reset = await resetNow(token)
    expect(reset.status).toBe(429)
    expect(reset.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
    })

    // One budget for both: the switch cannot be used to get around it.
    const on = await setSampleFarm(token, true)
    expect(on.status).toBe(429)
    expect(on.body.error.code).toBe('RATE_LIMITED')

    const status = await getStatus(token)
    expect(status.body.data.enabled).toBe(false)
  })

  it('counts the switch-on, the reset and refused requests against one budget', async () => {
    const { token } = await createTestUser()

    expect((await setSampleFarm(token, true)).status).toBe(200)
    expect((await resetNow(token)).status).toBe(200)
    for (let i = 2; i < SAMPLE_FARM_SEEDS_PER_WINDOW; i++) {
      // Not a boolean "enabled": refused with 400, and counted.
      expect((await request.put(BASE).set(auth(token)).send({})).status).toBe(400)
    }

    expect((await resetNow(token)).status).toBe(429)

    // The farm seeded before the limit is still there.
    const status = await getStatus(token)
    expect(status.body.data.enabled).toBe(true)
  })

  it('never limits switching it off, nor reading the status', async () => {
    const { token } = await createTestUser()
    expect((await setSampleFarm(token, true)).status).toBe(200)
    for (let i = 1; i < SAMPLE_FARM_SEEDS_PER_WINDOW; i++) {
      expect((await request.put(BASE).set(auth(token)).send({})).status).toBe(400)
    }
    expect((await resetNow(token)).status).toBe(429)

    for (let i = 0; i < 3; i++) {
      expect((await getStatus(token)).status).toBe(200)
    }
    const off = await setSampleFarm(token, false)
    expect(off.status).toBe(200)
    expect(off.body.data.enabled).toBe(false)
    // Switching off again and again stays free.
    expect((await setSampleFarm(token, false)).status).toBe(200)
  })

  it('is counted per account, not per address', async () => {
    const first = await createTestUser()
    const second = await createTestUser()
    await spendBudget(first.token)
    expect((await resetNow(first.token)).status).toBe(429)

    // Same IP, another account: untouched.
    const on = await setSampleFarm(second.token, true)
    expect(on.status).toBe(200)
    expect(on.body.data.enabled).toBe(true)
  })

  it('does not count a request that is not signed in', async () => {
    for (let i = 0; i <= SAMPLE_FARM_SEEDS_PER_WINDOW; i++) {
      expect((await request.post(`${BASE}/reset`)).status).toBe(401)
    }
  })
})
