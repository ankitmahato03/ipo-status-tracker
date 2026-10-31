import { describe, expect, it, vi } from 'vitest'
import {
  IpoApiError,
  buildProxyRequest,
  extractRecords,
  fetchIpoList,
  fetchIpoStatus,
  parseResponseText,
  readApiConfig,
} from './ipoApi.js'
import { buildRequest } from '../registrars/kfintech.js'

const DIRECT = { mode: 'direct', url: 'https://example.test/prod/api/query?type=pan', timeoutMs: 1000 }
const QUERY = { pan: 'abcde1234f', clientId: '78061126051' }

const RECORD_A = { Appln_No: '1001', Name: 'A', Pan_No: 'ABCDE1234F', App_Shares: '100', All_Shares: '0' }
const RECORD_B = { Appln_No: '1002', Name: 'A', Pan_No: 'ABCDE1234F', App_Shares: '50', All_Shares: '50' }

function mockFetch(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return vi.fn(async () => ({ status, ok: status >= 200 && status < 300, text: async () => text }))
}

describe('extractRecords', () => {
  it('returns every record from the documented { data: [...] } shape', () => {
    expect(extractRecords({ data: [RECORD_A, RECORD_B] })).toEqual([RECORD_A, RECORD_B])
  })

  it('tolerates bare arrays, a single object, and nested data.data', () => {
    expect(extractRecords([RECORD_A])).toEqual([RECORD_A])
    expect(extractRecords({ data: RECORD_A })).toEqual([RECORD_A])
    expect(extractRecords({ data: { data: [RECORD_A, RECORD_B] } })).toEqual([RECORD_A, RECORD_B])
  })

  it('treats empty and null payloads as no records', () => {
    expect(extractRecords(null)).toEqual([])
    expect(extractRecords({ data: [] })).toEqual([])
    expect(extractRecords({ data: null })).toEqual([])
  })

  it('drops non-object array entries', () => {
    expect(extractRecords({ data: [RECORD_A, null, 'x', 3] })).toEqual([RECORD_A])
  })

  it('rejects unexpected structures instead of guessing', () => {
    expect(() => extractRecords({ message: 'Forbidden' })).toThrow(IpoApiError)
    expect(() => extractRecords({ data: 'oops' })).toThrow(IpoApiError)
    expect(() => extractRecords(42)).toThrow(IpoApiError)
  })
})

describe('parseResponseText', () => {
  it('flags malformed JSON', () => {
    try {
      parseResponseText('<html>')
      throw new Error('expected to throw')
    } catch (err) {
      expect(err.kind).toBe('malformed')
    }
  })

  it('treats an empty body as no records', () => {
    expect(parseResponseText('')).toEqual([])
  })
})

describe('readApiConfig', () => {
  it('defaults to direct mode against the KFintech endpoint', () => {
    const cfg = readApiConfig({})
    expect(cfg.mode).toBe('direct')
    expect(cfg.url).toMatch(/^https:\/\/0uz601ms56\.execute-api/)
  })

  it('switches to proxy mode', () => {
    expect(readApiConfig({ VITE_IPO_API_MODE: 'proxy' })).toMatchObject({ mode: 'proxy', url: '/api/ipo-status' })
  })
})

describe('request building', () => {
  it('refuses non-HTTPS KFintech URLs', () => {
    expect(() => buildRequest('http://insecure.test', 'ABCDE1234F', '1')).toThrow(/HTTPS/)
  })

  it('posts the registrar, PAN and IPO as JSON to the proxy', () => {
    const [url, init] = buildProxyRequest('/api/ipo-status', { registrar: 'mufg', pan: 'ABCDE1234F', clientId: '1' })
    expect(url).toBe('/api/ipo-status')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ registrar: 'mufg', pan: 'ABCDE1234F', clientId: '1' })
  })
})

describe('routing by registrar', () => {
  it('sends registrars browsers cannot call (MUFG) through the proxy even in direct mode', async () => {
    const fetchImpl = mockFetch(200, { data: [RECORD_A] })
    const records = await fetchIpoStatus({ ...QUERY, registrar: 'mufg' }, { fetchImpl, config: DIRECT })
    expect(records).toEqual([RECORD_A])
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/ipo-status')
    expect(JSON.parse(init.body)).toEqual({ registrar: 'mufg', pan: 'ABCDE1234F', clientId: '78061126051' })
  })

  it('sends KFintech through the proxy in proxy mode', async () => {
    const fetchImpl = mockFetch(200, { data: [] })
    await fetchIpoStatus(QUERY, { fetchImpl, config: { mode: 'proxy', url: '/api/ipo-status', timeoutMs: 1000 } })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).registrar).toBe('kfintech')
  })

  it('passes proxy error kinds and messages through', async () => {
    const fetchImpl = mockFetch(502, { error: 'The registrar says: Invalid token', kind: 'registrar' })
    await expect(fetchIpoStatus({ ...QUERY, registrar: 'mufg' }, { fetchImpl, config: DIRECT })).rejects.toMatchObject({
      kind: 'registrar',
      message: 'The registrar says: Invalid token',
    })
  })

  it('rejects unknown registrars', async () => {
    await expect(fetchIpoStatus({ ...QUERY, registrar: 'nope' }, { fetchImpl: mockFetch(200, {}), config: DIRECT })).rejects.toMatchObject({
      kind: 'config',
    })
  })
})

describe('fetchIpoList', () => {
  it('loads the KFintech live list through the proxy, even in direct mode', async () => {
    const fetchImpl = mockFetch(200, { data: [{ clientId: '72794313091', name: 'BLS POLYMERS LIMITED' }], updatedAt: 'x' })
    await expect(fetchIpoList('kfintech', { fetchImpl, config: DIRECT })).resolves.toEqual([
      { clientId: '72794313091', name: 'BLS POLYMERS LIMITED' },
    ])
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/ipos?registrar=kfintech')
  })

  it('loads the live list through the proxy', async () => {
    const fetchImpl = mockFetch(200, { data: [{ clientId: '11968', name: 'Paras Healthcare Limited - IPO' }] })
    await expect(fetchIpoList('mufg', { fetchImpl, config: DIRECT })).resolves.toEqual([
      { clientId: '11968', name: 'Paras Healthcare Limited - IPO' },
    ])
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/ipos?registrar=mufg')
  })
})

describe('fetchIpoStatus', () => {
  it('sends the PAN in reqparam and the IPO in client_id, and returns all records', async () => {
    const fetchImpl = mockFetch(200, { data: [RECORD_A, RECORD_B] })
    const records = await fetchIpoStatus(QUERY, { fetchImpl, config: DIRECT })

    expect(records).toHaveLength(2)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(DIRECT.url)
    expect(init.method).toBe('GET')
    expect(init.headers).toMatchObject({ reqparam: 'ABCDE1234F', client_id: '78061126051' })
  })

  it('maps 404 to an empty result', async () => {
    await expect(fetchIpoStatus(QUERY, { fetchImpl: mockFetch(404, ''), config: DIRECT })).resolves.toEqual([])
  })

  it.each([
    [429, 'rate_limited'],
    [403, 'forbidden'],
    [502, 'server'],
    [400, 'http'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    await expect(fetchIpoStatus(QUERY, { fetchImpl: mockFetch(status, '{}'), config: DIRECT })).rejects.toMatchObject({
      kind,
      status,
    })
  })

  it('reports malformed JSON on a 200', async () => {
    await expect(fetchIpoStatus(QUERY, { fetchImpl: mockFetch(200, 'not json'), config: DIRECT })).rejects.toMatchObject({
      kind: 'malformed',
    })
  })

  it('reports network failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(fetchIpoStatus(QUERY, { fetchImpl, config: DIRECT })).rejects.toMatchObject({ kind: 'network' })
  })

  it('times out', async () => {
    const fetchImpl = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    await expect(fetchIpoStatus(QUERY, { fetchImpl, config: { ...DIRECT, timeoutMs: 10 } })).rejects.toMatchObject({
      kind: 'timeout',
    })
  })

  it('validates before making a request', async () => {
    const fetchImpl = mockFetch(200, { data: [] })
    await expect(fetchIpoStatus({ pan: 'BAD', clientId: '1' }, { fetchImpl, config: DIRECT })).rejects.toMatchObject({
      kind: 'validation',
    })
    await expect(fetchIpoStatus({ pan: 'ABCDE1234F', clientId: '' }, { fetchImpl, config: DIRECT })).rejects.toMatchObject({
      kind: 'validation',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
