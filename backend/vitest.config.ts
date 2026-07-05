import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Sets required env vars BEFORE src/lib/env.ts validates them.
    setupFiles: ['src/test/setup.ts'],
  },
})
