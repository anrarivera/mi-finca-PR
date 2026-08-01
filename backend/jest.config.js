/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Safety order matters: globalSetup provisions/validates the test DB;
  // envSetup redirects DATABASE_URL in each worker before any module can
  // construct a PrismaClient; setup.ts then opens/closes the connection.
  globalSetup: '<rootDir>/__tests__/globalSetup.ts',
  setupFiles: ['<rootDir>/__tests__/envSetup.ts'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  // All suites share one test database and cleanDatabase() wipes it between
  // tests — parallel workers would erase each other's data mid-test.
  maxWorkers: 1,
  testTimeout: 15000,
}