import { fetchIpoStatus } from './ipoApi.js'

// Requests are sent one at a time with a pause between them, so a 40-PAN batch
// takes about a minute instead of hitting the registrar with a burst.
export const DEFAULT_BULK_DELAY_MS = 1500
export const MAX_ATTEMPTS = 3
const RATE_LIMIT_BACKOFF_MS = 15000
const ERROR_BACKOFF_MS = 3000

export function readBulkDelay(env = import.meta.env ?? {}) {
  const delay = Number(env.VITE_BULK_DELAY_MS)
  return Number.isFinite(delay) && delay >= 0 ? delay : DEFAULT_BULK_DELAY_MS
}

function wait(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted || ms <= 0) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })
}

/**
 * Checks each PAN against one IPO ({ registrar, clientId }), in order. Calls onUpdate(pan, result) as each
 * PAN starts ({ status: 'checking' }) and finishes ({ status: 'done', records }
 * or { status: 'error', error }). Retryable failures are retried with backoff.
 * Stops early, leaving the remaining PANs untouched, when signal aborts or when
 * MAX_CONSECUTIVE_ERRORS PANs fail in a row (the service is likely down or
 * blocking requests, so continuing would only fail slowly). Resolves to
 * { stoppedOnError } holding the last error in that case.
 */
export const MAX_CONSECUTIVE_ERRORS = 3

export async function checkPans(pans, { registrar, clientId }, { onUpdate, signal, delayMs, sleep = wait, fetchOptions } = {}) {
  const delay = delayMs ?? readBulkDelay()
  let first = true
  let consecutiveErrors = 0

  for (const pan of pans) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (!first) await sleep(delay, signal)
      first = false
      if (signal?.aborted) return {}
      onUpdate?.(pan, { status: 'checking', attempt })

      try {
        const records = await fetchIpoStatus({ pan, clientId, registrar }, { ...fetchOptions, signal })
        onUpdate?.(pan, { status: 'done', records })
        consecutiveErrors = 0
        break
      } catch (error) {
        if (signal?.aborted) return {}
        if (!error.retryable || attempt === MAX_ATTEMPTS) {
          onUpdate?.(pan, { status: 'error', error })
          consecutiveErrors += 1
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) return { stoppedOnError: error }
          break
        }
        await sleep(error.kind === 'rate_limited' ? RATE_LIMIT_BACKOFF_MS : ERROR_BACKOFF_MS, signal)
      }
    }
  }
  return {}
}
