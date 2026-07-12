import dotenv from 'dotenv'

// Loads backend/.env and exposes the values directly (same approach as main).
dotenv.config()

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET!,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
  PORT: Number(process.env.PORT) || 3001,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  NODE_ENV: process.env.NODE_ENV || 'development',
}
