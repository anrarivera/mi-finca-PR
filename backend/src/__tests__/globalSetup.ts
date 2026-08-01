// Jest globalSetup — runs once, in its own process, before any workers.
// Validates the test-database config (same guards as envSetup.ts) and
// pushes the current Prisma schema into the test database, creating it on
// first run.
import { execSync } from 'child_process'
import * as path from 'path'
import * as dotenv from 'dotenv'

export default async function globalSetup() {
  const backendRoot = path.resolve(__dirname, '../..')
  dotenv.config({ path: path.join(backendRoot, '.env') })

  const testUrl = process.env.TEST_DATABASE_URL
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL is not set — refusing to run backend tests.')
  }
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL equals DATABASE_URL — refusing to wipe the dev database.')
  }
  if (!new URL(testUrl).pathname.toLowerCase().includes('test')) {
    throw new Error(`Test database name must contain "test" (got "${new URL(testUrl).pathname}").`)
  }

  execSync('npx prisma db push --skip-generate', {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: testUrl, NODE_ENV: 'test' },
    stdio: 'inherit',
  })
}
