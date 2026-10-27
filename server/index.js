// Optional server-side proxy. Use ONLY if the registrar permits server-originated
// access to its IPO status service. Registrars that browsers can't call directly
// (MUFG Intime) always go through here. It adds input validation, an origin
// allowlist and rate limiting, and never logs PAN values.
import 'dotenv/config'
import express from 'express'
import rateLimit from 'express-rate-limit'
import { DEFAULT_REGISTRAR_ID, getRegistrar } from '../src/registrars/index.js'
import { IpoApiError } from '../src/registrars/errors.js'

const PORT = Number(process.env.PORT) || 8787
// Upstream URL per registrar id; unset entries use the adapter's defaultUrl.
const UPSTREAM_URLS = {
  kfintech: process.env.KFIN_API_URL,
  mufg: process.env.MUFG_API_URL,
}
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS) || 15000
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const CLIENT_ID_REGEX = /^\d{1,20}$/

for (const [id, url] of Object.entries(UPSTREAM_URLS)) {
  if (url && !url.startsWith('https://')) throw new Error(`Upstream URL for "${id}" must use https://`)
}

const upstream = (registrar) => ({
  url: UPSTREAM_URLS[registrar.id] || registrar.defaultUrl,
  fetch,
  signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
})

// Maps adapter failures to a status code and the { error, kind } body the
// browser client understands.
function sendError(res, err) {
  if (err instanceof IpoApiError) {
    const status = err.status >= 400 ? err.status : 502
    return res.status(status).json({ error: err.message, kind: err.kind })
  }
  // Log the failure type only; never the request contents.
  console.error(`Upstream request failed: ${err?.name ?? 'Error'}`)
  const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
  res.status(timedOut ? 504 : 502).json({ error: timedOut ? 'Upstream timeout' : 'Upstream unavailable' })
}

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
  const registrar = getRegistrar(String(req.body?.registrar ?? DEFAULT_REGISTRAR_ID))
  const pan = String(req.body?.pan ?? '').trim().toUpperCase()
  const clientId = String(req.body?.clientId ?? '').trim()
  if (!registrar || !PAN_REGEX.test(pan) || !CLIENT_ID_REGEX.test(clientId)) {
    return res.status(400).json({ error: 'Invalid registrar, PAN or IPO identifier', kind: 'validation' })
  }

  try {
    res.json({ data: await registrar.query({ pan, clientId }, upstream(registrar)) })
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/ipos', async (req, res) => {
  const registrar = getRegistrar(String(req.query.registrar ?? ''))
  if (!registrar) return res.status(400).json({ error: 'Unknown registrar', kind: 'validation' })
  if (!registrar.listIpos) return res.json({ data: registrar.ipos })

  try {
    res.json({ data: await registrar.listIpos(upstream(registrar)) })
  } catch (err) {
    sendError(res, err)
  }
})

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

app.listen(PORT, () => {
  console.log(`IPO status proxy listening on http://localhost:${PORT}`)
})
