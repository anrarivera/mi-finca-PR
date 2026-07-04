import { env } from './lib/env' // must be first — validates config, loads .env
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { prisma } from './lib/prisma'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './routes/auth'
import farmsRouter from './routes/farms'
import fieldsRouter from './routes/fields'
import livestockRouter from './routes/livestock'

const app = express()
const PORT = env.PORT

// ── Middleware ─────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))
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
app.use('/api/v1/fields', fieldsRouter)
app.use('/api/v1/livestock', livestockRouter)

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
})

export default app