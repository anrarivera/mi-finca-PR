import { prisma } from './prisma'
import { Errors } from './errors'

// Per-farm authorization (SDD roles design). The owner is Farm.userId;
// admins and operators are farm_members rows. Rank order:
//   operator (log work) < admin (everything but farm deletion) < owner.
export type FarmRole = 'owner' | 'admin' | 'operator'

const RANK: Record<FarmRole, number> = { operator: 1, admin: 2, owner: 3 }

export function isAtLeast(role: FarmRole, minRole: FarmRole): boolean {
  return RANK[role] >= RANK[minRole]
}

// Resolve the requesting user's role on a farm and demand a minimum.
// Outsiders get the same 404 as a nonexistent farm — membership is never
// revealed; insufficient-but-real members get a 403.
export async function requireFarmRole(
  userId: string,
  farmId: string,
  minRole: FarmRole
) {
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, deletedAt: { equals: null } },
    include: { members: { where: { userId }, select: { role: true } } },
  })
  if (!farm) throw Errors.notFound('Farm')

  const role: FarmRole | null =
    farm.userId === userId
      ? 'owner'
      : ((farm.members[0]?.role as FarmRole | undefined) ?? null)

  if (!role) throw Errors.notFound('Farm')
  if (!isAtLeast(role, minRole)) throw Errors.forbidden()
  return { farm, role }
}
