import { prisma } from './prisma'
import { Errors } from './errors'

// ──────────────────────────────────────────────────────────────────────────
// Closed-beta access rules. The signup gate (routes/auth.ts) admits on a
// beta signup code or a farm invite code, and the public demo needs
// neither. Two rules keep those facts from adding up to an open door:
//  - demo accounts have no team features — a visitor can't mint an invite
//    code from the seeded farm, nor reach real people through it
//  - a farm invite code creates NEW accounts only when the farm's owner
//    was admitted by the app's owner — invited people can bring their crew
//    onto a farm, but can't admit strangers to the app
// ──────────────────────────────────────────────────────────────────────────

// User.admittedVia. NULL (not in this list) = the account predates the
// column and counts as admitted by the app's owner.
export type AdmittedVia = 'open' | 'signup_code' | 'farm_invite' | 'demo'

export async function isDemoAccount(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isDemo: true },
  })
  return user?.isDemo === true
}

// Guards the team routes (invite, add by email, join). Call it before
// anything that reads the request: the answer must not depend on whether
// an email is registered or a code is valid.
export async function requireRealAccount(userId: string): Promise<void> {
  if (await isDemoAccount(userId)) {
    throw Errors.forbidden(
      'Las cuentas de demostración no pueden invitar ni unirse a equipos. Crea tu cuenta para trabajar con tu equipo.'
    )
  }
}

// Whether a farm's invite codes open the signup gate. The owner is
// Farm.userId — which admin generated the code doesn't matter. Codes that
// fail this still work at POST /farms/join from an existing account.
export function ownerCanAdmit(owner: { isDemo: boolean; admittedVia: string | null }): boolean {
  return !owner.isDemo && owner.admittedVia !== 'farm_invite'
}
