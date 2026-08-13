import 'dotenv/config' // load .env before anything reads process.env
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import path from 'path'
import fs from 'fs'
import { prisma } from './lib/prisma'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './routes/auth'
import farmsRouter from './routes/farms'
import fieldRoutes from './routes/fields'
import livestockRoutes from './routes/livestock'
import harvestRoutes from './routes/harvests'
import operationRoutes from './routes/operations'
import recommendedOperationRoutes from './routes/recommendedOperations'
import cropRoutes from './routes/crops'
import userRoutes from './routes/users'
import findingRoutes from './routes/findings'
import memberRoutes from './routes/members'
import cron from 'node-cron'
import { setMailer } from './lib/mailer'
import { createResendMailer } from './lib/resendMailer'
import { runDailyDigest } from './lib/dailyDigest'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// ── Production boot checks — fail at startup, not at first request ─────
if (IS_PRODUCTION) {
  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'FRONTEND_URL']
  const missing = required.filter(key => !process.env[key])
  if (missing.length > 0) {
    console.error(`[boot] Missing required env vars: ${missing.join(', ')}`)
    process.exit(1)
  }
  if (!process.env.RESEND_API_KEY) {
    console.warn('[boot] RESEND_API_KEY not set — emails will only be logged to console')
  }
  if (process.env.SIGNUP_MODE !== 'invite') {
    console.warn('[boot] SIGNUP_MODE is not "invite" — registration is OPEN to anyone')
  }
}

const app = express()
const PORT = process.env.PORT || 3001

// Behind Railway's HTTPS proxy every request arrives from the proxy's IP.
// Trusting one hop restores real client IPs, which the auth rate limiter
// keys on — without this, all users would share a single limit bucket.
if (IS_PRODUCTION) app.set('trust proxy', 1)

// ── Middleware ─────────────────────────────────────────────────────────
// In production helmet's CSP also governs the served frontend, so the
// image policy must admit the Esri satellite/boundary tiles the map loads.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      imgSrc: ["'self'", 'data:', 'blob:', 'https://server.arcgisonline.com'],
    },
  },
}))
app.use(compression())
// Dev convenience: a phone on the local network loads the Vite dev server
// at http://<LAN-IP>:5173, so private-network origins are accepted alongside
// localhost — but only outside production, where CORS stays pinned to
// FRONTEND_URL.
const ALLOWED_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173'
const PRIVATE_LAN_ORIGIN =
  /^http:\/\/(?:localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}):5173$/

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ALLOWED_ORIGIN
    : (origin, cb) => cb(null, !origin || origin === ALLOWED_ORIGIN || PRIVATE_LAN_ORIGIN.test(origin)),
  credentials: true,
}))
// Field saves send every plant as an individual lat/lng, so a large field
// (tens of acres, thousands of plants) produces a multi-megabyte body —
// Express's default 100kb limit rejected those saves with a 413.
app.use(express.json({ limit: '20mb' }))
app.use(cookieParser())

// ── Health check ───────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({
      success: true,
      data: {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      }
    })
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Database connection failed' }
    })
  }
})

// ── Routes ─────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/farms', farmsRouter)
app.use('/api/v1/farms/:farmId/fields', fieldRoutes)
app.use('/api/v1/farms/:farmId/livestock', livestockRoutes)
app.use('/api/v1/farms/:farmId/harvests', harvestRoutes)
// Operations log + recommendation calendar (SDD §4.5 / §4.6)
app.use('/api/v1/farms/:farmId/operations', operationRoutes)
app.use('/api/v1/farms/:farmId/recommended-operations', recommendedOperationRoutes)
// Scouting findings — pest observations + "crear labor" bridge
app.use('/api/v1/farms/:farmId/findings', findingRoutes)
// Farm team roster + membership management (roles phase 2)
app.use('/api/v1/farms/:farmId/members', memberRoutes)
app.use('/api/v1/crops', cropRoutes)
app.use('/api/v1/users', userRoutes)

// ── Static frontend (production) ───────────────────────────────────────
// One origin serves everything: the built frontend lands in backend/public
// at deploy time (root package.json build), which keeps the refresh
// cookie's sameSite:'strict' and the hostname-derived API URL working
// unchanged. Vite fingerprints /assets/* filenames, so those cache
// forever; index.html must always revalidate or users get stale releases.
const STATIC_DIR = path.resolve(__dirname, '../public')
if (IS_PRODUCTION && fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR, {
    index: false,
    setHeaders: (res, filePath) => {
      const assets = `${path.sep}assets${path.sep}`
      res.setHeader(
        'Cache-Control',
        filePath.includes(assets) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'
      )
    },
  }))
  // SPA fallback: any non-API GET renders the app shell and the router
  // takes it from there (/terms, /cuaderno, a reloaded deep link…).
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path === '/health') {
      return next()
    }
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(STATIC_DIR, 'index.html'))
  })
} else if (IS_PRODUCTION) {
  console.warn(`[boot] Static dir ${STATIC_DIR} not found — serving API only`)
}

// ── 404 ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' }
  })
})

// ── Error handler (must be last) ───────────────────────────────────────
app.use(errorHandler)

// ── Start ──────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  // Real email delivery when a Resend key is configured; console otherwise.
  if (process.env.RESEND_API_KEY) {
    setMailer(createResendMailer(process.env.RESEND_API_KEY))
  }

  // Daily digest — 6:00 AM island time, after the day's statuses settle.
  cron.schedule('0 6 * * *', async () => {
    const result = await runDailyDigest()
    console.log(`[digest] daily run: ${result.sent} sent, ${result.skipped} skipped`)
  }, { timezone: 'America/Puerto_Rico' })

  app.listen(PORT, () => {
    console.log(`\n🌱 Mi Finca PR API running on http://localhost:${PORT}`)
    console.log(`   Health:   http://localhost:${PORT}/health`)
    console.log(`   Auth:     http://localhost:${PORT}/api/v1/auth\n`)
    console.log(`   Farms:    http://localhost:${PORT}/api/v1/farms\n`)
  })
}

export default app