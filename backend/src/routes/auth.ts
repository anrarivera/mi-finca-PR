import { Router, Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import { prisma } from '../lib/prisma'
import {
  signAccessToken, signRefreshToken, verifyRefreshToken,
} from '../lib/jwt'
import { Errors } from '../lib/errors'
import { requireAuth } from '../middleware/auth'
import {
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
} from '../lib/email'

const router = Router()
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

// ── Helpers ───────────────────────────────────────────────────────────
function setRefreshCookie(res: Response, token: string) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth',
  })
}

function clearRefreshCookie(res: Response) {
  res.clearCookie('refreshToken', { path: '/api/v1/auth' })
}

async function saveRefreshToken(userId: string, token: string) {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)
  await prisma.refreshToken.create({ data: { userId, token, expiresAt } })
}

function buildUserResponse(user: {
  id: string; email: string; fullName: string;
  language: string; unitSystem: string; emailVerified: boolean
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    language: user.language,
    unitSystem: user.unitSystem,
    emailVerified: user.emailVerified,
  }
}

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/register
// ─────────────────────────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, fullName } = req.body

    if (!email || !password || !fullName) {
      throw Errors.validation('Email, password, and full name are required')
    }
    if (password.length < 8) {
      throw Errors.validation('Password must be at least 8 characters')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw Errors.validation('Invalid email address')
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })
    if (existing) {
      throw Errors.conflict('An account with this email already exists')
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        fullName,
        emailVerified: false,
        language: 'es',
        unitSystem: 'imperial',
      }
    })

    // Send verification email
    const verifyExpiry = new Date()
    verifyExpiry.setHours(verifyExpiry.getHours() + 24)
    const verifyRecord = await prisma.emailVerificationToken.create({
      data: { userId: user.id, expiresAt: verifyExpiry }
    })

    try {
      await sendEmailVerificationEmail(user.email, user.fullName, verifyRecord.token)
    } catch (emailErr) {
      // Don't fail registration if email fails — log and continue
      console.error('Failed to send verification email:', emailErr)
    }

    const payload = { userId: user.id, email: user.email }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)
    await saveRefreshToken(user.id, refreshToken)
    setRefreshCookie(res, refreshToken)

    res.status(201).json({
      success: true,
      data: { accessToken, user: buildUserResponse(user) }
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/login
// ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      throw Errors.validation('Email and password are required')
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (!user || !user.passwordHash) {
      throw Errors.validation('Invalid email or password')
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      throw Errors.validation('Invalid email or password')
    }

    const payload = { userId: user.id, email: user.email }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)
    await saveRefreshToken(user.id, refreshToken)
    setRefreshCookie(res, refreshToken)

    res.json({
      success: true,
      data: { accessToken, user: buildUserResponse(user) }
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/google
// Google OAuth — verify ID token, create or find user
// ─────────────────────────────────────────────────────────────────────
router.post('/google', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken } = req.body
    if (!idToken) throw Errors.validation('Google ID token is required')

    // Verify the token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })

    const googlePayload = ticket.getPayload()
    if (!googlePayload || !googlePayload.email) {
      throw Errors.validation('Invalid Google token')
    }

    const { sub: googleId, email, name, email_verified } = googlePayload
    const fullName = name || email.split('@')[0]

    // Find existing user by email
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (user) {
      // User exists — link Google account if not already linked
      const existingOAuth = await prisma.oAuthAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: googleId,
          }
        }
      })

      if (!existingOAuth) {
        await prisma.oAuthAccount.create({
          data: {
            userId: user.id,
            provider: 'google',
            providerAccountId: googleId,
          }
        })
      }

      // Update email verified status if Google says it's verified
      if (email_verified && !user.emailVerified) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: true }
        })
        user = { ...user, emailVerified: true }
      }
    } else {
      // New user — create account
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          fullName,
          emailVerified: email_verified ?? false,
          language: 'es',
          unitSystem: 'imperial',
          oauthAccounts: {
            create: {
              provider: 'google',
              providerAccountId: googleId,
            }
          }
        }
      })
    }

    const payload = { userId: user.id, email: user.email }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)
    await saveRefreshToken(user.id, refreshToken)
    setRefreshCookie(res, refreshToken)

    res.json({
      success: true,
      data: { accessToken, user: buildUserResponse(user) }
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/refresh
// ─────────────────────────────────────────────────────────────────────
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.refreshToken
    if (!token) throw Errors.unauthorized()

    const payload = verifyRefreshToken(token)

    const stored = await prisma.refreshToken.findUnique({ where: { token } })
    if (!stored || stored.expiresAt < new Date()) {
      clearRefreshCookie(res)
      throw Errors.unauthorized()
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user) {
      clearRefreshCookie(res)
      throw Errors.unauthorized()
    }

    await prisma.refreshToken.delete({ where: { token } })

    const newPayload = { userId: user.id, email: user.email }
    const newAccessToken = signAccessToken(newPayload)
    const newRefreshToken = signRefreshToken(newPayload)
    await saveRefreshToken(user.id, newRefreshToken)
    setRefreshCookie(res, newRefreshToken)

    res.json({
      success: true,
      data: { accessToken: newAccessToken, user: buildUserResponse(user) }
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/logout
// ─────────────────────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.refreshToken
    if (token) {
      await prisma.refreshToken.deleteMany({ where: { token } })
    }
    clearRefreshCookie(res)
    res.json({ success: true, data: { message: 'Logged out successfully' } })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/me
// ─────────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    })
    if (!user) throw Errors.notFound('User')

    res.json({ success: true, data: buildUserResponse(user) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/forgot-password
// ─────────────────────────────────────────────────────────────────────
router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body
    if (!email) throw Errors.validation('Email is required')

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    // Always return success — don't reveal if email exists
    if (!user) {
      res.json({
        success: true,
        data: { message: 'If an account exists, a reset email has been sent' }
      })
      return
    }

    // Invalidate any existing reset tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() }
    })

    // Create new reset token — expires in 1 hour
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 1)

    const resetRecord = await prisma.passwordResetToken.create({
      data: { userId: user.id, expiresAt }
    })

    await sendPasswordResetEmail(user.email, user.fullName, resetRecord.token)

    res.json({
      success: true,
      data: { message: 'If an account exists, a reset email has been sent' }
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/reset-password
// ─────────────────────────────────────────────────────────────────────
router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      throw Errors.validation('Token and new password are required')
    }
    if (password.length < 8) {
      throw Errors.validation('Password must be at least 8 characters')
    }

    // Find and validate the reset token
    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token }
    })

    if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
      throw Errors.validation('Reset token is invalid or has expired')
    }

    // Hash new password and update user
    const passwordHash = await bcrypt.hash(password, 12)

    await prisma.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash }
    })

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { token },
      data: { usedAt: new Date() }
    })

    // Invalidate all existing refresh tokens — force re-login everywhere
    await prisma.refreshToken.deleteMany({
      where: { userId: resetRecord.userId }
    })

    res.json({
      success: true,
      data: { message: 'Password reset successfully. Please log in with your new password.' }
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/verify-email
// ─────────────────────────────────────────────────────────────────────
router.post('/verify-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body
    if (!token) throw Errors.validation('Token is required')

    const record = await prisma.emailVerificationToken.findUnique({
      where: { token }
    })

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw Errors.validation('Verification token is invalid or has expired')
    }

    await prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true }
    })

    await prisma.emailVerificationToken.update({
      where: { token },
      data: { usedAt: new Date() }
    })

    res.json({
      success: true,
      data: { message: 'Email verified successfully' }
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/resend-verification
// ─────────────────────────────────────────────────────────────────────
router.post('/resend-verification', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    })
    if (!user) throw Errors.notFound('User')

    if (user.emailVerified) {
      res.json({ success: true, data: { message: 'Email already verified' } })
      return
    }

    // Invalidate existing verification tokens
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() }
    })

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    const verifyRecord = await prisma.emailVerificationToken.create({
      data: { userId: user.id, expiresAt }
    })

    await sendEmailVerificationEmail(user.email, user.fullName, verifyRecord.token)

    res.json({
      success: true,
      data: { message: 'Verification email sent' }
    })
  } catch (err) {
    next(err)
  }
})

export default router