// Runs before any test file imports application code. src/lib/env.ts
// process.exit(1)s when configuration is missing, so the required variables
// must exist before the first import of anything that touches it. Tests
// never open a real database connection — src/lib/prisma is mocked — but
// DATABASE_URL still has to parse.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/mi_finca_test'
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789abcdef'
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789abcdef'
process.env.NODE_ENV = 'test'
