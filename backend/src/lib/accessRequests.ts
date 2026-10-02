import type { AccessRequest } from '@prisma/client'
import { sendMail, type MailMessage } from './mailer'
import { logger } from './logger'

// ──────────────────────────────────────────────────────────────────────────
// Beta access requests (POST /auth/access-requests), as the app's owner
// reads them: in the notification email and in the terminal
// (scripts/listAccessRequests). Everything in a request was typed by a
// stranger, and both places are plain text — so what needs defending is
// the shape of that text:
//  - single-line fields lose their line breaks and control characters: a
//    name cannot go on as a forged "Email: …" line, nor repaint a terminal
//  - the message keeps its lines, each one marked as a quote
//  - nothing typed goes into the subject
//  - only the email address goes into the commands the owner copies, and
//    only if it is safe to paste
// ──────────────────────────────────────────────────────────────────────────

export function oneLine(value: string): string {
  return value.replace(/[\s\p{Cc}]+/gu, ' ').trim()
}

export function quoteLines(value: string): string {
  return value
    .split(/\r\n|[\n\r\p{Zl}\p{Zp}]/u)
    .map(line => `> ${oneLine(line)}`.trimEnd())
    .join('\n')
}

// The route's z.email() already admits nothing a shell would read inside
// double quotes. Checked again here, where it matters: this text gets
// pasted into a terminal.
const SAFE_TO_PASTE = /^[A-Za-z0-9_'+.@-]+$/

export function accessRequestMail(request: AccessRequest): Omit<MailMessage, 'to'> {
  const pasteable = SAFE_TO_PASTE.test(request.email)

  const lines = [
    'Alguien pidió acceso a la beta de Mi Finca PR.',
    '',
    `Nombre: ${oneLine(request.fullName)}`,
    `Email: ${oneLine(request.email)}`,
    `Municipio: ${request.location ? oneLine(request.location) : '—'}`,
    `Idioma: ${request.language === 'en' ? 'inglés' : 'español'}`,
    '',
    'Para darle acceso, genera un código (desde backend/) y envíaselo a su correo:',
    `  npm run signup:code${pasteable ? ` -- --note "${request.email}"` : ''}`,
    '',
    'Cuando le contestes, marca su solicitud como atendida:',
    `  npm run access:requests -- --handled ${pasteable ? `"${request.email}"` : '<email>'}`,
  ]
  if (request.message) {
    lines.push('', 'Mensaje:', quoteLines(request.message))
  }

  return {
    subject: 'Mi Finca PR — Nueva solicitud de acceso',
    text: lines.join('\n'),
  }
}

// Tells the owner about a request that is ALREADY stored. Never throws:
// without BETA_CONTACT_EMAIL, or with the mail provider down, the request
// still waits in the table for `npm run access:requests`.
export async function notifyAccessRequest(request: AccessRequest): Promise<void> {
  const to = process.env.BETA_CONTACT_EMAIL
  if (!to) {
    logger.info(
      { accessRequestId: request.id },
      'access request stored — BETA_CONTACT_EMAIL not set, nobody notified'
    )
    return
  }
  try {
    await sendMail({ to, ...accessRequestMail(request) })
  } catch (err) {
    logger.error(
      { err, accessRequestId: request.id },
      'access request stored — the email to the owner failed'
    )
  }
}
