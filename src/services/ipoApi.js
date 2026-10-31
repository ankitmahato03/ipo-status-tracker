import { isValidPanFormat, normalizePan } from '../utils/panValidation.js'
import { DEFAULT_REGISTRAR_ID, getRegistrar } from '../registrars/index.js'
import { IpoApiError, errorForStatus } from '../registrars/errors.js'
import { DEFAULT_API_URL, extractRecords, parseResponseText } from '../registrars/kfintech.js'

// Registrar contracts live in src/registrars/. This module picks the route:
// "direct" calls the registrar from the browser (only for registrars that allow
// it); everything else goes through the Express proxy in /server.
export { IpoApiError, extractRecords, parseResponseText }
export { DEFAULT_API_URL }
export const DEFAULT_PROXY_URL = '/api/ipo-status'
export const DEFAULT_IPO_LIST_URL = '/api/ipos'
export const DEFAULT_TIMEOUT_MS = 20000

// Local-setup hints only make sense in `npm run dev`, not on the deployed site.
const NETWORK_ERROR_MESSAGE = import.meta.env?.DEV
  ? 'Could not reach the IPO status service. Check your internet connection. If this keeps happening, the service may not allow requests from this site (CORS), or the proxy (npm run server) is not running; see the README.'
  : 'Could not reach the IPO status service. Check your internet connection and try again in a moment.'

export function readApiConfig(env = import.meta.env ?? {}) {
  const mode = env.VITE_IPO_API_MODE === 'proxy' ? 'proxy' : 'direct'
  const proxyUrl = env.VITE_IPO_PROXY_URL || DEFAULT_PROXY_URL
  const url = mode === 'proxy' ? proxyUrl : env.VITE_IPO_API_URL || DEFAULT_API_URL
  const timeout = Number(env.VITE_IPO_API_TIMEOUT_MS)
  return {
    mode,
    url,
    proxyUrl,
    ipoListUrl: env.VITE_IPO_LIST_URL || DEFAULT_IPO_LIST_URL,
    timeoutMs: timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  }
}

export function usesProxy(config, registrar) {
  return config.mode === 'proxy' || !registrar.browserDirect
}

export function buildProxyRequest(url, { registrar, pan, clientId }) {
  return [
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ registrar, pan, clientId }),
      cache: 'no-store',
    },
  ]
}

// The proxy answers { data } on success and { error, kind } on failure.
async function readProxyResponse(response) {
  const text = await response.text()
  if (response.ok) return parseResponseText(text)
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    // fall through to a status-based error
  }
  if (body?.kind && body?.error) throw new IpoApiError(body.kind, body.error, { status: response.status })
  throw errorForStatus(response.status)
}

function resolveRegistrar(id) {
  const registrar = getRegistrar(id ?? DEFAULT_REGISTRAR_ID)
  if (!registrar) throw new IpoApiError('config', `Unknown registrar "${id}".`)
  return registrar
}

// Runs a request with the configured timeout, linked to the caller's signal,
// and turns fetch failures into IpoApiErrors.
async function withTimeout(cfg, signal, run) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, cfg.timeoutMs)
  const onExternalAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    return await run(controller.signal)
  } catch (error) {
    if (error instanceof IpoApiError) throw error
    if (timedOut) throw new IpoApiError('timeout', 'The request timed out. Please try again.')
    if (signal?.aborted) throw new IpoApiError('aborted', 'The request was cancelled.')
    throw new IpoApiError('network', NETWORK_ERROR_MESSAGE)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onExternalAbort)
  }
}

/**
 * Fetches every application record for one PAN in one IPO at one registrar.
 * Resolves to an array of records (empty when none are found).
 * Rejects with IpoApiError. Never logs the PAN.
 */
export async function fetchIpoStatus({ pan, clientId, registrar: registrarId }, { signal, fetchImpl, config } = {}) {
  const cfg = config ?? readApiConfig()
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis)
  const normalizedPan = normalizePan(pan)
  const registrar = resolveRegistrar(registrarId)

  if (!isValidPanFormat(normalizedPan)) {
    throw new IpoApiError('validation', 'Enter a PAN in the format ABCDE1234F.')
  }
  if (!/^\d+$/.test(String(clientId ?? ''))) {
    throw new IpoApiError('validation', 'Select an IPO to check.')
  }

  const query = { pan: normalizedPan, clientId: String(clientId) }
  return withTimeout(cfg, signal, async (requestSignal) => {
    if (!usesProxy(cfg, registrar)) {
      return registrar.query(query, { url: cfg.url, fetch: doFetch, signal: requestSignal })
    }
    const proxyUrl = cfg.proxyUrl ?? (cfg.mode === 'proxy' ? cfg.url : DEFAULT_PROXY_URL)
    const [url, init] = buildProxyRequest(proxyUrl, { registrar: registrar.id, ...query })
    return readProxyResponse(await doFetch(url, { ...init, signal: requestSignal }))
  })
}

/**
 * Live IPO list for registrars that publish one (through the proxy).
 * Resolves to null when the registrar has no live list.
 */
export async function fetchIpoList(registrarId, { signal, fetchImpl, config } = {}) {
  const cfg = config ?? readApiConfig()
  const registrar = resolveRegistrar(registrarId)
  if (!registrar.listIpos) return null
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis)
  const url = `${cfg.ipoListUrl ?? DEFAULT_IPO_LIST_URL}?registrar=${encodeURIComponent(registrar.id)}`
  return withTimeout(cfg, signal, async (requestSignal) =>
    readProxyResponse(await doFetch(url, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', signal: requestSignal })),
  )
}
