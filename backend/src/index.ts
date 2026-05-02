import './env'  // must be first — sets process.env before anything else loads
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { prisma } from './lib/prisma'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './routes/auth'
import farmsRouter from './routes/farms'

const app = express()
const PORT = process.env.PORT || 3001

// ── Middleware ─────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
app.listen(PORT, () => {
  console.log(`\n🌱 Mi Finca PR API running on http://localhost:${PORT}`)
  console.log(`   Health:   http://localhost:${PORT}/health`)
  console.log(`   Auth:     http://localhost:${PORT}/api/v1/auth\n`)
  console.log(`   Farms:    http://localhost:${PORT}/api/v1/farms\n`)
})

export default app