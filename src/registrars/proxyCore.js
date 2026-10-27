// Host-independent proxy logic, shared by the Express server (server/index.js)
// and the Azure Functions API (api/). Each host only parses the HTTP request and
// sends back the { status, body } this returns.
import { DEFAULT_REGISTRAR_ID, getRegistrar } from './index.js'
import { IpoApiError } from './errors.js'

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const CLIENT_ID_REGEX = /^\d{1,20}$/

// Upstream URL env var per registrar id; unset means the adapter's defaultUrl.
const UPSTREAM_ENV = { kfintech: 'KFIN_API_URL', mufg: 'MUFG_API_URL' }

export function readUpstreamUrls(env = process.env) {
  const urls = {}
  for (const [id, name] of Object.entries(UPSTREAM_ENV)) {
    const url = env[name]
    if (url && !url.startsWith('https://')) throw new Error(`${name} must use https://`)
    if (url) urls[id] = url
  }
  return urls
}

function upstream(registrar, env) {
  return {
    url: readUpstreamUrls(env)[registrar.id] || registrar.defaultUrl,
    fetch: globalThis.fetch,
    signal: AbortSignal.timeout(Number(env.UPSTREAM_TIMEOUT_MS) || 15000),
  }
}

// Maps adapter failures to a status code and the { error, kind } body the
// browser client understands.
function errorResult(err) {
  if (err instanceof IpoApiError) {
    return { status: err.status >= 400 ? err.status : 502, body: { error: err.message, kind: err.kind } }
  }
  // Log the failure type only; never the request contents.
  console.error(`Upstream request failed: ${err?.name ?? 'Error'}`)
  const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
  return { status: timedOut ? 504 : 502, body: { error: timedOut ? 'Upstream timeout' : 'Upstream unavailable' } }
}

export async function handleStatus(body, env = process.env) {
  const registrar = getRegistrar(String(body?.registrar ?? DEFAULT_REGISTRAR_ID))
  const pan = String(body?.pan ?? '').trim().toUpperCase()
  const clientId = String(body?.clientId ?? '').trim()
  if (!registrar || !PAN_REGEX.test(pan) || !CLIENT_ID_REGEX.test(clientId)) {
    return { status: 400, body: { error: 'Invalid registrar, PAN or IPO identifier', kind: 'validation' } }
  }
  try {
    return { status: 200, body: { data: await registrar.query({ pan, clientId }, upstream(registrar, env)) } }
  } catch (err) {
    return errorResult(err)
  }
}

export async function handleIpos(registrarId, env = process.env) {
  const registrar = getRegistrar(String(registrarId ?? ''))
  if (!registrar) return { status: 400, body: { error: 'Unknown registrar', kind: 'validation' } }
  if (!registrar.listIpos) return { status: 200, body: { data: registrar.ipos } }
  try {
    return { status: 200, body: { data: await registrar.listIpos(upstream(registrar, env)) } }
  } catch (err) {
    return errorResult(err)
  }
}
