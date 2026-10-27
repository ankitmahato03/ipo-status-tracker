import { IpoApiError, errorForStatus, malformed } from './errors.js'

/*
 * MUFG Intime (formerly Link Intime) contract, as used by
 * https://in.mpms.mufg.com/Initial_Offer/public-issues.html (read from that
 * page's inline script on 2026-10-27). All calls are ASP.NET page methods:
 * POST JSON to IPO.aspx/<method>, response { "d": "<string>" }.
 *
 *   1. POST IPO.aspx/generateToken   {}  -> d = token. The token lives in the
 *      ASP.NET session, so the ASP.NET_SessionId cookie must be sent back.
 *   2. POST IPO.aspx/SearchOnPan
 *        { clientid, PAN, IFSC: "", CHKVAL: "1", token: AES(token) }
 *      -> d = XML: <NewDataSet><Table>…one per application…</Table></NewDataSet>,
 *         or <Table1><Msg>…</Msg></Table1> when the registrar rejects the query.
 *         An empty <NewDataSet /> means no record.
 *   3. POST IPO.aspx/GetDetails      {}  -> d = XML list of <Table><company_id/><companyname/></Table>
 *
 * The API sends a malformed CORS header, so browsers can't call it directly:
 * this registrar only works through the proxy (npm run server).
 */
export const DEFAULT_MUFG_URL = 'https://in.mpms.mufg.com/Initial_Offer/IPO.aspx'

// Fixed AES-128-CBC key and IV from the official page's encVal().
const TOKEN_KEY = '8080808080808080'

// MUFG field -> app field. Other fields are kept under their own names.
// PEMNDG is what the official page shows in the "Application Details - …"
// heading; treated as the application number (unverified with a live record).
const FIELD_MAP = { NAME1: 'Name', SHARES: 'App_Shares', ALLOT: 'All_Shares', PEMNDG: 'Appln_No' }

// Snapshot of GetDetails on 2026-10-27, used only if the live list can't load.
const IPOS = [
  { clientId: '11968', name: 'Paras Healthcare Limited - IPO' },
  { clientId: '11966', name: 'Sahajanand Medical Technologies Limited - IPO' },
  { clientId: '11967', name: 'Bonfiglioli Transmissions Limited - IPO' },
  { clientId: '11965', name: 'Ravita Engineering Services Limited - SME IPO' },
  { clientId: '11964', name: 'HD Fire Protect Limited - IPO' },
]

export async function encryptToken(token) {
  const bytes = new TextEncoder().encode(TOKEN_KEY)
  const key = await globalThis.crypto.subtle.importKey('raw', bytes, { name: 'AES-CBC' }, false, ['encrypt'])
  // WebCrypto AES-CBC always applies PKCS#7 padding, matching CryptoJS.pad.Pkcs7.
  const encrypted = await globalThis.crypto.subtle.encrypt({ name: 'AES-CBC', iv: bytes }, key, new TextEncoder().encode(token))
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)))
}

// Accepts the page-method base (…/IPO.aspx) or any method URL under it.
export function methodBase(url) {
  return String(url).replace(/\/+$/, '').replace(/\/(SearchOnPan|generateToken|GetDetails)$/i, '')
}

function decodeXml(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// The registrar returns flat DataSet XML (<Table><Field>value</Field>…</Table>),
// so a small regex reader is enough and works in both the browser and Node.
export function readTables(xml, tag) {
  const rows = []
  for (const [, body] of String(xml).matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))) {
    const row = {}
    for (const [, name, value] of body.matchAll(/<([\w.-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) row[name] = decodeXml(value.trim())
    for (const [, name] of body.matchAll(/<([\w.-]+)(?:\s[^>]*)?\/>/g)) row[name] ??= ''
    rows.push(row)
  }
  return rows
}

function toAppRecord(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [FIELD_MAP[key] ?? key, value]))
}

export function parseSearchXml(xml) {
  if (!/<NewDataSet[\s/>]/.test(xml)) throw malformed()
  const message = readTables(xml, 'Table1').find((row) => row.Msg)?.Msg
  if (message) throw new IpoApiError('registrar', `The registrar says: ${message}`)
  return readTables(xml, 'Table').map(toAppRecord)
}

function sessionCookie(response) {
  const cookies = response.headers?.getSetCookie?.() ?? [response.headers?.get?.('set-cookie')].filter(Boolean)
  const pairs = cookies.map((c) => c.split(';')[0].trim()).filter(Boolean)
  return pairs.length ? pairs.join('; ') : null
}

async function callMethod(base, method, body, { fetch, signal, cookie }) {
  const response = await fetch(`${base}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
    signal,
  })
  const text = await response.text()
  if (!response.ok) throw errorForStatus(response.status)
  let d
  try {
    d = JSON.parse(text).d
  } catch {
    throw malformed()
  }
  if (typeof d !== 'string') throw malformed()
  return { d, cookie: sessionCookie(response) ?? cookie }
}

export const mufg = {
  id: 'mufg',
  name: 'MUFG Intime (Link Intime)',
  defaultUrl: DEFAULT_MUFG_URL,
  browserDirect: false,
  ipos: IPOS,

  async query({ pan, clientId }, { url = DEFAULT_MUFG_URL, fetch, signal }) {
    const base = methodBase(url)
    const { d: token, cookie } = await callMethod(base, 'generateToken', {}, { fetch, signal })
    const { d: xml } = await callMethod(
      base,
      'SearchOnPan',
      { clientid: clientId, PAN: pan, IFSC: '', CHKVAL: '1', token: await encryptToken(token) },
      { fetch, signal, cookie },
    )
    return parseSearchXml(xml)
  },

  async listIpos({ url = DEFAULT_MUFG_URL, fetch, signal }) {
    const { d: xml } = await callMethod(methodBase(url), 'GetDetails', {}, { fetch, signal })
    return readTables(xml, 'Table')
      .filter((row) => /^\d+$/.test(row.company_id ?? '') && row.companyname)
      .map((row) => ({ clientId: row.company_id, name: row.companyname.replace(/\s+/g, ' ').trim() }))
  },
}
