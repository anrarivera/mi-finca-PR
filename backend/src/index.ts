import { env } from './lib/env' // must be first — loads .env
import { createApp } from './app'

const app = createApp()
const PORT = env.PORT

// ── Start ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌱 Mi Finca PR API running on http://localhost:${PORT}`)
  console.log(`   Health:   http://localhost:${PORT}/health`)
  console.log(`   Auth:     http://localhost:${PORT}/api/v1/auth\n`)
})

export default app
