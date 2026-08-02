// Generate a beta signup code for the gate (SIGNUP_MODE=invite).
//
//   npm run signup:code                        → 1 use, 30 days
//   npm run signup:code -- --uses 5 --days 60 --note "amigos beta"
//   npm run signup:code -- --uses 0            → unlimited uses
//
// Prints the plain code ONCE — only its hash is stored.
import { prisma } from '../src/lib/prisma'
import { generateInviteCode, hashInviteCode } from '../src/lib/farmInvites'

function argOf(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const uses = Number(argOf('--uses') ?? '1')
  const days = Number(argOf('--days') ?? '30')
  const note = argOf('--note') ?? null

  const code = generateInviteCode()
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  await prisma.signupCode.create({
    data: {
      codeHash: hashInviteCode(code),
      maxUses: uses > 0 ? uses : null, // 0 = unlimited
      note,
      expiresAt,
    },
  })

  console.log(`\n  Código de acceso: ${code}`)
  console.log(`  Usos: ${uses > 0 ? uses : 'ilimitados'} · Vence: ${expiresAt.toISOString().split('T')[0]}${note ? ` · ${note}` : ''}\n`)
}

main().finally(() => prisma.$disconnect())
