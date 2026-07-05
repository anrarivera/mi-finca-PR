import { randomBytes, createHash } from 'crypto'
import { prisma } from './prisma'

// ──────────────────────────────────────────────────────────────────────────
// One-time tokens for email-driven actions (issues #9/#10): verify email,
// reset password, change email. Only a SHA-256 hash is persisted — a DB
// leak exposes nothing redeemable. Issuing a new token invalidates any
// outstanding ones of the same type, and redemption is single-use.
// ──────────────────────────────────────────────────────────────────────────

export type ActionTokenType = 'verify_email' | 'reset_password' | 'change_email'

const TOKEN_TTL_HOURS: Record<ActionTokenType, number> = {
  verify_email: 48,
  reset_password: 2,
  change_email: 48,
}

export function hashActionToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** Create a token for the user and return the RAW value (goes in the email). */
export async function createActionToken(
  userId: string,
  type: ActionTokenType,
  opts: { newEmail?: string } = {},
): Promise<string> {
  const raw = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS[type] * 60 * 60 * 1000)

  // Outstanding tokens of the same type die when a new one is issued.
  await prisma.actionToken.deleteMany({ where: { userId, type, usedAt: null } })
  await prisma.actionToken.create({
    data: {
      userId,
      type,
      tokenHash: hashActionToken(raw),
      newEmail: opts.newEmail,
      expiresAt,
    },
  })
  return raw
}

/**
 * Redeem a raw token of the given type. Returns the token row after marking
 * it used, or null if it is unknown, of another type, expired, or already
 * spent.
 */
export async function consumeActionToken(raw: string, type: ActionTokenType) {
  const record = await prisma.actionToken.findUnique({
    where: { tokenHash: hashActionToken(raw) },
  })
  if (
    !record ||
    record.type !== type ||
    record.usedAt !== null ||
    record.expiresAt < new Date()
  ) {
    return null
  }
  await prisma.actionToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  })
  return record
}
