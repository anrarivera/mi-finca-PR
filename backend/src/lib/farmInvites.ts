import { randomBytes, createHash } from 'crypto'

// Join codes look like "7K3M-9QPX": 8 chars from a 32-symbol alphabet with
// the lookalikes (0/O, 1/I) removed — easy to read aloud across a field.
// 40 bits of entropy is plenty for a code that also expires in days and is
// revocable; only its SHA-256 hash is persisted.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const INVITE_TTL_DAYS = 7

export function generateInviteCode(): string {
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return `${out.slice(0, 4)}-${out.slice(4)}`
}

/** Forgiving input: case, dashes, and spaces don't matter. */
export function normalizeInviteCode(raw: string): string {
  return String(raw).toUpperCase().replace(/[^A-Z2-9]/g, '')
}

export function hashInviteCode(raw: string): string {
  return createHash('sha256').update(normalizeInviteCode(raw)).digest('hex')
}
