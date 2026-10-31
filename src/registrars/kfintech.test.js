import { describe, expect, it, vi } from 'vitest'
import { extractIpoList, findBundleUrl, kfintech } from './kfintech.js'

// Shape of the official bundle (main.f0d85b13.js, 2026-10-31), trimmed.
const BUNDLE =
  'function nf(e){}const rf=JSON.parse(\'[{"clientId":"72794313091","name":"BLS POLYMERS LIMITED"},' +
  '{"clientId":"78094207710","name":"LIGHTHOUSE COMMUNITIES FOUNDATION ZCZP OCTOBER 2026"}]\'),of={};' +
  'value:e.clientId,style:{}'

describe('findBundleUrl', () => {
  it('resolves the main bundle against the site URL', () => {
    const html = '<script defer="defer" src="./static/js/main.f0d85b13.js"></script>'
    expect(findBundleUrl(html)).toBe('https://ipostatus.kfintech.com/static/js/main.f0d85b13.js')
  })

  it('ignores missing and cross-origin bundles', () => {
    expect(findBundleUrl('<html></html>')).toBeNull()
    expect(findBundleUrl('<script src="https://evil.test/static/js/main.abc.js"></script>')).toBeNull()
  })
})

describe('extractIpoList', () => {
  it('reads the embedded list in site order', () => {
    expect(extractIpoList(BUNDLE)).toEqual([
      { clientId: '72794313091', name: 'BLS POLYMERS LIMITED' },
      { clientId: '78094207710', name: 'LIGHTHOUSE COMMUNITIES FOUNDATION ZCZP OCTOBER 2026' },
    ])
  })

  it('handles plain object literals, escapes and duplicates', () => {
    const source = `[{clientId:"1",name:"DR. REDDY'S  LAB"},{"clientId":"2","name":"A \\u0026 B"},{"clientId":"1","name":"dup"}]`
    expect(extractIpoList(source)).toEqual([
      { clientId: '1', name: "DR. REDDY'S LAB" },
      { clientId: '2', name: 'A & B' },
    ])
  })

  it('returns nothing when there is no list', () => {
    expect(extractIpoList('const x = 1')).toEqual([])
  })
})

describe('kfintech.listIpos', () => {
  const reply = (text, status = 200) => ({ status, ok: status < 400, text: async () => text })

  it('fetches the page, then the bundle it names', async () => {
    const fetch = vi.fn(async (url) =>
      url.endsWith('.js') ? reply(BUNDLE) : reply('<script src="./static/js/main.f0d85b13.js"></script>'),
    )
    const ipos = await kfintech.listIpos({ fetch })
    expect(ipos.map((ipo) => ipo.clientId)).toEqual(['72794313091', '78094207710'])
  })

  it('fails as malformed when the page has no bundle or the bundle no list', async () => {
    await expect(kfintech.listIpos({ fetch: async () => reply('<html></html>') })).rejects.toMatchObject({ kind: 'malformed' })
    const fetch = async (url) => (url.endsWith('.js') ? reply('nothing') : reply('<script src="/static/js/main.1.js"></script>'))
    await expect(kfintech.listIpos({ fetch })).rejects.toMatchObject({ kind: 'malformed' })
  })

  it('reports HTTP failures', async () => {
    await expect(kfintech.listIpos({ fetch: async () => reply('', 503) })).rejects.toMatchObject({ kind: 'server' })
  })
})
