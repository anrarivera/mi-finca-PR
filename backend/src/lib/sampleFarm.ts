import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { Errors } from './errors'
import { logger } from './logger'
import { seedDemoFarm } from './demoSeed'
import { enforceContract } from '../contracts/enforce'
import { sampleFarmStatusSchema } from '../contracts/sampleFarmContract'

// ──────────────────────────────────────────────────────────────────────────
// The sample farm inside a real account ("finca de ejemplo"): the demo's
// seeded finca, living next to the user's own farms and switched on and
// off from Settings. Nothing is stored for the switch — its state IS the
// existence of a non-deleted sample farm, and the farm's age is createdAt.
//
// What the user changes in it expires: once the farm is older than
// SAMPLE_FARM_TTL_DAYS the nightly job throws it away and seeds a fresh
// one. The seed's dates are relative to "now", so that also keeps its
// overdue labor overdue instead of rotting.
//
// Demo accounts are out of scope here — the whole account already is the
// demo, and its farm leaves with the account (the demo purge).
// ──────────────────────────────────────────────────────────────────────────

export const SAMPLE_FARM_TTL_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

// A seed is a few dozen sequential inserts; Prisma's default 5 s budget
// for an interactive transaction is too tight on a slow database link.
const TX_OPTIONS = { timeout: 30000, maxWait: 10000 }

function formatStatus(farm: { id: string; createdAt: Date } | null) {
  return enforceContract(sampleFarmStatusSchema, {
    enabled: farm !== null,
    farmId: farm?.id ?? null,
    seededAt: farm?.createdAt ?? null,
    resetsAt: farm
      ? new Date(farm.createdAt.getTime() + SAMPLE_FARM_TTL_DAYS * DAY_MS)
      : null,
    ttlDays: SAMPLE_FARM_TTL_DAYS,
  }, 'sampleFarmStatus')
}

export async function getSampleFarmStatus(userId: string) {
  const farm = await prisma.farm.findFirst({
    where: {
      userId,
      isSample: true,
      deletedAt: { equals: null },
      // A demo account's farm is the account itself, not a switch.
      user: { isDemo: false },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true },
  })
  return formatStatus(farm)
}

// Every write starts here. The row lock keeps it at ONE sample farm per
// account whatever runs at the same time (a double click on the switch,
// the nightly job meeting a manual reset): the second writer waits, then
// sees — and removes — what the first one seeded. NO KEY UPDATE, so the
// user's other requests (whose inserts only reference the row) never wait.
async function lockAccount(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<{ isDemo: boolean }[]>`
    SELECT "isDemo" FROM "users" WHERE "id" = ${userId} FOR NO KEY UPDATE`
  if (rows.length === 0) throw Errors.unauthorized()
  if (rows[0].isDemo) {
    throw Errors.forbidden(
      'La cuenta de demostración ya es la finca de ejemplo. Crea tu cuenta para tenerla junto a tus fincas.'
    )
  }
}

// Hard delete (not the soft deletedAt): everything under a farm cascades
// from it — fields with their rows, plants, plantings + calendar and
// findings; the operations log, harvests, herds, team, invites, recipe
// defaults. The ONE exception is a herd-level labor, which is only
// detached (SET NULL) when its herd goes, so those are deleted first.
async function hardDeleteFarms(tx: Prisma.TransactionClient, farmIds: string[]) {
  await tx.recommendedOperation.deleteMany({
    where: { livestockUnit: { farmId: { in: farmIds } } },
  })
  await tx.farm.deleteMany({ where: { id: { in: farmIds } } })
}

// Every sample farm the user owns, soft-deleted leftovers included.
async function removeSampleFarms(tx: Prisma.TransactionClient, userId: string) {
  const farms = await tx.farm.findMany({
    where: { userId, isSample: true },
    select: { id: true, isFavorite: true, deletedAt: true },
  })
  if (farms.length === 0) return
  await hardDeleteFarms(tx, farms.map(f => f.id))

  // Mirrors DELETE /farms/:id — when the favorite leaves, the oldest
  // remaining farm inherits it.
  if (farms.some(f => f.isFavorite && f.deletedAt === null)) {
    const next = await tx.farm.findFirst({
      where: { userId, deletedAt: { equals: null } },
      orderBy: { createdAt: 'asc' },
    })
    if (next) {
      await tx.farm.update({ where: { id: next.id }, data: { isFavorite: true } })
    }
  }
}

// Out with the old, in with a fresh seed — as one unit, so a failed seed
// never costs the account the sample farm it had. `onlyIf` narrows the
// write to accounts whose live sample farm matches it (checked under the
// lock); false means it did not match, and nothing was touched.
async function reseed(userId: string, onlyIf?: Prisma.FarmWhereInput): Promise<boolean> {
  return prisma.$transaction(async tx => {
    await lockAccount(tx, userId)
    if (onlyIf) {
      const live = await tx.farm.findFirst({
        where: { ...onlyIf, userId, isSample: true, deletedAt: { equals: null } },
        select: { id: true },
      })
      if (!live) return false
    }
    await removeSampleFarms(tx, userId)

    // The sample farm never steals the favorite from the user's own
    // farms — it only takes it in an account that has no other farm.
    const ownFarms = await tx.farm.count({
      where: { userId, deletedAt: { equals: null } },
    })
    await seedDemoFarm(userId, { tx, isFavorite: ownFarms === 0 })
    return true
  }, TX_OPTIONS)
}

// Idempotent: switching on what is already on just seeds it afresh.
export async function enableSampleFarm(userId: string) {
  await reseed(userId)
  return getSampleFarmStatus(userId)
}

export async function disableSampleFarm(userId: string) {
  await prisma.$transaction(async tx => {
    await lockAccount(tx, userId)
    await removeSampleFarms(tx, userId)
  }, TX_OPTIONS)
  return getSampleFarmStatus(userId)
}

// "Reset now" — the fresh seed the nightly job gives, on demand.
export async function resetSampleFarm(userId: string) {
  const wasEnabled = await reseed(userId, {})
  if (!wasEnabled) {
    throw Errors.conflict('La finca de ejemplo no está activada.')
  }
  return getSampleFarmStatus(userId)
}

/** The nightly job: expire what users changed in their sample farms. */
export async function resetStaleSampleFarms(
  now: Date = new Date()
): Promise<{ reset: number; purged: number; failed: number }> {
  // Removing the sample farm with the normal delete button switched it
  // off — nothing to keep, whatever its age.
  const purged = await prisma.$transaction(async tx => {
    const removed = await tx.farm.findMany({
      where: { isSample: true, deletedAt: { not: null }, user: { isDemo: false } },
      select: { id: true },
    })
    await hardDeleteFarms(tx, removed.map(f => f.id))
    return removed.length
  }, TX_OPTIONS)

  const stale: Prisma.FarmWhereInput = {
    createdAt: { lt: new Date(now.getTime() - SAMPLE_FARM_TTL_DAYS * DAY_MS) },
  }
  const owners = await prisma.farm.findMany({
    where: {
      ...stale,
      isSample: true,
      deletedAt: { equals: null },
      user: { isDemo: false },
    },
    select: { userId: true },
    distinct: ['userId'],
  })

  let reset = 0
  let failed = 0
  for (const { userId } of owners) {
    try {
      // Re-checked under the lock: the user may have switched it off, or
      // reset it by hand, since the scan above.
      if (await reseed(userId, stale)) reset++
    } catch (err) {
      // One account failing never stops the rest of the run.
      failed++
      logger.error({ err, userId }, 'sample farm reset failed')
    }
  }
  return { reset, purged, failed }
}
