import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(helmet())
app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Mi Finca PR API is running' })
})

app.listen(PORT, () => {
  console.log(`🌱 Mi Finca PR API running on http://localhost:${PORT}`)
})

export default app