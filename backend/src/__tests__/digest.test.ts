import {
  request, prisma, createTestUser, createTestFarm, createTestField,
  addFarmMember, cleanDatabase,
} from './helpers'
import { Prisma } from '@prisma/client'
import { setMailer, type MailMessage } from '../lib/mailer'
import { runDailyDigest } from '../lib/dailyDigest'

let outbox: MailMessage[] = []

beforeAll(() => {
  setMailer({ async send(msg) { outbox.push(msg) } })
})

beforeEach(async () => {
  outbox = []
  await cleanDatabase()
})

// Fixed clocks: 2026-08-03 is a Monday (Puerto Rico), 2026-08-04 a Tuesday.
// 10:00 UTC = 6:00 AM island time, the cron hour.
const MONDAY = new Date('2026-08-03T10:00:00Z')
const TUESDAY = new Date('2026-08-04T10:00:00Z')

function dateAt(base: Date, daysFromBase: number): Date {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + daysFromBase)
  return d
}

// Digests only go to verified accounts.
async function verifyUser(userId: string, prefs?: Record<string, unknown>) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerified: true,
      ...(prefs ? { notificationPrefs: prefs as Prisma.InputJsonValue } : {}),
    },
  })
}

// Seed pending labores at given day offsets relative to the test clock.
async function seedOps(fieldId: string, base: Date, offsets: number[], labelEs = 'Fertilización') {
  const event = await prisma.plantingEvent.create({
    data: { fieldId, cropTypeId: 'platano', plantingDate: dateAt(base, -60), plantCount: 5 },
  })
  await prisma.recommendedOperation.createMany({
    data: offsets.map((days, i) => ({
      plantingEventId: event.id, templateId: 't', type: 'fertilization',
      labelEs, recommendedDate: dateAt(base, days),
      status: days < 0 ? 'due' : 'pending',
    })),
  })
}

async function setupFarm(prefs?: Record<string, unknown>) {
  const owner = await createTestUser()
  await verifyUser(owner.userId, prefs)
  const farm = await createTestFarm(owner.token, { name: 'Finca Digest' })
  const field = await createTestField(owner.token, farm.id)
  return { owner, farm, field }
}

describe('novedades mode (default)', () => {
  it('sends when a labor enters the anticipation window (default 14 days)', async () => {
    const { owner, field } = await setupFarm()
    await seedOps(field.id, TUESDAY, [14])

    const result = await runDailyDigest(TUESDAY)
    expect(result.sent).toBe(1)
    expect(outbox[0].to).toBe(owner.email)
    expect(outbox[0].subject).toContain('1 labor próxima')
  })

  it('sends when a labor is due today and when it just became overdue', async () => {
    const dueToday = await setupFarm()
    await seedOps(dueToday.field.id, TUESDAY, [0])
    expect((await runDailyDigest(TUESDAY)).sent).toBe(1)

    outbox = []
    await cleanDatabase()

    const newlyOverdue = await setupFarm()
    await seedOps(newlyOverdue.field.id, TUESDAY, [-1])
    const result = await runDailyDigest(TUESDAY)
    expect(result.sent).toBe(1)
    expect(outbox[0].subject).toContain('vencida')
  })

  it('stays SILENT mid-window — the anti-nag guarantee', async () => {
    const { field } = await setupFarm()
    // In the window (3 days out) and long-overdue (5 days ago): pending
    // work exists, but nothing crossed a line today.
    await seedOps(field.id, TUESDAY, [3, -5])

    const result = await runDailyDigest(TUESDAY)
    expect(result.sent).toBe(0)
    expect(outbox).toHaveLength(0)
  })

  it('respects a custom anticipation window', async () => {
    const { field } = await setupFarm({ dueSoonLeadDays: 5 })
    await seedOps(field.id, TUESDAY, [5])
    expect((await runDailyDigest(TUESDAY)).sent).toBe(1)

    outbox = []
    await cleanDatabase()
    const other = await setupFarm({ dueSoonLeadDays: 5 })
    // 14 days out is OUTSIDE a 5-day window — not even content, no send
    await seedOps(other.field.id, TUESDAY, [14])
    expect((await runDailyDigest(TUESDAY)).sent).toBe(0)
  })

  it('groups identical labels in the body', async () => {
    const { field } = await setupFarm()
    await seedOps(field.id, TUESDAY, [14, 14, 14], 'Primera fertilización')

    await runDailyDigest(TUESDAY)
    expect(outbox[0].text).toContain('Primera fertilización × 3')
  })
})

describe('semanal mode', () => {
  it('sends Mondays with anything pending, ignoring trigger lines', async () => {
    const { field } = await setupFarm({ emailFrequency: 'semanal' })
    // Mid-window: novedades would stay silent; weekly sends on Monday
    await seedOps(field.id, MONDAY, [3])

    expect((await runDailyDigest(MONDAY)).sent).toBe(1)
  })

  it('stays silent on other days even when a trigger fires', async () => {
    const { field } = await setupFarm({ emailFrequency: 'semanal' })
    await seedOps(field.id, TUESDAY, [0]) // due today — but it's Tuesday

    expect((await runDailyDigest(TUESDAY)).sent).toBe(0)
  })

  it('sends nothing on Monday when nothing is pending', async () => {
    await setupFarm({ emailFrequency: 'semanal' })
    expect((await runDailyDigest(MONDAY)).sent).toBe(0)
  })
})

describe('shared behavior', () => {
  it('skips unverified users and opted-out users even on trigger days', async () => {
    // Unverified with a due-today labor
    const unverified = await createTestUser()
    const farm1 = await createTestFarm(unverified.token)
    const field1 = await createTestField(unverified.token, farm1.id)
    await seedOps(field1.id, TUESDAY, [0])

    // Verified but opted out
    const optedOut = await setupFarm({ emailDigest: false })
    await seedOps(optedOut.field.id, TUESDAY, [0])

    const result = await runDailyDigest(TUESDAY)
    expect(result.sent).toBe(0)
  })

  it('members get reminders for farms they work but do not own', async () => {
    const owner = await createTestUser()
    const worker = await createTestUser()
    await verifyUser(worker.userId)
    const farm = await createTestFarm(owner.token, { name: 'Finca Ajena' })
    const field = await createTestField(owner.token, farm.id)
    await seedOps(field.id, TUESDAY, [0])
    await addFarmMember(farm.id, worker.userId, 'operator')

    const result = await runDailyDigest(TUESDAY)
    expect(result.sent).toBe(1)
    expect(outbox[0].to).toBe(worker.email)
    expect(outbox[0].text).toContain('Finca Ajena')
  })

  it('speaks English to users with language en', async () => {
    const { owner, field } = await setupFarm()
    await prisma.user.update({ where: { id: owner.userId }, data: { language: 'en' } })
    await seedOps(field.id, TUESDAY, [0])

    await runDailyDigest(TUESDAY)
    expect(outbox[0].subject).toContain('upcoming task')
    expect(outbox[0].text).toContain('Here is the state of your tasks')
  })
})
