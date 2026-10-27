import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SOURCE_DIR, TARGET_DIR, sharedFiles } from '../../scripts/sync-api.mjs'
import { handleIpos, handleStatus, readUpstreamUrls } from './proxyCore.js'

const KFIN_URL = 'https://kfin.test/query?type=pan'

afterEach(() => vi.unstubAllGlobals())

function stubFetch(status, body) {
  const fetch = vi.fn(async () => ({ status, ok: status < 400, headers: new Headers(), text: async () => JSON.stringify(body) }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('handleStatus', () => {
  it('rejects bad registrar, PAN and IPO id with 400', async () => {
    for (const body of [
      { registrar: 'nope', pan: 'ABCDE1234F', clientId: '1' },
      { pan: 'bad', clientId: '1' },
      { pan: 'ABCDE1234F', clientId: 'x' },
      null,
    ]) {
      expect(await handleStatus(body, {})).toMatchObject({ status: 400, body: { kind: 'validation' } })
    }
  })

  it('queries the registrar upstream and wraps records in { data }', async () => {
    const fetch = stubFetch(200, { data: [{ Name: 'A' }] })
    const result = await handleStatus({ pan: 'abcde1234f', clientId: '7' }, { KFIN_API_URL: KFIN_URL })
    expect(result).toEqual({ status: 200, body: { data: [{ Name: 'A' }] } })
    expect(fetch.mock.calls[0][0]).toBe(KFIN_URL)
    expect(fetch.mock.calls[0][1].headers).toMatchObject({ reqparam: 'ABCDE1234F', client_id: '7' })
  })

  it('passes adapter errors through with their kind and status', async () => {
    stubFetch(429, {})
    expect(await handleStatus({ pan: 'ABCDE1234F', clientId: '7' }, {})).toMatchObject({
      status: 429,
      body: { kind: 'rate_limited' },
    })
  })

  it('maps network failures to 502 without leaking details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('boom ABCDE1234F'))))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await handleStatus({ pan: 'ABCDE1234F', clientId: '7' }, {})
    expect(result).toEqual({ status: 502, body: { error: 'Upstream unavailable' } })
    expect(spy.mock.calls.flat().join(' ')).not.toContain('ABCDE1234F')
    spy.mockRestore()
  })
})

describe('handleIpos', () => {
  it('returns the built-in list for registrars without a live one', async () => {
    const result = await handleIpos('kfintech', {})
    expect(result.status).toBe(200)
    expect(result.body.data.length).toBeGreaterThan(0)
  })

  it('rejects unknown registrars', async () => {
    expect(await handleIpos('nope', {})).toMatchObject({ status: 400 })
    expect(await handleIpos(undefined, {})).toMatchObject({ status: 400 })
  })
})

describe('readUpstreamUrls', () => {
  it('requires https', () => {
    expect(() => readUpstreamUrls({ MUFG_API_URL: 'http://insecure.test' })).toThrow(/https/)
    expect(readUpstreamUrls({ KFIN_API_URL: KFIN_URL })).toEqual({ kfintech: KFIN_URL })
  })
})

describe('api/ copy of the registrar code', () => {
  it('is in sync with src/registrars (run npm run sync:api)', () => {
    expect(readdirSync(TARGET_DIR).sort()).toEqual(sharedFiles().sort())
    for (const file of sharedFiles()) {
      expect(readFileSync(join(TARGET_DIR, file), 'utf8'), file).toBe(readFileSync(join(SOURCE_DIR, file), 'utf8'))
    }
  })
})
