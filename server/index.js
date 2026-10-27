// Optional server-side proxy. Use ONLY if the registrar permits server-originated
// access to its IPO status service. Registrars that browsers can't call directly
// (MUFG Intime) always go through here. It adds input validation, an origin
// allowlist and rate limiting, and never logs PAN values. The registrar logic is
// shared with the Azure Functions API: see src/registrars/proxyCore.js.
import 'dotenv/config'
import express from 'express'
import rateLimit from 'express-rate-limit'
import { handleIpos, handleStatus, readUpstreamUrls } from '../src/registrars/proxyCore.js'

const PORT = Number(process.env.PORT) || 8787
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

readUpstreamUrls() // fail fast on a non-https upstream URL

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)

app.use((req, res, next) => {
  const origin = req.get('origin')
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Accept')
    res.set('Vary', 'Origin')
  } else if (origin) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  res.set('Cache-Control', 'no-store')
  res.set('X-Content-Type-Options', 'nosniff')
  next()
})

app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    // Bulk checks send ~40 requests/minute (one every VITE_BULK_DELAY_MS).
    limit: Number(process.env.RATE_LIMIT_PER_MINUTE) || 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests' },
  }),
)
app.use(express.json({ limit: '1kb' }))

app.post('/api/ipo-status', async (req, res) => {
  const { status, body } = await handleStatus(req.body)
  res.status(status).json(body)
})

app.get('/api/ipos', async (req, res) => {
  const { status, body } = await handleIpos(req.query.registrar)
  res.status(status).json(body)
})

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

app.listen(PORT, () => {
  console.log(`IPO status proxy listening on http://localhost:${PORT}`)
})
