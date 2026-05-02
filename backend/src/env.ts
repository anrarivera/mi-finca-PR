// This file must be imported first in index.ts
// before any other imports that read process.env

const env = {
  PORT: process.env.PORT || '3001',
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:Pass4Postgres!@localhost:5432/mifincapr?schema=public',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'mifinca-access-secret-change-in-production',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'mifinca-refresh-secret-change-in-production',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
}

// Apply to process.env so all modules can read them
process.env.PORT = env.PORT
process.env.NODE_ENV = env.NODE_ENV
process.env.DATABASE_URL = env.DATABASE_URL
process.env.JWT_ACCESS_SECRET = env.JWT_ACCESS_SECRET
process.env.JWT_REFRESH_SECRET = env.JWT_REFRESH_SECRET
process.env.FRONTEND_URL = env.FRONTEND_URL

export default env