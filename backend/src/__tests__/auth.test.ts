import { request, cleanDatabase } from './helpers'

beforeEach(async () => { await cleanDatabase() })

describe('POST /api/v1/auth/register', () => {
  it('registers a new user successfully', async () => {
    const res = await request
      .post('/api/v1/auth/register')
      .send({ name: 'Angel', email: 'angel@test.com', password: 'Password123!' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.user.email).toBe('angel@test.com')
    expect(res.body.data.accessToken).toBeDefined()
  })

  it('rejects duplicate email', async () => {
    await request.post('/api/v1/auth/register')
      .send({ name: 'Angel', email: 'angel@test.com', password: 'Password123!' })

    const res = await request.post('/api/v1/auth/register')
      .send({ name: 'Angel', email: 'angel@test.com', password: 'Password123!' })

    expect(res.status).toBe(409)
    expect(res.body.success).toBe(false)
  })

  it('rejects missing fields', async () => {
    const res = await request
      .post('/api/v1/auth/register')
      .send({ email: 'angel@test.com' })

    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await request.post('/api/v1/auth/register')
      .send({ name: 'Angel', email: 'angel@test.com', password: 'Password123!' })
  })

  it('logs in with correct credentials', async () => {
    const res = await request
      .post('/api/v1/auth/login')
      .send({ email: 'angel@test.com', password: 'Password123!' })

    expect(res.status).toBe(200)
    expect(res.body.data.accessToken).toBeDefined()
    expect(res.headers['set-cookie']).toBeDefined() // refresh token cookie
  })

  it('rejects wrong password', async () => {
    const res = await request
      .post('/api/v1/auth/login')
      .send({ email: 'angel@test.com', password: 'wrongpassword' })

    expect(res.status).toBe(401)
  })

  it('rejects unknown email', async () => {
    const res = await request
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.com', password: 'Password123!' })

    expect(res.status).toBe(401)
  })
})

describe('GET /api/v1/auth/me', () => {
  it('returns current user with valid token', async () => {
    const reg = await request.post('/api/v1/auth/register')
      .send({ name: 'Angel', email: 'angel@test.com', password: 'Password123!' })
    const token = reg.body.data.accessToken

    const res = await request
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.user.email).toBe('angel@test.com')
  })

  it('rejects request with no token', async () => {
    const res = await request.get('/api/v1/auth/me')
    expect(res.status).toBe(401)
  })
})