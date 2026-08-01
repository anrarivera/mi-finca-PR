import {
  request, prisma, createTestUser, createTestFarm, createTestField,
  addFarmMember, cleanDatabase,
} from './helpers'
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

function daysFromNow(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

// Digests only go to verified accounts — flip the flag the way the email
// verification flow would.
async function verifyUser(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } })
}

async function seedWork(token: string, farmId: string, fieldId: string) {
  // One overdue labor, one inside the window, one open finding
  const event = await prisma.plantingEvent.create({
    data: { fieldId, cropTypeId: 'platano', plantingDate: new Date(daysFromNow(-30)), plantCount: 5 },
  })
  await prisma.recommendedOperation.createMany({
    data: [
      {
        plantingEventId: event.id, templateId: 't', type: 'fertilization',
        labelEs: 'Fertilización', recommendedDate: new Date(daysFromNow(-5)), status: 'due',
      },
      {
        plantingEventId: event.id, templateId: 't', type: 'irrigation',
        labelEs: 'Riego', recommendedDate: new Date(daysFromNow(3)), status: 'pending',
      },
    ],
  })
  await request
    .post(`/api/v1/farms/${farmId}/findings`)
    .set('Authorization', `Bearer ${token}`)
    .send({ fieldId, pestId: 'pulgones', severity: 2 })
}

describe('runDailyDigest', () => {
  it('sends one digest with the farm counts', async () => {
    const owner = await createTestUser()
    await verifyUser(owner.userId)
    const farm = await createTestFarm(owner.token, { name: 'Finca Digest' })
    const field = await createTestField(owner.token, farm.id)
    await seedWork(owner.token, farm.id, field.id)

    const result = await runDailyDigest()

    expect(result.sent).toBe(1)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].to).toBe(owner.email)
    expect(outbox[0].subject).toContain('1 labor vencida')
    expect(outbox[0].text).toContain('Finca Digest')
    expect(outbox[0].text).toContain('1 vencida')
    expect(outbox[0].text).toContain('1 próxima')
    expect(outbox[0].text).toContain('1 hallazgo')
  })

  it('speaks English to users with language en', async () => {
    const owner = await createTestUser()
    await verifyUser(owner.userId)
    await prisma.user.update({ where: { id: owner.userId }, data: { language: 'en' } })
    const farm = await createTestFarm(owner.token, { name: 'English Farm' })
    const field = await createTestField(owner.token, farm.id)
    await seedWork(owner.token, farm.id, field.id)

    const result = await runDailyDigest()

    expect(result.sent).toBe(1)
    expect(outbox[0].subject).toContain('overdue task')
    expect(outbox[0].text).toContain('Here is your daily summary')
    expect(outbox[0].text).toContain('English Farm')
  })

  it('sends nothing when there is nothing actionable', async () => {
    const owner = await createTestUser()
    await verifyUser(owner.userId)
    await createTestFarm(owner.token)

    const result = await runDailyDigest()
    expect(result.sent).toBe(0)
    expect(outbox).toHaveLength(0)
  })

  it('skips unverified users and opted-out users', async () => {
    // Unverified owner with real work pending
    const unverified = await createTestUser()
    const farm1 = await createTestFarm(unverified.token)
    const field1 = await createTestField(unverified.token, farm1.id)
    await seedWork(unverified.token, farm1.id, field1.id)

    // Verified but opted out
    const optedOut = await createTestUser()
    await verifyUser(optedOut.userId)
    await prisma.user.update({
      where: { id: optedOut.userId },
      data: { notificationPrefs: { emailDigest: false } },
    })
    const farm2 = await createTestFarm(optedOut.token)
    const field2 = await createTestField(optedOut.token, farm2.id)
    await seedWork(optedOut.token, farm2.id, field2.id)

    const result = await runDailyDigest()
    expect(result.sent).toBe(0)
    expect(outbox).toHaveLength(0)
  })

  it('members get digests for farms they work but do not own', async () => {
    const owner = await createTestUser()
    const worker = await createTestUser()
    await verifyUser(worker.userId)
    const farm = await createTestFarm(owner.token, { name: 'Finca Ajena' })
    const field = await createTestField(owner.token, farm.id)
    await seedWork(owner.token, farm.id, field.id)
    await addFarmMember(farm.id, worker.userId, 'operator')

    const result = await runDailyDigest()

    // Owner is unverified — only the worker gets mail
    expect(result.sent).toBe(1)
    expect(outbox[0].to).toBe(worker.email)
    expect(outbox[0].text).toContain('Finca Ajena')
  })
})
