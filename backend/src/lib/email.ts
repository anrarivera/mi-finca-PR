import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
const APP_URL = process.env.APP_URL || 'http://localhost:5173'

export async function sendPasswordResetEmail(
  to: string,
  fullName: string,
  token: string
): Promise<void> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`

  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Restablecer contraseña — Mi Finca PR',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="margin:0;padding:0;background:#f5f8f0;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8f0;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr>
                  <td style="background:#2d4a1e;padding:32px 40px;text-align:center;">
                    <div style="font-size:32px;margin-bottom:8px;">🌱</div>
                    <div style="color:#d4e8b0;font-size:22px;font-weight:bold;">Mi Finca PR</div>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:40px;">
                    <h2 style="color:#2d4a1e;margin:0 0 16px;">Hola, ${fullName}</h2>
                    <p style="color:#444;line-height:1.6;margin:0 0 24px;">
                      Recibimos una solicitud para restablecer la contraseña de tu cuenta en Mi Finca PR.
                      Haz clic en el botón a continuación para crear una nueva contraseña.
                    </p>
                    <div style="text-align:center;margin:32px 0;">
                      <a href="${resetUrl}"
                         style="background:#639922;color:white;padding:14px 32px;border-radius:8px;
                                text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">
                        Restablecer contraseña
                      </a>
                    </div>
                    <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 8px;">
                      Este enlace expira en <strong>1 hora</strong>.
                    </p>
                    <p style="color:#666;font-size:13px;line-height:1.6;margin:0;">
                      Si no solicitaste restablecer tu contraseña, puedes ignorar este correo.
                      Tu contraseña actual permanece sin cambios.
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background:#f5f8f0;padding:24px 40px;text-align:center;border-top:1px solid #e0e8d8;">
                    <p style="color:#9aab8a;font-size:12px;margin:0;">
                      Mi Finca PR · Puerto Rico · 
                      <a href="${APP_URL}" style="color:#639922;text-decoration:none;">mifincapr.com</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  })
}

export async function sendEmailVerificationEmail(
  to: string,
  fullName: string,
  token: string
): Promise<void> {
  const verifyUrl = `${APP_URL}/verify-email?token=${token}`

  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Verifica tu correo — Mi Finca PR',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="margin:0;padding:0;background:#f5f8f0;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8f0;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <tr>
                  <td style="background:#2d4a1e;padding:32px 40px;text-align:center;">
                    <div style="font-size:32px;margin-bottom:8px;">🌱</div>
                    <div style="color:#d4e8b0;font-size:22px;font-weight:bold;">Mi Finca PR</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px;">
                    <h2 style="color:#2d4a1e;margin:0 0 16px;">¡Bienvenido, ${fullName}!</h2>
                    <p style="color:#444;line-height:1.6;margin:0 0 24px;">
                      Gracias por registrarte en Mi Finca PR. Por favor verifica tu dirección de 
                      correo electrónico haciendo clic en el botón a continuación.
                    </p>
                    <div style="text-align:center;margin:32px 0;">
                      <a href="${verifyUrl}"
                         style="background:#639922;color:white;padding:14px 32px;border-radius:8px;
                                text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">
                        Verificar correo electrónico
                      </a>
                    </div>
                    <p style="color:#666;font-size:13px;line-height:1.6;margin:0;">
                      Este enlace expira en <strong>24 horas</strong>.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f5f8f0;padding:24px 40px;text-align:center;border-top:1px solid #e0e8d8;">
                    <p style="color:#9aab8a;font-size:12px;margin:0;">
                      Mi Finca PR · Puerto Rico · 
                      <a href="${APP_URL}" style="color:#639922;text-decoration:none;">mifincapr.com</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  })
}