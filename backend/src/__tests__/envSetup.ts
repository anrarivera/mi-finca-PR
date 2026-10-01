// Runs (via jest setupFiles) in every worker BEFORE any test module is
// imported — i.e. before anything can construct a PrismaClient. Points
// DATABASE_URL at the test database and refuses to run without one:
// cleanDatabase() wipes every table, so aiming these tests at the dev
// database destroys real data.
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const testUrl = process.env.TEST_DATABASE_URL

if (!testUrl) {
  throw new Error(
    'TEST_DATABASE_URL is not set — refusing to run backend tests. ' +
    'Add it to backend/.env (it must point at a dedicated test database).'
  )
}
if (testUrl === process.env.DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL equals DATABASE_URL — refusing to run backend tests ' +
    'against the dev database (they wipe every table).'
  )
}
if (!new URL(testUrl).pathname.toLowerCase().includes('test')) {
  throw new Error(
    `The test database name must contain "test" (got "${new URL(testUrl).pathname}") — ` +
    'refusing to run backend tests against it.'
  )
}

// Prisma Client reads DATABASE_URL from process.env; values already present
// win over its own .env auto-loading, so this override is authoritative.
process.env.DATABASE_URL = testUrl
