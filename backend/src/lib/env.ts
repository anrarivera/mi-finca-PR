import 'dotenv/config'
import { z } from 'zod'

// ──────────────────────────────────────────────────────────────────────────
// Environment validation — fail fast at startup with a clear message instead
// of crashing later with `jwt.sign` receiving an undefined secret.
// ──────────────────────────────────────────────────────────────────────────

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:')
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`)
  }
  console.error('\n   Copy backend/.env.example to backend/.env and fill in the values.\n')
  process.exit(1)
}

export const env = parsed.data
