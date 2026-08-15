import { prisma } from './prisma'
import { serializeField, fieldInclude } from '../routes/fields'

// ──────────────────────────────────────────────────────────────────────────
// Server-side backup / restore / clear. The v1 backup was a client-era
// snapshot of localStorage stores — restoring it only wrote local state,
// which the next refetch silently clobbered, and it never contained the
// operations log, harvests, or findings at all. v2 is authoritative:
//  - export: EVERYTHING the account owns, straight from the database
//  - restore: transactional replace (hard-deletes owned farms + custom
//    crops, then recreates from the file, preserving ids so internal
//    links — completed check-offs, treatment labores, yields — survive)
//  - clear: the delete half alone
// Restore is destructive by design; the UI confirms loudly before calling.
// ──────────────────────────────────────────────────────────────────────────

export const BACKUP_VERSION = 2

export async function buildExport(userId: string) {
  const farms = await prisma.farm.findMany({
    where: { userId, deletedAt: { equals: null } },
    include: {
      fields: {
        where: { deletedAt: { equals: null } },
        include: fieldInclude,
        orderBy: { createdAt: 'asc' as const },
      },
      livestockUnits: { where: { deletedAt: { equals: null } } },
      harvestYields: { where: { deletedAt: { equals: null } } },
      operations: true,
      members: { select: { userId: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Findings hang off fields, not farms — one query per farm's field set.
  const fieldIds = farms.flatMap(f => f.fields.map(fl => fl.id))
  const findings = await prisma.finding.findMany({
    where: { fieldId: { in: fieldIds } },
    include: { observations: { orderBy: [{ date: 'asc' as const }] } },
  })

  const customCrops = await prisma.cropType.findMany({
    where: { userId },
    include: { schedule: true },
  })

  return {
    app: 'mi-finca-pr',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    farms: farms.map(farm => ({
      id: farm.id,
      name: farm.name,
      location: farm.location,
      farmType: farm.farmType,
      boundary: farm.boundary,
      isFavorite: farm.isFavorite,
      description: farm.description,
      createdAt: farm.createdAt,
      fields: farm.fields.map(serializeField),
      livestock: farm.livestockUnits,
      harvests: farm.harvestYields,
      operations: farm.operations,
      findings: findings.filter(fi => farm.fields.some(fl => fl.id === fi.fieldId)),
      members: farm.members,
    })),
    customCrops,
  }
}

export async function clearUserData(userId: string): Promise<void> {
  // Hard delete (not the soft deletedAt) — restore recreates rows with
  // their original ids, and soft-deleted ghosts would collide with them.
  await prisma.farm.deleteMany({ where: { userId } })
  await prisma.cropType.deleteMany({ where: { userId } })
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const date = (v: unknown) => new Date(String(v))
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])

export async function restoreFromBackup(userId: string, data: any): Promise<{ farms: number }> {
  // Only reference users that still exist (performedBy, team members) —
  // the backup may be older than a teammate's account.
  const referenced = new Set<string>()
  for (const farm of data.farms ?? []) {
    for (const m of farm.members ?? []) referenced.add(String(m.userId))
    for (const op of farm.operations ?? []) if (op.performedByUserId) referenced.add(String(op.performedByUserId))
    for (const fi of farm.findings ?? []) {
      if (fi.performedByUserId) referenced.add(String(fi.performedByUserId))
      for (const ob of fi.observations ?? []) if (ob.performedByUserId) referenced.add(String(ob.performedByUserId))
    }
  }
  const existing = new Set(
    (await prisma.user.findMany({ where: { id: { in: [...referenced] } }, select: { id: true } })).map(u => u.id)
  )
  const userOrNull = (v: unknown) => (v && existing.has(String(v)) ? String(v) : null)

  await prisma.$transaction(async tx => {
    await tx.farm.deleteMany({ where: { userId } })
    await tx.cropType.deleteMany({ where: { userId } })

    for (const crop of data.customCrops ?? []) {
      await tx.cropType.create({
        data: {
          id: crop.id, userId,
          name: crop.name, nameEs: crop.nameEs,
          emoji: crop.emoji ?? '🌱', category: crop.category ?? 'Personalizados',
          isBuiltIn: false,
          ...(crop.schedule ? {
            schedule: {
              create: {
                harvestWindowStartDays: crop.schedule.harvestWindowStartDays,
                harvestWindowEndDays: crop.schedule.harvestWindowEndDays,
                operations: crop.schedule.operations ?? [],
              },
            },
          } : {}),
        },
      })
    }

    for (const farm of data.farms ?? []) {
      // Deferred FK links: rec-op → completing log entry (created later).
      const completedLinks: Array<{ recOpId: string; operationId: string }> = []
      for (const field of farm.fields ?? []) {
        for (const ev of field.plantingEvents ?? []) {
          for (const op of ev.operations ?? []) {
            if (op.completedOperationId) {
              completedLinks.push({ recOpId: op.id, operationId: op.completedOperationId })
            }
          }
        }
      }

      await tx.farm.create({
        data: {
          id: farm.id, userId,
          name: farm.name, location: farm.location,
          farmType: farm.farmType ?? 'mixed',
          boundary: farm.boundary ?? [],
          totalAreaAcres: num(farm.totalAreaAcres) ?? 0,
          isFavorite: !!farm.isFavorite,
          description: farm.description ?? null,
        },
      })

      for (const field of farm.fields ?? []) {
        // Field + free plants + events (with the recommendations calendar)
        // first; rows carry their plants with explicit event links after.
        await tx.field.create({
          data: {
            id: field.id, farmId: farm.id,
            name: field.name, kind: field.kind ?? 'crops',
            color: field.color, shape: field.shape,
            boundary: field.boundary ?? [],
            farmLat: num(field.farmLat) ?? 0, farmLng: num(field.farmLng) ?? 0,
            displayMode: field.displayMode ?? 'shape',
            isPositioning: !!field.isPositioning,
            plantingEvents: {
              create: (field.plantingEvents ?? []).map((ev: any) => ({
                id: ev.id, cropTypeId: ev.cropTypeId,
                plantingDate: date(ev.plantingDate),
                plantCount: num(ev.plantCount) ?? 0,
                recommended: {
                  // completedOperationId is an FK to the operations log,
                  // which doesn't exist yet — linked after the ops loop.
                  create: (ev.operations ?? []).map((op: any) => ({
                    id: op.id, templateId: op.templateId, type: op.type,
                    labelEs: op.labelEs, recommendedDate: date(op.recommendedDate),
                    status: op.status ?? 'pending',
                    completedDate: op.completedDate ? date(op.completedDate) : null,
                    notes: op.notes ?? null, product: op.product ?? null,
                    quantity: num(op.quantity), unit: op.unit ?? null,
                  })),
                },
              })),
            },
          },
        })
        for (const row of field.rows ?? []) {
          await tx.fieldRow.create({
            data: {
              id: row.id, fieldId: field.id,
              startLat: num(row.startLat) ?? 0, startLng: num(row.startLng) ?? 0,
              endLat: num(row.endLat) ?? 0, endLng: num(row.endLng) ?? 0,
              spacingFt: num(row.spacingFt) ?? 1,
              primaryCropTypeId: row.primaryCropTypeId,
              companionCropTypeId: row.companionCropTypeId ?? null,
              plantingDate: date(row.plantingDate),
              ...(Array.isArray(row.path) ? { path: row.path } : {}),
              ...(typeof row.pathClosed === 'boolean' ? { pathClosed: row.pathClosed } : {}),
              plants: {
                create: (row.plants ?? []).map((p: any) => ({
                  id: p.id, fieldId: field.id,
                  plantingEventId: p.plantingEventId ?? null,
                  cropTypeId: p.cropTypeId,
                  lat: num(p.lat) ?? 0, lng: num(p.lng) ?? 0,
                  plantingDate: date(p.plantingDate),
                })),
              },
            },
          })
        }
        for (const p of field.freePlants ?? []) {
          await tx.plantInstance.create({
            data: {
              id: p.id, fieldId: field.id,
              plantingEventId: p.plantingEventId ?? null,
              cropTypeId: p.cropTypeId,
              lat: num(p.lat) ?? 0, lng: num(p.lng) ?? 0,
              plantingDate: date(p.plantingDate),
            },
          })
        }
      }

      for (const unit of farm.livestock ?? []) {
        await tx.livestockUnit.create({
          data: {
            id: unit.id, farmId: farm.id,
            fieldId: unit.fieldId ?? null,
            name: unit.name, animalType: unit.animalType,
            currentCount: num(unit.currentCount) ?? 0,
            acquisitionDate: date(unit.acquisitionDate),
            farmLat: num(unit.farmLat), farmLng: num(unit.farmLng),
            notes: unit.notes ?? null,
          },
        })
      }

      for (const op of farm.operations ?? []) {
        await tx.operation.create({
          data: {
            id: op.id, farmId: farm.id,
            fieldId: op.fieldId ?? null,
            plantingEventId: op.plantingEventId ?? null,
            livestockUnitId: op.livestockUnitId ?? null,
            recommendedOperationId: op.recommendedOperationId ?? null,
            type: op.type, actualDate: date(op.actualDate),
            notes: op.notes ?? null, product: op.product ?? null,
            quantity: num(op.quantity), unit: op.unit ?? null,
            qualityRating: num(op.qualityRating),
            photoUrls: ids(op.photoUrls),
            rowIds: ids(op.rowIds), plantIds: ids(op.plantIds),
            countDelta: num(op.countDelta), countReason: op.countReason ?? null,
            performedByUserId: userOrNull(op.performedByUserId),
          },
        })
      }

      // Operations exist now — apply the deferred check-off links.
      for (const link of completedLinks) {
        await tx.recommendedOperation.update({
          where: { id: link.recOpId },
          data: { completedOperationId: link.operationId },
        }).catch(() => { /* dangling link in an edited backup — skip */ })
      }

      for (const h of farm.harvests ?? []) {
        await tx.harvestYield.create({
          data: {
            id: h.id, farmId: farm.id,
            fieldId: h.fieldId ?? null, operationId: h.operationId ?? null,
            cropTypeId: h.cropTypeId ?? null,
            livestockUnitId: h.livestockUnitId ?? null,
            productId: h.productId ?? null,
            quantity: num(h.quantity) ?? 0, unit: h.unit,
            revenue: num(h.revenue),
            harvestDate: date(h.harvestDate),
            notes: h.notes ?? null,
          },
        })
      }

      for (const fi of farm.findings ?? []) {
        await tx.finding.create({
          data: {
            id: fi.id, fieldId: fi.fieldId,
            pestId: fi.pestId, severity: num(fi.severity) ?? 1,
            status: fi.status ?? 'open',
            foundDate: date(fi.foundDate),
            notes: fi.notes ?? null,
            rowIds: ids(fi.rowIds), plantIds: ids(fi.plantIds),
            treatmentRecommendedOperationId: fi.treatmentRecommendedOperationId ?? null,
            performedByUserId: userOrNull(fi.performedByUserId),
            observations: {
              create: (fi.observations ?? []).map((ob: any) => ({
                id: ob.id, date: date(ob.date),
                severity: num(ob.severity) ?? 1,
                rowIds: ids(ob.rowIds), plantIds: ids(ob.plantIds),
                notes: ob.notes ?? null,
                performedByUserId: userOrNull(ob.performedByUserId),
              })),
            },
          },
        })
      }

      // Team memberships (only for teammates whose accounts still exist,
      // never the owner). Invite codes are NOT restored — those are secrets.
      for (const m of farm.members ?? []) {
        const memberId = userOrNull(m.userId)
        if (!memberId || memberId === userId) continue
        await tx.farmMember.create({
          data: { farmId: farm.id, userId: memberId, role: m.role ?? 'operator' },
        })
      }
    }
  }, { timeout: 120000, maxWait: 10000 })

  return { farms: (data.farms ?? []).length }
}
