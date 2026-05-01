import { Router, Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/jwt'
import { Errors } from '../lib/errors'
import { requireAuth } from '../middleware/auth'

const router = Router()

// ── Helper — set refresh token cookie ─────────────────────────────────
function setRefreshCookie(res: Response, token: string) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
    path: '/api/v1/auth',
  })
}

// ── Helper — clear refresh token cookie ───────────────────────────────
function clearRefreshCookie(res: Response) {
  res.clearCookie('refreshToken', { path: '/api/v1/auth' })
}

// ── Helper — save refresh token to DB ─────────────────────────────────
async function saveRefreshToken(userId: string, token: string) {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)
  await prisma.refreshToken.create({
    data: { userId, token, expiresAt }
  })
}

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/register
// ─────────────────────────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, fullName } = req.body

    // Basic validation
    if (!email || !password || !fullName) {
      throw Errors.validation('Email, password, and full name are required')
    }
    if (password.length < 8) {
      throw Errors.validation('Password must be at least 8 characters')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw Errors.validation('Invalid email address')
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })
    if (existing) {
      throw Errors.conflict('An account with this email already exists')
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Create user
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

    // Generate tokens
    const payload = { userId: user.id, email: user.email }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)

    // Save refresh token to DB
    await saveRefreshToken(user.id, refreshToken)

    // Set refresh token as HttpOnly cookie
    setRefreshCookie(res, refreshToken)

    res.status(201).json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          language: user.language,
          unitSystem: user.unitSystem,
          emailVerified: user.emailVerified,
        }
      }
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

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    // Generic error — don't reveal whether email exists
    if (!user || !user.passwordHash) {
      throw Errors.validation('Invalid email or password')
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      throw Errors.validation('Invalid email or password')
    }

    // Generate tokens
    const payload = { userId: user.id, email: user.email }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)

    // Save refresh token
    await saveRefreshToken(user.id, refreshToken)

    // Set cookie
    setRefreshCookie(res, refreshToken)

    res.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          language: user.language,
          unitSystem: user.unitSystem,
          emailVerified: user.emailVerified,
        }
      }
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
    if (!token) {
      throw Errors.unauthorized()
    }

    // Verify the refresh token signature
    const payload = verifyRefreshToken(token)

    // Check it exists in DB (not revoked)
    const stored = await prisma.refreshToken.findUnique({
      where: { token }
    })
    if (!stored || stored.expiresAt < new Date()) {
      clearRefreshCookie(res)
      throw Errors.unauthorized()
    }

    // Verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    })
    if (!user) {
      clearRefreshCookie(res)
      throw Errors.unauthorized()
    }

    // Rotate tokens — delete old, issue new
    await prisma.refreshToken.delete({ where: { token } })

    const newPayload = { userId: user.id, email: user.email }
    const newAccessToken = signAccessToken(newPayload)
    const newRefreshToken = signRefreshToken(newPayload)

    await saveRefreshToken(user.id, newRefreshToken)
    setRefreshCookie(res, newRefreshToken)

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          language: user.language,
          unitSystem: user.unitSystem,
          emailVerified: user.emailVerified,
        }
      }
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

    // Delete refresh token from DB if it exists
    if (token) {
      await prisma.refreshToken.deleteMany({
        where: { token }
      })
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

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        language: user.language,
        unitSystem: user.unitSystem,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      }
    })
  } catch (err) {
    next(err)
  }
})

export default router