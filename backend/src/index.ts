// import './lib/env'  // must be first — sets process.env before anything else loads
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
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

// After the farms routes line:
const app = express()
const PORT = process.env.PORT || 3001

// ── Middleware ─────────────────────────────────────────────────────────
app.use(helmet())
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
app.use(express.json())
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
app.use('/api/v1/crops', cropRoutes)
app.use('/api/v1/users', userRoutes)

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
  app.listen(PORT, () => {
    console.log(`\n🌱 Mi Finca PR API running on http://localhost:${PORT}`)
    console.log(`   Health:   http://localhost:${PORT}/health`)
    console.log(`   Auth:     http://localhost:${PORT}/api/v1/auth\n`)
    console.log(`   Farms:    http://localhost:${PORT}/api/v1/farms\n`)
  })
}

export default app