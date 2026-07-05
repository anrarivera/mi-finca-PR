// ──────────────────────────────────────────────────────────────────────────
// Pluggable mail delivery (issues #9/#10). The default mailer prints to the
// server console — enough for development and for tests (which inject a
// capture mailer via setMailer). Wiring a real SMTP/SES transport later
// means implementing Mailer and calling setMailer at startup; every email
// flow already goes through this seam. Actual email/SMS notification
// delivery is issue #11.
// ──────────────────────────────────────────────────────────────────────────

export type MailMessage = {
  to: string
  subject: string
  text: string
}

export type Mailer = {
  send: (message: MailMessage) => Promise<void>
}

const consoleMailer: Mailer = {
  async send(message) {
    console.log(
      `\n📧 [mailer] To: ${message.to}` +
      `\n   Subject: ${message.subject}` +
      `\n   ${message.text.replace(/\n/g, '\n   ')}\n`
    )
  },
}

let activeMailer: Mailer = consoleMailer

export function setMailer(mailer: Mailer) {
  activeMailer = mailer
}

export function sendMail(message: MailMessage): Promise<void> {
  return activeMailer.send(message)
}
