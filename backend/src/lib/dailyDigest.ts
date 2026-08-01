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

export function composeDigest(fullName: string, farms: FarmSummary[]): {
  subject: string
  text: string
} | null {
  const active = farms.filter(f => f.overdue + f.dueSoon + f.openFindings > 0)
  if (active.length === 0) return null

  const totalOverdue = active.reduce((s, f) => s + f.overdue, 0)
  const totalDueSoon = active.reduce((s, f) => s + f.dueSoon, 0)
  const totalFindings = active.reduce((s, f) => s + f.openFindings, 0)

  const headline = [
    totalOverdue > 0 ? pluralize(totalOverdue, 'labor vencida', 'labores vencidas') : null,
    totalDueSoon > 0 ? pluralize(totalDueSoon, 'labor próxima', 'labores próximas') : null,
    totalFindings > 0 ? pluralize(totalFindings, 'hallazgo sin resolver', 'hallazgos sin resolver') : null,
  ].filter(Boolean).join(', ')

  const farmLines = active.map(f => {
    const parts = [
      f.overdue > 0 ? `${f.overdue} vencida${f.overdue === 1 ? '' : 's'}` : null,
      f.dueSoon > 0 ? `${f.dueSoon} próxima${f.dueSoon === 1 ? '' : 's'}` : null,
      f.openFindings > 0 ? `${f.openFindings} hallazgo${f.openFindings === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join(', ')
    const labels = f.soonestLabels.length > 0 ? `\n   Siguiente: ${f.soonestLabels.join(' · ')}` : ''
    return `• ${f.farmName}: ${parts}${labels}`
  }).join('\n')

  return {
    subject: `Mi Finca PR — ${headline}`,
    text:
      `Hola ${fullName},\n\n` +
      `Este es tu resumen del día:\n\n${farmLines}\n\n` +
      `Entra a la aplicación para marcar labores o revisar hallazgos.\n` +
      `Puedes desactivar este resumen en Ajustes → Notificaciones.`,
  }
}

/** Build and send the digest for one user. Returns true if a mail went out. */
export async function sendUserDigest(user: {
  id: string
  email: string
  fullName: string
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
  const digest = composeDigest(user.fullName, summaries)
  if (!digest) return false

  await sendMail({ to: user.email, ...digest })
  return true
}

/** The daily job: every verified user who hasn't opted out. */
export async function runDailyDigest(): Promise<{ sent: number; skipped: number }> {
  const users = await prisma.user.findMany({
    where: { emailVerified: true },
    select: { id: true, email: true, fullName: true, notificationPrefs: true },
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
