import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { Errors } from '../lib/errors'
import { requireFields } from '../lib/validate'
import { requireFarmRole } from '../lib/farmAccess'
import { sendMail } from '../lib/mailer'
import {
  generateInviteCode, hashInviteCode, INVITE_TTL_DAYS,
} from '../lib/farmInvites'

// ──────────────────────────────────────────────────────────────────────────
// Farm team management (roles phase 2). Members are added by the email of
// an EXISTING account — inviting an address without an account returns a
// clear error instead of a pending-invite flow (deferred; farm teams are
// small and coordinated out-of-band). Mounted at /api/v1/farms/:farmId/members
// ──────────────────────────────────────────────────────────────────────────

const router = Router({ mergeParams: true })

router.use(requireAuth)

const MEMBER_ROLES = ['admin', 'operator'] as const
type MemberRole = (typeof MEMBER_ROLES)[number]

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:farmId/members
// The team roster — any member can see who else works the farm.
// ─────────────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const { farm } = await requireFarmRole(req.user!.userId, farmId, 'operator')

    const [owner, members] = await Promise.all([
      prisma.user.findUnique({
        where: { id: farm.userId },
        select: { id: true, fullName: true, email: true },
      }),
      prisma.farmMember.findMany({
        where: { farmId },
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    res.json({
      success: true,
      data: [
        { userId: owner!.id, fullName: owner!.fullName, email: owner!.email, role: 'owner' },
        ...members.map(m => ({
          userId: m.user.id,
          fullName: m.user.fullName,
          email: m.user.email,
          role: m.role,
        })),
      ],
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/farms/:farmId/members  { email, role }
// Add an existing account to the team (admin+).
// ─────────────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    requireFields(req.body, ['email', 'role'])
    const { email, role } = req.body

    if (!MEMBER_ROLES.includes(role)) {
      throw Errors.validation(`role must be one of: ${MEMBER_ROLES.join(', ')}`)
    }

    const { farm } = await requireFarmRole(req.user!.userId, farmId, 'admin')

    const invitee = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase() },
    })
    if (!invitee) {
      throw Errors.validation(
        'Esa persona todavía no tiene cuenta en Mi Finca PR — pídele que se registre primero.'
      )
    }
    if (invitee.id === farm.userId) {
      throw Errors.conflict('Esa persona es el dueño de la finca')
    }
    const existing = await prisma.farmMember.findUnique({
      where: { farmId_userId: { farmId, userId: invitee.id } },
    })
    if (existing) {
      throw Errors.conflict('Esa persona ya es parte del equipo')
    }

    const member = await prisma.farmMember.create({
      data: { farmId, userId: invitee.id, role: role as MemberRole },
    })

    // Best-effort notification — membership is already effective.
    const inviter = await prisma.user.findUnique({
      where: { id: req.user!.userId }, select: { fullName: true },
    })
    sendMail({
      to: invitee.email,
      subject: `Te añadieron a ${farm.name} en Mi Finca PR`,
      text:
        `${inviter?.fullName ?? 'Alguien'} te añadió al equipo de "${farm.name}" ` +
        `como ${role === 'admin' ? 'administrador' : 'operador'}. ` +
        `La finca ya aparece en tu cuenta.`,
    }).catch(() => { /* email failure never blocks the membership */ })

    res.status(201).json({
      success: true,
      data: {
        userId: invitee.id,
        fullName: invitee.fullName,
        email: invitee.email,
        role: member.role,
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/farms/:farmId/members/invites  { role }
// Generate a join code (admin+). The plain code is returned ONCE —
// only its hash is stored. Multi-use until expiry or revocation.
// ─────────────────────────────────────────────────────────────────────
router.post('/invites', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    requireFields(req.body, ['role'])
    const { role } = req.body

    if (!MEMBER_ROLES.includes(role)) {
      throw Errors.validation(`role must be one of: ${MEMBER_ROLES.join(', ')}`)
    }

    await requireFarmRole(req.user!.userId, farmId, 'admin')

    const code = generateInviteCode()
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
    const invite = await prisma.farmInvite.create({
      data: {
        farmId,
        role: role as MemberRole,
        codeHash: hashInviteCode(code),
        createdBy: req.user!.userId,
        expiresAt,
      },
    })

    res.status(201).json({
      success: true,
      data: { id: invite.id, code, role: invite.role, expiresAt: invite.expiresAt },
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:farmId/members/invites
// Active (unexpired, unrevoked) codes — without the codes themselves,
// which are unrecoverable by design.
// ─────────────────────────────────────────────────────────────────────
router.get('/invites', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    await requireFarmRole(req.user!.userId, farmId, 'admin')

    const invites = await prisma.farmInvite.findMany({
      where: { farmId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, role: true, expiresAt: true, createdAt: true },
    })

    res.json({ success: true, data: invites })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/v1/farms/:farmId/members/invites/:inviteId — revoke
// ─────────────────────────────────────────────────────────────────────
router.delete('/invites/:inviteId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const inviteId = req.params.inviteId as string
    await requireFarmRole(req.user!.userId, farmId, 'admin')

    const invite = await prisma.farmInvite.findFirst({
      where: { id: inviteId, farmId, revokedAt: null },
    })
    if (!invite) throw Errors.notFound('Invite')

    await prisma.farmInvite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    })

    res.json({ success: true, data: { success: true } })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// PATCH /api/v1/farms/:farmId/members/:userId  { role }
// Change a member's role (admin+). The owner is not a member row.
// ─────────────────────────────────────────────────────────────────────
router.patch('/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const targetUserId = req.params.userId as string
    requireFields(req.body, ['role'])
    const { role } = req.body

    if (!MEMBER_ROLES.includes(role)) {
      throw Errors.validation(`role must be one of: ${MEMBER_ROLES.join(', ')}`)
    }

    await requireFarmRole(req.user!.userId, farmId, 'admin')

    const existing = await prisma.farmMember.findUnique({
      where: { farmId_userId: { farmId, userId: targetUserId } },
    })
    if (!existing) throw Errors.notFound('Member')

    const updated = await prisma.farmMember.update({
      where: { id: existing.id },
      data: { role: role as MemberRole },
    })

    res.json({ success: true, data: { userId: targetUserId, role: updated.role } })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/v1/farms/:farmId/members/:userId
// Remove a member (admin+), or leave the farm yourself (any member).
// The owner can never be removed — ownership transfer is not a thing yet.
// ─────────────────────────────────────────────────────────────────────
router.delete('/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const targetUserId = req.params.userId as string
    const isSelf = targetUserId === req.user!.userId

    await requireFarmRole(req.user!.userId, farmId, isSelf ? 'operator' : 'admin')

    const existing = await prisma.farmMember.findUnique({
      where: { farmId_userId: { farmId, userId: targetUserId } },
    })
    if (!existing) throw Errors.notFound('Member')

    await prisma.farmMember.delete({ where: { id: existing.id } })

    res.json({ success: true, data: { success: true } })
  } catch (err) {
    next(err)
  }
})

export default router
