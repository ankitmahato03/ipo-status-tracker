import { describe, expect, it, vi } from 'vitest'
import { MAX_ATTEMPTS, MAX_CONSECUTIVE_ERRORS, checkPans, readBulkDelay } from './bulkCheck.js'

const CONFIG = { mode: 'direct', url: 'https://example.test/prod/api/query?type=pan', timeoutMs: 1000 }
const PANS = ['ABCDE1234F', 'PQRST5678K', 'LMNOP9012Z']
const RECORD = { Appln_No: '1001', Name: 'A', App_Shares: '100', All_Shares: '0' }

const response = (status, body = '') => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
})

// Answers by PAN (the reqparam header); an array value is consumed one response per call.
function fetchByPan(responses) {
  return vi.fn(async (_url, init) => {
    const value = responses[init.headers.reqparam]
    return Array.isArray(value) ? value.shift() : value
  })
}

async function run(fetchImpl, pans = PANS) {
  const updates = []
  const sleep = vi.fn(async () => {})
  const outcome = await checkPans(pans, { clientId: '123' }, {
    onUpdate: (pan, result) => updates.push([pan, result]),
    sleep,
    delayMs: 1500,
    fetchOptions: { fetchImpl, config: CONFIG },
  })
  const finals = Object.fromEntries(updates.filter(([, r]) => r.status !== 'checking'))
  return { updates, finals, sleep, outcome }
}

describe('checkPans', () => {
  it('checks every PAN in order, one at a time, pausing between requests', async () => {
    const fetchImpl = fetchByPan({
      ABCDE1234F: response(200, { data: [RECORD] }),
      PQRST5678K: response(404),
      LMNOP9012Z: response(200, { data: [] }),
    })
    const { finals, sleep, outcome } = await run(fetchImpl)

    expect(fetchImpl.mock.calls.map(([, init]) => init.headers.reqparam)).toEqual(PANS)
    expect(finals.ABCDE1234F).toEqual({ status: 'done', records: [RECORD] })
    expect(finals.PQRST5678K).toEqual({ status: 'done', records: [] })
    expect(finals.LMNOP9012Z).toEqual({ status: 'done', records: [] })
    expect(sleep).toHaveBeenCalledTimes(PANS.length - 1)
    expect(sleep).toHaveBeenCalledWith(1500, undefined)
    expect(outcome).toEqual({})
  })

  it('retries rate-limited and server errors, then succeeds', async () => {
    const fetchImpl = fetchByPan({
      ABCDE1234F: [response(429), response(503), response(200, { data: [RECORD] })],
      PQRST5678K: response(404),
      LMNOP9012Z: response(404),
    })
    const { finals } = await run(fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(5)
    expect(finals.ABCDE1234F).toEqual({ status: 'done', records: [RECORD] })
  })

  it('gives up on a PAN after MAX_ATTEMPTS and moves on', async () => {
    const fetchImpl = fetchByPan({
      ABCDE1234F: response(500),
      PQRST5678K: response(404),
      LMNOP9012Z: response(404),
    })
    const { finals } = await run(fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_ATTEMPTS + 2)
    expect(finals.ABCDE1234F.status).toBe('error')
    expect(finals.ABCDE1234F.error.kind).toBe('server')
    expect(finals.PQRST5678K.status).toBe('done')
  })

  it('does not retry non-retryable errors', async () => {
    const fetchImpl = fetchByPan({ ABCDE1234F: response(403), PQRST5678K: response(404), LMNOP9012Z: response(404) })
    const { finals } = await run(fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(finals.ABCDE1234F.error.kind).toBe('forbidden')
  })

  it('stops the batch after several PANs fail in a row', async () => {
    const pans = ['AAAAA0001A', 'AAAAA0002A', 'AAAAA0003A', 'AAAAA0004A']
    const fetchImpl = vi.fn(async () => response(403))
    const { finals, outcome } = await run(fetchImpl, pans)
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_CONSECUTIVE_ERRORS)
    expect(outcome.stoppedOnError.kind).toBe('forbidden')
    expect(finals.AAAAA0004A).toBeUndefined()
  })

  it('stops without further updates once aborted', async () => {
    const controller = new AbortController()
    const updates = []
    const fetchImpl = vi.fn(async () => {
      controller.abort()
      return response(404)
    })
    await checkPans(PANS, { clientId: '123' }, {
      onUpdate: (pan, result) => updates.push([pan, result.status]),
      signal: controller.signal,
      sleep: async () => {},
      fetchOptions: { fetchImpl, config: CONFIG },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(updates.map(([pan]) => pan)).not.toContain('PQRST5678K')
  })
})

describe('readBulkDelay', () => {
  it('uses VITE_BULK_DELAY_MS when valid, else the default', () => {
    expect(readBulkDelay({ VITE_BULK_DELAY_MS: '500' })).toBe(500)
    expect(readBulkDelay({ VITE_BULK_DELAY_MS: 'abc' })).toBe(1500)
    expect(readBulkDelay({})).toBe(1500)
  })
})
