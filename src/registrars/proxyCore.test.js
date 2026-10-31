import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SOURCE_DIR, TARGET_DIR, sharedFiles } from '../../scripts/sync-api.mjs'
import { clearIpoListCache, handleIpos, handleStatus, readUpstreamUrls } from './proxyCore.js'

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
  afterEach(() => clearIpoListCache())

  const HTML = '<script defer="defer" src="./static/js/main.ab12.js"></script>'
  const bundle = (ids) => `const rf=JSON.parse('[${ids.map((id) => `{"clientId":"${id}","name":"IPO ${id}"}`).join(',')}]')`

  // Serves the site page, then the bundle, with the given IPO ids.
  function stubSite(ids, { fail = false } = {}) {
    const fetch = vi.fn(async (url) => {
      if (fail) throw new TypeError('offline')
      const text = String(url).endsWith('.js') ? bundle(ids) : HTML
      return { status: 200, ok: true, headers: new Headers(), text: async () => text }
    })
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it('reads the KFintech list live from the site bundle', async () => {
    const fetch = stubSite(['1', '2'])
    const result = await handleIpos('kfintech', {}, () => 1000)
    expect(result).toEqual({
      status: 200,
      body: { data: [{ clientId: '1', name: 'IPO 1' }, { clientId: '2', name: 'IPO 2' }], updatedAt: new Date(1000).toISOString() },
    })
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      'https://ipostatus.kfintech.com/',
      'https://ipostatus.kfintech.com/static/js/main.ab12.js',
    ])
  })

  it('reuses the list within the cache window and refetches after it', async () => {
    const fetch = stubSite(['1'])
    await handleIpos('kfintech', { IPO_LIST_CACHE_MS: '60000' }, () => 0)
    await handleIpos('kfintech', { IPO_LIST_CACHE_MS: '60000' }, () => 59_999)
    expect(fetch).toHaveBeenCalledTimes(2)

    stubSite(['3', '1'])
    const fresh = await handleIpos('kfintech', { IPO_LIST_CACHE_MS: '60000' }, () => 60_000)
    expect(fresh.body.data.map((ipo) => ipo.clientId)).toEqual(['3', '1'])
  })

  it('serves the last good list when the registrar is unreachable', async () => {
    stubSite(['1'])
    await handleIpos('kfintech', { IPO_LIST_CACHE_MS: '0' }, () => 0)
    stubSite([], { fail: true })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await handleIpos('kfintech', { IPO_LIST_CACHE_MS: '0' }, () => 10)).toMatchObject({
      status: 200,
      body: { data: [{ clientId: '1' }] },
    })
    clearIpoListCache()
    expect((await handleIpos('kfintech', {}, () => 20)).status).toBe(502)
    spy.mockRestore()
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
