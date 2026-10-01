// List the beta access requests still waiting for an answer, oldest first
// (POST /auth/access-requests stores them while SIGNUP_MODE=invite).
//
//   npm run access:requests                           → pending requests
//   npm run access:requests -- --handled ana@example.com
//                                                     → mark hers as answered
//
// To let someone in: `npm run signup:code -- --note "ana@example.com"`,
// send them the code, then mark the request handled.
import { prisma } from '../src/lib/prisma'
import { oneLine, quoteLines } from '../src/lib/accessRequests'

function argOf(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function markHandled(email: string) {
  const { count } = await prisma.accessRequest.updateMany({
    where: { email: email.trim().toLowerCase(), handledAt: null },
    data: { handledAt: new Date() },
  })
  console.log(count > 0
    ? `\n  Solicitudes de ${oneLine(email)} marcadas como atendidas: ${count}\n`
    : `\n  No hay solicitudes pendientes de ${oneLine(email)}\n`)
}

async function listPending() {
  const pending = await prisma.accessRequest.findMany({
    where: { handledAt: null },
    orderBy: { createdAt: 'asc' },
  })
  if (pending.length === 0) {
    console.log('\n  No hay solicitudes de acceso pendientes\n')
    return
  }

  console.log(`\n  Solicitudes de acceso pendientes: ${pending.length}\n`)
  // Typed by strangers — printed through the same filters as the email.
  for (const r of pending) {
    const date = r.createdAt.toISOString().slice(0, 16).replace('T', ' ')
    console.log(`  ${date} UTC · ${oneLine(r.fullName)} <${oneLine(r.email)}> · ${r.location ? oneLine(r.location) : '—'} · ${r.language}`)
    if (r.message) console.log(quoteLines(r.message).replace(/^/gm, '    '))
    console.log('')
  }
  console.log('  Dar acceso:    npm run signup:code -- --note "<email>"')
  console.log('  Al contestar:  npm run access:requests -- --handled <email>\n')
}

async function main() {
  if (!process.argv.includes('--handled')) return listPending()

  const email = argOf('--handled')
  if (!email) {
    console.log('\n  Falta el email: npm run access:requests -- --handled <email>\n')
    process.exitCode = 1
    return
  }
  return markHandled(email)
}

main().finally(() => prisma.$disconnect())
