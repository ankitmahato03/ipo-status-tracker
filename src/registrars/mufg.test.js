import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { encryptToken, methodBase, mufg, parseSearchXml, readTables } from './mufg.js'

const BASE = 'https://in.mpms.mufg.com/Initial_Offer/IPO.aspx'

const SEARCH_XML = `<NewDataSet>
  <Table>
    <PEMNDG>2481234567</PEMNDG>
    <NAME1>JANE &amp; CO</NAME1>
    <SHARES>150</SHARES>
    <ALLOT>0</ALLOT>
    <offer_price>120.00</offer_price>
    <AMTADJ />
  </Table>
  <Table>
    <PEMNDG>2481234568</PEMNDG>
    <NAME1>JANE &amp; CO</NAME1>
    <SHARES>150</SHARES>
    <ALLOT>150</ALLOT>
  </Table>
</NewDataSet>`

function response(status, body, cookies = []) {
  const headers = new Headers()
  for (const c of cookies) headers.append('set-cookie', c)
  return { status, ok: status >= 200 && status < 300, headers, text: async () => JSON.stringify(body) }
}

describe('encryptToken', () => {
  it('matches the official page (AES-128-CBC, key = IV = 8080808080808080, PKCS#7, base64)', async () => {
    const key = Buffer.from('8080808080808080')
    const cipher = crypto.createCipheriv('aes-128-cbc', key, key)
    const expected = Buffer.concat([cipher.update('899629886', 'utf8'), cipher.final()]).toString('base64')
    await expect(encryptToken('899629886')).resolves.toBe(expected)
  })
})

describe('methodBase', () => {
  it('accepts the base or a method URL', () => {
    expect(methodBase(BASE)).toBe(BASE)
    expect(methodBase(`${BASE}/SearchOnPan`)).toBe(BASE)
    expect(methodBase(`${BASE}/`)).toBe(BASE)
  })
})

describe('XML parsing', () => {
  it('maps MUFG fields to app fields and keeps the rest', () => {
    expect(parseSearchXml(SEARCH_XML)).toEqual([
      { Appln_No: '2481234567', Name: 'JANE & CO', App_Shares: '150', All_Shares: '0', offer_price: '120.00', AMTADJ: '' },
      { Appln_No: '2481234568', Name: 'JANE & CO', App_Shares: '150', All_Shares: '150' },
    ])
  })

  it('treats an empty dataset as no record', () => {
    expect(parseSearchXml('<NewDataSet />')).toEqual([])
  })

  it('surfaces registrar messages from Table1', () => {
    expect(() => parseSearchXml('<NewDataSet><Table1><Msg>Invalid Request</Msg></Table1></NewDataSet>')).toThrow(
      /Invalid Request/,
    )
  })

  it('rejects non-DataSet responses', () => {
    expect(() => parseSearchXml('<html>error</html>')).toThrow(/unexpected format/)
  })

  it('does not confuse Table with Table1', () => {
    expect(readTables('<NewDataSet><Table1><Msg>x</Msg></Table1></NewDataSet>', 'Table')).toEqual([])
  })
})

describe('mufg.query', () => {
  it('gets a token, then searches with the encrypted token and the session cookie', async () => {
    const fetch = vi.fn(async (url) =>
      url.endsWith('/generateToken')
        ? response(200, { d: '899629886' }, ['ASP.NET_SessionId=abc123; path=/; HttpOnly'])
        : response(200, { d: SEARCH_XML }),
    )
    const records = await mufg.query({ pan: 'ABCDE1234F', clientId: '11968' }, { url: `${BASE}/SearchOnPan`, fetch })

    expect(records).toHaveLength(2)
    const [[tokenUrl], [searchUrl, searchInit]] = fetch.mock.calls
    expect(tokenUrl).toBe(`${BASE}/generateToken`)
    expect(searchUrl).toBe(`${BASE}/SearchOnPan`)
    expect(searchInit.method).toBe('POST')
    expect(searchInit.headers.Cookie).toBe('ASP.NET_SessionId=abc123')
    expect(JSON.parse(searchInit.body)).toEqual({
      clientid: '11968',
      PAN: 'ABCDE1234F',
      IFSC: '',
      CHKVAL: '1',
      token: await encryptToken('899629886'),
    })
  })

  it('maps HTTP errors', async () => {
    const fetch = vi.fn(async () => response(503, {}))
    await expect(mufg.query({ pan: 'ABCDE1234F', clientId: '1' }, { fetch })).rejects.toMatchObject({ kind: 'server' })
  })

  it('flags a response without a string d', async () => {
    const fetch = vi.fn(async () => response(200, { nope: 1 }))
    await expect(mufg.query({ pan: 'ABCDE1234F', clientId: '1' }, { fetch })).rejects.toMatchObject({ kind: 'malformed' })
  })
})

describe('mufg.listIpos', () => {
  it('reads company ids and names', async () => {
    const xml =
      '<NewDataSet><Table><company_id>11968</company_id><companyname>Paras Healthcare Limited - IPO</companyname></Table>' +
      '<Table><company_id>11966</company_id><companyname>Sahajanand Medical Technologies Limited -  IPO</companyname></Table></NewDataSet>'
    const fetch = vi.fn(async () => response(200, { d: xml }))
    await expect(mufg.listIpos({ fetch })).resolves.toEqual([
      { clientId: '11968', name: 'Paras Healthcare Limited - IPO' },
      { clientId: '11966', name: 'Sahajanand Medical Technologies Limited - IPO' },
    ])
    expect(fetch.mock.calls[0][0]).toBe(`${BASE}/GetDetails`)
  })
})
