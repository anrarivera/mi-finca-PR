import { Router, Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/jwt'
import { Errors } from '../lib/errors'
import { parseBody } from '../lib/validate'
import { requireAuth } from '../middleware/auth'

const router = Router()

// ── Rate limiting — slow down credential stuffing / brute force ───────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20, // 20 attempts per IP per window on sensitive endpoints
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Please try again later.',
      },
    })
  },
})

// ── Input schemas ──────────────────────────────────────────────────────
const registerSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  fullName: z.string().trim()
    .min(1, 'Full name is required')
    .max(100, 'Full name must be at most 100 characters'),
})

const loginSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

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
router.post('/register', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, fullName } = parseBody(registerSchema, req.body)

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
router.post('/login', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = parseBody(loginSchema, req.body)

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

    // Rotate tokens — strict single use: the old token is deleted the moment
    // it is redeemed, so a captured token cannot be replayed and logout
    // reliably ends the session. The "two tabs refresh at once" race is
    // handled client-side (the frontend serializes refreshes across tabs
    // with the Web Locks API), not by weakening rotation here.
    await prisma.refreshToken.delete({ where: { token } })

    // Opportunistic hygiene — expired rows for this user are dead weight.
    await prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    })

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
// No requireAuth here on purpose: a user with an *expired* access token
// must still be able to log out and revoke their refresh token. Deleting
// a refresh token requires possessing it (HttpOnly cookie), so this is
// safe without a valid access token.
// ─────────────────────────────────────────────────────────────────────
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
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