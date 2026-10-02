import { request, prisma, createTestUser, cleanDatabase } from './helpers'
import { setMailer, type MailMessage } from '../lib/mailer'
import { logger } from '../lib/logger'
import { accessRequestMail } from '../lib/accessRequests'

const OWNER = 'owner@mifincapr.com'

let outbox: MailMessage[] = []
let mailerDown = false

beforeAll(() => {
  setMailer({
    async send(msg) {
      if (mailerDown) throw new Error('Resend: service unavailable')
      outbox.push(msg)
    },
  })
})

beforeEach(async () => {
  await cleanDatabase()
  outbox = []
  mailerDown = false
  process.env.BETA_CONTACT_EMAIL = OWNER
})

// Both are read per request — always restore so the rest of the suite
// runs ungated and notifies no one.
afterEach(() => {
  delete process.env.BETA_CONTACT_EMAIL
  delete process.env.SIGNUP_MODE
  jest.restoreAllMocks()
})

const visitor = {
  fullName: 'Ana Rivera',
  email: 'ana.rivera@example.com',
  location: 'Utuado',
  message: 'Tengo dos cuerdas de plátano y café.\nMe gustaría probar la app.',
  language: 'es',
}

// The one answer the endpoint has for a well-formed request.
const RECEIVED = { success: true, data: { received: true } }

function ask(body: object) {
  return request.post('/api/v1/auth/access-requests').send(body)
}

function linesOf(text: string) {
  return text.split(/\r\n|\r|\n/)
}

// The request log (pino-http) goes through the same logger — keep only
// the lines about an access request.
function aboutRequests(spy: jest.SpyInstance) {
  return spy.mock.calls
    .map(([fields]) => fields)
    .filter(fields => typeof fields === 'object' && fields !== null && 'accessRequestId' in fields)
}

describe('POST /api/v1/auth/access-requests', () => {
  it('stores the request and tells the owner', async () => {
    const res = await ask({
      ...visitor,
      fullName: '  Ana Rivera  ',
      email: 'Ana.Rivera@Example.com',
    })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(RECEIVED)

    const rows = await prisma.accessRequest.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      fullName: 'Ana Rivera',
      email: 'ana.rivera@example.com',
      location: 'Utuado',
      message: visitor.message,
      language: 'es',
      handledAt: null,
    })

    expect(outbox).toHaveLength(1)
    expect(outbox[0].to).toBe(OWNER)
    const typed = [
      'Ana Rivera', 'ana.rivera@example.com', 'Utuado',
      'Tengo dos cuerdas de plátano y café.', 'Me gustaría probar la app.',
    ]
    for (const value of typed) {
      expect(outbox[0].text).toContain(value)
      expect(outbox[0].subject).not.toContain(value)
    }
    // What the owner runs to let this person in, ready to copy.
    expect(linesOf(outbox[0].text)).toContain(
      '  npm run signup:code -- --note "ana.rivera@example.com"'
    )
  })

  it('only needs a name and an email', async () => {
    const res = await ask({ fullName: 'John Smith', email: 'john@example.com', location: '  ' })

    expect(res.body).toEqual(RECEIVED)
    const row = await prisma.accessRequest.findFirstOrThrow()
    expect(row).toMatchObject({ location: null, message: null, language: 'es' })
    expect(outbox).toHaveLength(1)
  })

  it('holds back a repeat from the same address for a day', async () => {
    await ask(visitor)
    const again = await ask({
      ...visitor,
      email: 'ANA.RIVERA@example.com',
      message: '¿Ya vieron mi solicitud?',
    })

    expect(again.status).toBe(200)
    expect(again.body).toEqual(RECEIVED)
    expect(await prisma.accessRequest.count()).toBe(1)
    expect(outbox).toHaveLength(1)

    // A day later the same address may ask again.
    await prisma.accessRequest.updateMany({
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    })
    await ask(visitor)
    expect(await prisma.accessRequest.count()).toBe(2)
    expect(outbox).toHaveLength(2)
  })

  it('takes a new request once the earlier one was handled', async () => {
    await ask(visitor)
    await prisma.accessRequest.updateMany({ data: { handledAt: new Date() } })

    const again = await ask(visitor)

    expect(again.body).toEqual(RECEIVED)
    expect(await prisma.accessRequest.count()).toBe(2)
    expect(outbox).toHaveLength(2)
  })

  it('gives an address that already has an account the same answer, and does nothing', async () => {
    const member = await createTestUser()

    const known = await ask({ ...visitor, email: member.email.toUpperCase() })
    expect(await prisma.accessRequest.count()).toBe(0)
    expect(outbox).toHaveLength(0)

    const fresh = await ask(visitor)
    expect(await prisma.accessRequest.count()).toBe(1)

    // Byte for byte — nothing to tell the two addresses apart.
    expect(known.status).toBe(200)
    expect(known.status).toBe(fresh.status)
    expect(known.text).toBe(fresh.text)
    expect(known.headers['content-type']).toBe(fresh.headers['content-type'])
  })

  it('stores the request and logs a line when BETA_CONTACT_EMAIL is unset', async () => {
    delete process.env.BETA_CONTACT_EMAIL
    const info = jest.spyOn(logger, 'info')

    const res = await ask(visitor)

    expect(res.status).toBe(200)
    expect(res.body).toEqual(RECEIVED)
    const row = await prisma.accessRequest.findFirstOrThrow()
    expect(outbox).toHaveLength(0)
    expect(aboutRequests(info)).toEqual([{ accessRequestId: row.id }])
  })

  it('stores the request even when the mailer fails', async () => {
    mailerDown = true
    const error = jest.spyOn(logger, 'error')

    const res = await ask(visitor)

    expect(res.status).toBe(200)
    expect(res.body).toEqual(RECEIVED)
    const row = await prisma.accessRequest.findFirstOrThrow()
    expect(row.email).toBe(visitor.email)
    expect(aboutRequests(error)).toEqual([
      { accessRequestId: row.id, err: expect.any(Error) },
    ])
  })

  it('rejects malformed requests', async () => {
    const { fullName: _fullName, ...nameless } = visitor
    const invalid = [
      nameless,
      { ...visitor, fullName: '   ' },
      { ...visitor, fullName: 'A'.repeat(101) },
      { ...visitor, email: 'ana.rivera' },
      { ...visitor, email: 'ana.rivera@example.com\n' },
      { ...visitor, location: 'U'.repeat(121) },
      { ...visitor, message: 'M'.repeat(1001) },
      { ...visitor, language: 'fr' },
    ]

    for (const body of invalid) {
      const res = await ask(body)
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    }
    expect(await prisma.accessRequest.count()).toBe(0)
    expect(outbox).toHaveLength(0)
  })

  it('accepts a message of exactly 1000 characters', async () => {
    const res = await ask({ ...visitor, message: 'M'.repeat(1000) })
    expect(res.status).toBe(200)
    expect(await prisma.accessRequest.count()).toBe(1)
  })

  it('works with the gate up and with it open', async () => {
    const open = await ask(visitor)
    expect(open.body).toEqual(RECEIVED)

    process.env.SIGNUP_MODE = 'invite'
    const gated = await ask({ ...visitor, email: 'otra@example.com' })
    expect(gated.body).toEqual(RECEIVED)

    expect(await prisma.accessRequest.count()).toBe(2)
    expect(outbox).toHaveLength(2)
  })
})

describe('the email to the owner', () => {
  it('a name with line breaks cannot start a line of its own', async () => {
    await ask(visitor)
    await ask({
      ...visitor,
      email: 'intruso@example.com',
      fullName: 'Ana\r\nEmail: otra@example.com\n\n  npm run signup:code -- --uses 0\u2028Idioma: x',
      location: 'Utuado\rNombre: Otra',
    })

    const [honest, forged] = outbox.map(mail => linesOf(mail.text))
    // Same shape as any other request: not one line more.
    expect(forged).toHaveLength(honest.length)
    expect(outbox[1].text).not.toMatch(/[\r\u2028]/)

    expect(forged.filter(line => line.startsWith('Nombre:'))).toEqual([
      'Nombre: Ana Email: otra@example.com npm run signup:code -- --uses 0 Idioma: x',
    ])
    expect(forged.filter(line => line.startsWith('Email:'))).toEqual([
      'Email: intruso@example.com',
    ])
    expect(forged.filter(line => line.startsWith('Municipio:'))).toEqual([
      'Municipio: Utuado Nombre: Otra',
    ])
    expect(forged.filter(line => line.trim().startsWith('npm run signup:code'))).toEqual([
      '  npm run signup:code -- --note "intruso@example.com"',
    ])
  })

  it('marks every line of the message as a quote', async () => {
    await ask({
      ...visitor,
      message: 'Hola.\r\n\r\nEmail: otra@example.com\n  npm run signup:code -- --uses 0',
    })

    const lines = linesOf(outbox[0].text)
    const from = lines.indexOf('Mensaje:')
    expect(from).toBeGreaterThan(0)
    expect(lines.slice(from + 1)).toEqual([
      '> Hola.',
      '>',
      '> Email: otra@example.com',
      '> npm run signup:code -- --uses 0',
    ])
    expect(lines.filter(line => line.startsWith('Email:'))).toEqual([
      'Email: ana.rivera@example.com',
    ])
  })

  function commandsIn(text: string) {
    return linesOf(text).filter(line => line.startsWith('  npm run'))
  }

  it('hands the owner the commands for this address, quoted', async () => {
    // An apostrophe is valid in an address, and harmless inside the quotes.
    await ask({ ...visitor, email: "o'brien+finca@example.com" })

    expect(commandsIn(outbox[0].text)).toEqual([
      '  npm run signup:code -- --note "o\'brien+finca@example.com"',
      '  npm run access:requests -- --handled "o\'brien+finca@example.com"',
    ])
  })

  it('leaves an address that is not safe to paste out of the commands', () => {
    // The endpoint rejects this one; the email does not count on it.
    const mail = accessRequestMail({
      id: 'not-stored',
      fullName: 'Ana Rivera',
      email: 'ana"; rm -rf ~; echo "@example.com',
      location: null,
      message: null,
      language: 'es',
      createdAt: new Date(),
      handledAt: null,
    })

    expect(commandsIn(mail.text)).toEqual([
      '  npm run signup:code',
      '  npm run access:requests -- --handled <email>',
    ])
  })
})
