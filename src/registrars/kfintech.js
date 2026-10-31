import { IpoApiError, errorForStatus, malformed } from './errors.js'

/*
 * KFintech IPO status API contract, as used by https://ipostatus.kfintech.com/
 * (read from its public JS bundle; see README "Registrars"):
 *
 *   GET https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=pan
 *   Headers:
 *     reqparam:  <PAN>                 (uppercase, 10 chars)
 *     client_id: <IPO client id>       (selects which IPO to query)
 *   200 -> { "data": [ { Appln_No, Name, DP_CLID, Pan_No, App_Shares, All_Shares, category, ... } ] }
 *   404 -> no allotment record found
 *   429 -> too many requests
 *   5xx -> temporary failure
 *
 * No API key, session or CAPTCHA is used by the official site. Records already
 * use the app's field names, so they are returned as-is.
 */
export const DEFAULT_API_URL = 'https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=pan'

/*
 * IPO list. KFintech has no list endpoint: the official site embeds the list in
 * its JS bundle (main.<hash>.js) and redeploys the bundle whenever an IPO is
 * added. listIpos() reads it from whichever bundle the site serves right now:
 *
 *   1. GET https://ipostatus.kfintech.com/  -> <script src="./static/js/main.<hash>.js">
 *   2. GET that bundle                       -> JSON.parse('[{"clientId":"…","name":"…"}, …]')
 */
export const DEFAULT_SITE_URL = 'https://ipostatus.kfintech.com/'

// Fallback when the live list can't load. Mirrors the site as of 2026-10-31,
// newest first like the site; override with VITE_IPO_LIST.
const IPOS = [
  { clientId: '72794313091', name: 'BLS POLYMERS LIMITED' },
  { clientId: '78094207710', name: 'LIGHTHOUSE COMMUNITIES FOUNDATION ZCZP OCTOBER 2026' },
  { clientId: '78061126051', name: 'JIO PLATFORMS LIMITED' },
  { clientId: '47651989560', name: 'SOLLFEGE SMART ELECTRONICS LIMITED' },
  { clientId: '15211216040', name: 'TONBO IMAGING INDIA LIMITED' },
  { clientId: '32261845640', name: 'FUSION CX LIMITED' },
  { clientId: '75524247020', name: 'VAIBHAV VYAPAAR LIMITED' },
  { clientId: '29931891190', name: 'ZETWERK MANUFACTURING BUSINESSES LIMITED' },
]

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Accepts the documented { data: [...] } shape, plus tolerated variants
// (bare array, single object under data, nested data.data). Anything else is
// reported as malformed rather than guessed at.
export function extractRecords(body) {
  if (body === null || body === undefined || body === '') return []
  if (Array.isArray(body)) return body.filter(isPlainObject)
  if (!isPlainObject(body) || !('data' in body)) throw malformed()

  const { data } = body
  if (data === null || data === undefined) return []
  if (Array.isArray(data)) return data.filter(isPlainObject)
  if (isPlainObject(data)) return 'data' in data ? extractRecords(data) : [data]
  throw malformed()
}

export function parseResponseText(text) {
  if (!text || !text.trim()) return []
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw malformed()
  }
  return extractRecords(body)
}

export function buildRequest(url, pan, clientId) {
  if (!/^https:\/\//i.test(url)) {
    throw new IpoApiError('config', 'The IPO status API URL must use HTTPS.')
  }
  return [
    url,
    {
      method: 'GET',
      headers: { Accept: 'application/json', reqparam: pan, client_id: clientId },
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    },
  ]
}

// Finds the site's main bundle. Only same-origin bundles are accepted.
export function findBundleUrl(html, siteUrl = DEFAULT_SITE_URL) {
  const match = /<script\b[^>]*\bsrc=["']([^"']*\/main\.[0-9a-f]+\.js)["']/i.exec(String(html))
  if (!match) return null
  const url = new URL(match[1], siteUrl)
  return url.origin === new URL(siteUrl).origin ? url.href : null
}

function unescapeJs(text) {
  return text.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, seq) =>
    /^[ux][0-9a-f]/i.test(seq) && seq.length > 1 ? String.fromCharCode(parseInt(seq.slice(1), 16)) : seq,
  )
}

// Matches {"clientId":"…","name":"…"} entries, quoted or as plain object keys.
const IPO_ENTRY = /["']?clientId["']?\s*:\s*(["'])(\d{1,20})\1\s*,\s*["']?name["']?\s*:\s*(["'])((?:(?!\3)[^\\]|\\[\s\S])*)\3/g

// Reads the IPO list out of the bundle source, in the site's order, without duplicates.
export function extractIpoList(source) {
  const seen = new Set()
  const ipos = []
  for (const [, , clientId, , rawName] of String(source).matchAll(IPO_ENTRY)) {
    const name = unescapeJs(rawName).replace(/\s+/g, ' ').trim()
    if (!name || seen.has(clientId)) continue
    seen.add(clientId)
    ipos.push({ clientId, name })
  }
  return ipos
}

async function fetchText(url, { fetch, signal }) {
  const response = await fetch(url, { method: 'GET', cache: 'no-store', signal })
  const text = await response.text()
  if (!response.ok) throw errorForStatus(response.status)
  return text
}

export const kfintech = {
  id: 'kfintech',
  name: 'KFin Technologies',
  defaultUrl: DEFAULT_API_URL,
  // The official site calls the API from the browser, so direct mode can work.
  browserDirect: true,
  ipos: IPOS,

  async query({ pan, clientId }, { url = DEFAULT_API_URL, fetch, signal }) {
    const [requestUrl, init] = buildRequest(url, pan, clientId)
    const response = await fetch(requestUrl, { ...init, signal })
    const text = await response.text()
    // The official site treats 404 as "allotment status not found".
    if (response.status === 404) return []
    if (!response.ok) throw errorForStatus(response.status)
    return parseResponseText(text)
  },

  // Runs on the proxy only: the site doesn't allow cross-origin reads.
  async listIpos({ fetch, signal, siteUrl = DEFAULT_SITE_URL }) {
    const bundleUrl = findBundleUrl(await fetchText(siteUrl, { fetch, signal }), siteUrl)
    if (!bundleUrl) throw malformed()
    const ipos = extractIpoList(await fetchText(bundleUrl, { fetch, signal }))
    if (!ipos.length) throw malformed()
    return ipos
  },
}
