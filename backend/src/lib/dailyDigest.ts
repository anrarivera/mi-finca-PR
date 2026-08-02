import { prisma } from './prisma'
import { sendMail } from './mailer'

// ──────────────────────────────────────────────────────────────────────────
// Email reminders (notifications, issue #11). The cron still runs every
// morning, but WHETHER a user gets mail depends on their frequency mode:
//
//  - 'novedades' (default): only when something crossed a line today —
//    a labor entered their anticipation window (daysUntil == leadDays),
//    is due today (== 0), or just became overdue (== -1). Stateless: all
//    three are computable fresh each morning. A labor generates at most
//    three emails across its life instead of a daily nag.
//  - 'semanal': Mondays (Puerto Rico time) only, whenever anything is
//    pending — the right mode for farms busy enough that every day has
//    "news".
//
// Either way the email carries the FULL picture (window + overdue +
// findings), with identical labels grouped ("Fertilización × 12") so a
// 100-field farm gets five lines, not a hundred. No pending work, no
// email — ever.
// ──────────────────────────────────────────────────────────────────────────

type PendingOp = {
  labelEs: string
  daysUntil: number
  /** Field or herd name — where the work happens. */
  placeName: string | null
}

type FarmSummary = {
  farmName: string
  overdue: number
  dueSoon: number
  openFindings: number
  /** Soonest-first, identical labels collapsed ("Fertilización × 12"). */
  groupedLabels: string[]
  /** Any labor crossed a notify line today (enters window / due / newly overdue). */
  triggered: boolean
}

const DEFAULT_LEAD_DAYS = 14

function todayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function isMondayInPuertoRico(now: Date): boolean {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Puerto_Rico', weekday: 'short',
  }).format(now) === 'Mon'
}

async function summarizeFarm(
  farmId: string,
  farmName: string,
  leadDays: number,
  now: Date
): Promise<FarmSummary> {
  const today = todayUtc(now)
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
    select: {
      labelEs: true,
      recommendedDate: true,
      plantingEvent: { select: { field: { select: { name: true } } } },
      livestockUnit: { select: { name: true } },
    },
  })

  const openFindings = await prisma.finding.count({
    where: {
      status: { not: 'resolved' },
      field: { farmId, deletedAt: { equals: null } },
    },
  })

  const pending: PendingOp[] = ops.map(o => ({
    labelEs: o.labelEs,
    daysUntil: Math.round((o.recommendedDate.getTime() - today.getTime()) / 86_400_000),
    placeName: o.plantingEvent?.field?.name ?? o.livestockUnit?.name ?? null,
  }))

  const overdue = pending.filter(o => o.daysUntil < 0).length
  // Findings never trigger (you logged them yourself); labores do — which
  // covers treatment labores created from findings automatically.
  const triggered = pending.some(o =>
    o.daysUntil === leadDays || o.daysUntil === 0 || o.daysUntil === -1
  )

  // Group identical labels, preserving soonest-first order of appearance.
  // Field/herd names ride along when few enough to stay readable:
  //   "Riego — Campo Norte" · "Fertilización × 3 — Cafetal" ·
  //   "Primera fertilización × 12" (too many places, count only).
  const MAX_GROUPS = 4
  const MAX_NAMED_PLACES = 3
  const groups = new Map<string, { count: number; places: Set<string> }>()
  for (const op of pending) {
    const g = groups.get(op.labelEs) ?? { count: 0, places: new Set<string>() }
    g.count += 1
    if (op.placeName) g.places.add(op.placeName)
    groups.set(op.labelEs, g)
  }
  const groupedLabels = [...groups.entries()]
    .slice(0, MAX_GROUPS)
    .map(([label, g]) => {
      const head = g.count > 1 ? `${label} × ${g.count}` : label
      return g.places.size > 0 && g.places.size <= MAX_NAMED_PLACES
        ? `${head} — ${[...g.places].join(', ')}`
        : head
    })
  if (groups.size > MAX_GROUPS) groupedLabels.push('…')

  return {
    farmName,
    overdue,
    dueSoon: pending.length - overdue,
    openFindings,
    groupedLabels,
    triggered,
  }
}

function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

// The email speaks the user's language (User.language, synced from the
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
    greeting: (name: string) => `Hola ${name},`,
    intro: 'Este es el estado de tus labores:',
    outro:
      'Entra a la aplicación para marcar labores o revisar hallazgos.\n' +
      'Puedes ajustar estos recordatorios en Ajustes → Notificaciones.',
  },
  en: {
    overdue: (n: number) => pluralize(n, 'overdue task', 'overdue tasks'),
    dueSoon: (n: number) => pluralize(n, 'upcoming task', 'upcoming tasks'),
    findings: (n: number) => pluralize(n, 'open finding', 'open findings'),
    farmOverdue: (n: number) => `${n} overdue`,
    farmDueSoon: (n: number) => `${n} upcoming`,
    farmFindings: (n: number) => `${n} finding${n === 1 ? '' : 's'}`,
    greeting: (name: string) => `Hi ${name},`,
    intro: 'Here is the state of your tasks:',
    outro:
      'Open the app to check off tasks or review findings.\n' +
      'You can adjust these reminders in Settings → Notifications.',
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
    const labels = f.groupedLabels.length > 0 ? `\n   ${f.groupedLabels.join(' · ')}` : ''
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

/** Build and send for one user. Returns true if a mail went out. */
export async function sendUserDigest(
  user: {
    id: string
    email: string
    fullName: string
    language?: string
    notificationPrefs: unknown
  },
  now: Date = new Date()
): Promise<boolean> {
  const prefs = (user.notificationPrefs ?? {}) as Record<string, unknown>
  if (prefs.enabled === false || prefs.emailDigest === false) return false
  const leadDays =
    typeof prefs.dueSoonLeadDays === 'number' ? prefs.dueSoonLeadDays : DEFAULT_LEAD_DAYS
  const frequency = prefs.emailFrequency === 'semanal' ? 'semanal' : 'novedades'

  // Weekly mode sends only on Mondays (island time) — no other gate.
  if (frequency === 'semanal' && !isMondayInPuertoRico(now)) return false

  const farms = await prisma.farm.findMany({
    where: {
      deletedAt: { equals: null },
      OR: [{ userId: user.id }, { members: { some: { userId: user.id } } }],
    },
    select: { id: true, name: true },
  })
  if (farms.length === 0) return false

  const summaries = await Promise.all(
    farms.map(f => summarizeFarm(f.id, f.name, leadDays, now))
  )

  // Novedades mode: silence unless something crossed a line today.
  if (frequency === 'novedades' && !summaries.some(s => s.triggered)) return false

  const lang: DigestLang = user.language === 'en' ? 'en' : 'es'
  const digest = composeDigest(user.fullName, summaries, lang)
  if (!digest) return false

  await sendMail({ to: user.email, ...digest })
  return true
}

/** The daily job: every verified user who hasn't opted out. */
export async function runDailyDigest(
  now: Date = new Date()
): Promise<{ sent: number; skipped: number }> {
  const users = await prisma.user.findMany({
    where: { emailVerified: true },
    select: { id: true, email: true, fullName: true, language: true, notificationPrefs: true },
  })

  let sent = 0
  for (const user of users) {
    try {
      if (await sendUserDigest(user, now)) sent++
    } catch (err) {
      // One bad mailbox never stops the rest of the run.
      console.error(`[digest] failed for ${user.email}:`, err)
    }
  }
  return { sent, skipped: users.length - sent }
}
