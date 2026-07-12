import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from './lib/env'
import { prisma } from './lib/prisma'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './routes/auth'
import farmsRouter from './routes/farms'
import fieldsRouter from './routes/fields'
import livestockRouter from './routes/livestock'
import cropsRouter from './routes/crops'
import usersRouter from './routes/users'

// App assembly lives here (separate from the listen() in index.ts) so tests
// can build the full middleware/route stack with supertest and no port.
export function createApp() {
  const app = express()

  // ── Middleware ───────────────────────────────────────────────────────
  app.use(helmet())
  app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  // ── Health check ─────────────────────────────────────────────────────
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

  // ── Routes ───────────────────────────────────────────────────────────
  app.use('/api/v1/auth', authRouter)
  app.use('/api/v1/farms', farmsRouter)
  app.use('/api/v1/fields', fieldsRouter)
  app.use('/api/v1/livestock', livestockRouter)
  app.use('/api/v1/crops', cropsRouter)
  app.use('/api/v1/users', usersRouter)

  // ── 404 ──────────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' }
    })
  })

  // ── Error handler (must be last) ─────────────────────────────────────
  app.use(errorHandler)

  return app
}
