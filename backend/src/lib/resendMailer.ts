import { Resend } from 'resend'
import type { Mailer } from './mailer'

// Resend-backed implementation of the Mailer seam. Wired at startup when
// RESEND_API_KEY is present (see index.ts); tests and keyless dev setups
// keep the console mailer.
export function createResendMailer(apiKey: string): Mailer {
  const resend = new Resend(apiKey)
  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'

  return {
    async send({ to, subject, text }) {
      const { error } = await resend.emails.send({ from, to, subject, text })
      if (error) throw new Error(`Resend: ${error.message}`)
    },
  }
}
