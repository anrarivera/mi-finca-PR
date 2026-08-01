import { prisma } from './prisma'
import { sendMail } from './mailer'

// ──────────────────────────────────────────────────────────────────────────
// Daily email digest (notifications, issue #11). One email per user per
// day summarizing every farm they own or work: labores vencidas, próximas
// (within their dueSoonLeadDays), and hallazgos sin resolver. Sent only
// when there is something actionable — an empty digest is spam.
// ──────────────────────────────────────────────────────────────────────────

type FarmSummary = {
  farmName: string
  overdue: number
  dueSoon: number
  openFindings: number
  soonestLabels: string[]
}

const DEFAULT_LEAD_DAYS = 14

function todayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

async function summarizeFarm(
  farmId: string,
  farmName: string,
  leadDays: number
): Promise<FarmSummary> {
  const today = todayUtc()
  const horizon = new Date(today)
  horizon.setUTCDate(horizon.getUTCDate() + leadDays)

  const ops = await prisma.recommendedOperation.findMany({
    where: {
      status: { in: ['pending', 'due'] },
      recommendedDate: { lte: horizon },
      OR: [
        { plantingEvent: { field: { farmId, deletedAt: { equals: null } } } },
        { livestockUnit: { farmId, deletedAt: { equals: null } } },
      ],
    },
    orderBy: { recommendedDate: 'asc' },
    select: { labelEs: true, recommendedDate: true },
  })

  const openFindings = await prisma.finding.count({
    where: {
      status: { not: 'resolved' },
      field: { farmId, deletedAt: { equals: null } },
    },
  })

  const overdue = ops.filter(o => o.recommendedDate < today).length
  return {
    farmName,
    overdue,
    dueSoon: ops.length - overdue,
    openFindings,
    soonestLabels: ops.slice(0, 3).map(o => o.labelEs),
  }
}

function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

// The digest speaks the user's language (User.language, synced from the
// app's Idioma setting). Recommendation labels themselves are stored data
// and stay as written.
export type DigestLang = 'es' | 'en'

const DIGEST_COPY = {
  es: {
    overdue: (n: number) => pluralize(n, 'labor vencida', 'labores vencidas'),
    dueSoon: (n: number) => pluralize(n, 'labor próxima', 'labores próximas'),
    findings: (n: number) => pluralize(n, 'hallazgo sin resolver', 'hallazgos sin resolver'),
    farmOverdue: (n: number) => `${n} vencida${n === 1 ? '' : 's'}`,
    farmDueSoon: (n: number) => `${n} próxima${n === 1 ? '' : 's'}`,
    farmFindings: (n: number) => `${n} hallazgo${n === 1 ? '' : 's'}`,
    next: 'Siguiente',
    greeting: (name: string) => `Hola ${name},`,
    intro: 'Este es tu resumen del día:',
    outro:
      'Entra a la aplicación para marcar labores o revisar hallazgos.\n' +
      'Puedes desactivar este resumen en Ajustes → Notificaciones.',
  },
  en: {
    overdue: (n: number) => pluralize(n, 'overdue task', 'overdue tasks'),
    dueSoon: (n: number) => pluralize(n, 'upcoming task', 'upcoming tasks'),
    findings: (n: number) => pluralize(n, 'open finding', 'open findings'),
    farmOverdue: (n: number) => `${n} overdue`,
    farmDueSoon: (n: number) => `${n} upcoming`,
    farmFindings: (n: number) => `${n} finding${n === 1 ? '' : 's'}`,
    next: 'Next',
    greeting: (name: string) => `Hi ${name},`,
    intro: 'Here is your daily summary:',
    outro:
      'Open the app to check off tasks or review findings.\n' +
      'You can turn this summary off in Settings → Notifications.',
  },
} as const

export function composeDigest(
  fullName: string,
  farms: FarmSummary[],
  lang: DigestLang = 'es'
): {
  subject: string
  text: string
} | null {
  const active = farms.filter(f => f.overdue + f.dueSoon + f.openFindings > 0)
  if (active.length === 0) return null
  const copy = DIGEST_COPY[lang]

  const totalOverdue = active.reduce((s, f) => s + f.overdue, 0)
  const totalDueSoon = active.reduce((s, f) => s + f.dueSoon, 0)
  const totalFindings = active.reduce((s, f) => s + f.openFindings, 0)

  const headline = [
    totalOverdue > 0 ? copy.overdue(totalOverdue) : null,
    totalDueSoon > 0 ? copy.dueSoon(totalDueSoon) : null,
    totalFindings > 0 ? copy.findings(totalFindings) : null,
  ].filter(Boolean).join(', ')

  const farmLines = active.map(f => {
    const parts = [
      f.overdue > 0 ? copy.farmOverdue(f.overdue) : null,
      f.dueSoon > 0 ? copy.farmDueSoon(f.dueSoon) : null,
      f.openFindings > 0 ? copy.farmFindings(f.openFindings) : null,
    ].filter(Boolean).join(', ')
    const labels = f.soonestLabels.length > 0 ? `\n   ${copy.next}: ${f.soonestLabels.join(' · ')}` : ''
    return `• ${f.farmName}: ${parts}${labels}`
  }).join('\n')

  return {
    subject: `Mi Finca PR — ${headline}`,
    text:
      `${copy.greeting(fullName)}\n\n` +
      `${copy.intro}\n\n${farmLines}\n\n` +
      copy.outro,
  }
}

/** Build and send the digest for one user. Returns true if a mail went out. */
export async function sendUserDigest(user: {
  id: string
  email: string
  fullName: string
  language?: string
  notificationPrefs: unknown
}): Promise<boolean> {
  const prefs = (user.notificationPrefs ?? {}) as Record<string, unknown>
  if (prefs.enabled === false || prefs.emailDigest === false) return false
  const leadDays =
    typeof prefs.dueSoonLeadDays === 'number' ? prefs.dueSoonLeadDays : DEFAULT_LEAD_DAYS

  const farms = await prisma.farm.findMany({
    where: {
      deletedAt: { equals: null },
      OR: [{ userId: user.id }, { members: { some: { userId: user.id } } }],
    },
    select: { id: true, name: true },
  })
  if (farms.length === 0) return false

  const summaries = await Promise.all(
    farms.map(f => summarizeFarm(f.id, f.name, leadDays))
  )
  const lang: DigestLang = user.language === 'en' ? 'en' : 'es'
  const digest = composeDigest(user.fullName, summaries, lang)
  if (!digest) return false

  await sendMail({ to: user.email, ...digest })
  return true
}

/** The daily job: every verified user who hasn't opted out. */
export async function runDailyDigest(): Promise<{ sent: number; skipped: number }> {
  const users = await prisma.user.findMany({
    where: { emailVerified: true },
    select: { id: true, email: true, fullName: true, language: true, notificationPrefs: true },
  })

  let sent = 0
  for (const user of users) {
    try {
      if (await sendUserDigest(user)) sent++
    } catch (err) {
      // One bad mailbox never stops the rest of the run.
      console.error(`[digest] failed for ${user.email}:`, err)
    }
  }
  return { sent, skipped: users.length - sent }
}
